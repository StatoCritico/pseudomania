# SPDX-License-Identifier: AGPL-3.0-or-later
"""Dizionario segnaposto -> valore cifrato dall'estensione, per scope e per utente.

Regole (DECISIONI.md):
- tag `[TIPO_N]`, N progressivo per (scope, TIPO); stesso valore normalizzato nello
  stesso scope -> stesso tag (ricerca per value_hmac, HMAC con chiave in OpenBao);
- il server NON conserva mai il valore in chiaro: una voce nasce "in attesa" (solo
  hmac -> tag) e diventa ripristinabile quando l'estensione carica ciphertext, iv e keyId
  (POST /v1/dictionary/entries) entro PENDING_ENTRY_MINUTES; se il caricamento non arriva,
  la voce viene riproposta in `newEntries` la prossima volta che il valore ricompare;
- ogni utente vede solo i propri scope (owner_pseudonym in ogni query).
"""

from __future__ import annotations

import base64
import binascii
import logging
import re
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import and_, delete, func, insert, select, update
from sqlalchemy.engine import Engine
from sqlalchemy.exc import IntegrityError

from .db import as_utc, dict_entries, dict_scopes, utcnow
from .errors import BadRequest, Conflict
from .policy import normalize
from .registri import log_deletion

log = logging.getLogger("pseudogate.dictionary")

SCOPE_TYPES = ("conversation", "project")
_SCOPE_ID_RX = re.compile(r"^(?:pending:)?[A-Za-z0-9][A-Za-z0-9_-]{0,127}$")
_TAG_RX = re.compile(r"^\[([A-Z][A-Z_]*?)_(\d+)\]$")
_UUID_RX = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
MAX_CIPHERTEXT_B64 = 8192


@dataclass(frozen=True)
class Scope:
    type: str
    id: str

    @property
    def pending(self) -> bool:
        return self.id.startswith("pending:")


@dataclass(frozen=True)
class Assigned:
    tag: str
    type: str
    needs_upload: bool


def make_scope(scope_type: str, scope_id: str) -> Scope:
    if scope_type not in SCOPE_TYPES:
        raise BadRequest("Tipo di scope non valido: usa 'conversation' o 'project'.")
    if not scope_id or not _SCOPE_ID_RX.match(scope_id):
        raise BadRequest("Identificativo di scope non valido.")
    return Scope(scope_type, scope_id)


def valid_key_id(key_id: str) -> bool:
    return bool(key_id) and bool(_UUID_RX.match(key_id))


def _b64_len(value: str) -> int:
    try:
        return len(base64.b64decode(value, validate=True))
    except (binascii.Error, ValueError):
        return -1


def _where(owner: str, scope: Scope, table=dict_entries):
    return and_(table.c.owner_pseudonym == owner, table.c.scope_type == scope.type,
                table.c.scope_id == scope.id)


class DictionaryStore:
    def __init__(self, engine: Engine, keys, settings, keystore=None):
        self.engine = engine
        self.keys = keys
        self.s = settings
        self.keystore = keystore

    # ------------------------------------------------------------------ scope
    def _touch_scope(self, conn, owner: str, scope: Scope, now: datetime) -> None:
        n = conn.execute(update(dict_scopes).where(_where(owner, scope, dict_scopes))
                         .values(last_used_at=now)).rowcount
        if not n:
            conn.execute(insert(dict_scopes).values(scope_type=scope.type, scope_id=scope.id,
                                                    owner_pseudonym=owner, created_at=now,
                                                    last_used_at=now))

    def touch(self, owner: str, scope: Scope) -> None:
        with self.engine.begin() as conn:
            self._touch_scope(conn, owner, scope, utcnow())

    def confirm(self, owner: str, scope: Scope) -> None:
        if scope.type != "project":
            raise BadRequest("La conferma annuale riguarda solo i progetti.")
        now = utcnow()
        with self.engine.begin() as conn:
            self._touch_scope(conn, owner, scope, now)
            conn.execute(update(dict_scopes).where(_where(owner, scope, dict_scopes))
                         .values(confirmed_at=now))

    def scope_info(self, owner: str, scope: Scope) -> dict:
        with self.engine.connect() as conn:
            r = conn.execute(select(dict_scopes).where(_where(owner, scope, dict_scopes))).mappings().first()
        now = utcnow()
        created = as_utc(r["created_at"]) if r else now
        last = as_utc(r["last_used_at"]) if r else now
        confirmed = as_utc(r["confirmed_at"]) if r and r["confirmed_at"] else None
        if scope.pending:
            return {"expiresAt": created + timedelta(hours=self.s.pending_scope_ttl_hours),
                    "confirmBy": None}
        if scope.type == "conversation":
            return {"expiresAt": last + timedelta(days=self.s.dict_ttl_conversation_days),
                    "confirmBy": None}
        confirm_by = (confirmed or created) + timedelta(days=self.s.project_confirm_interval_days)
        inactivity = last + timedelta(days=self.s.dict_ttl_project_inactivity_days)
        return {"expiresAt": min(inactivity, confirm_by), "confirmBy": confirm_by}

    # ------------------------------------------------------------------ assign
    def assign(self, owner: str, scope: Scope, items: list[tuple[str, str]]) -> dict[str, Assigned]:
        """items = [(tipo, valore_originale)] -> {valore_normalizzato: Assigned}.
        Il valore in chiaro NON viene scritto: si salva solo il suo HMAC."""
        firsts: dict[str, str] = {}
        for etype, value in items:
            n = normalize(value)
            if n and n not in firsts:
                firsts[n] = etype.upper()
        if not firsts:
            return {}
        norms = list(firsts)
        hmacs = self.keys.value_hmacs(owner, norms)
        by_hmac = dict(zip(hmacs, norms, strict=True))

        for attempt in range(5):
            now = utcnow()
            pending_until = now + timedelta(minutes=self.s.pending_entry_minutes)
            result: dict[str, Assigned] = {}
            try:
                with self.engine.begin() as conn:
                    rows = conn.execute(
                        select(dict_entries.c.value_hmac, dict_entries.c.tag,
                               dict_entries.c.entity_type, dict_entries.c.ciphertext)
                        .where(_where(owner, scope), dict_entries.c.value_hmac.in_(hmacs))).all()
                    reoffer = []
                    for h, tag, et, ct in rows:
                        result[by_hmac[h]] = Assigned(tag, et, ct is None)
                        if ct is None:
                            reoffer.append(h)
                    missing = [h for h in hmacs if by_hmac[h] not in result]
                    if missing:
                        counters: dict[str, int] = {}
                        for (tag,) in conn.execute(select(dict_entries.c.tag).where(_where(owner, scope))):
                            m = _TAG_RX.match(tag)
                            if m:
                                counters[m.group(1)] = max(counters.get(m.group(1), 0), int(m.group(2)))
                        new_rows = []
                        for h in missing:
                            etype = firsts[by_hmac[h]]
                            counters[etype] = counters.get(etype, 0) + 1
                            tag = f"[{etype}_{counters[etype]}]"
                            new_rows.append(dict(scope_type=scope.type, scope_id=scope.id,
                                                 owner_pseudonym=owner, tag=tag, entity_type=etype,
                                                 value_hmac=h, pending_until=pending_until,
                                                 created_at=now, last_used_at=now))
                            result[by_hmac[h]] = Assigned(tag, etype, True)
                        conn.execute(dict_entries.insert(), new_rows)
                    existing = [h for h in hmacs if h not in missing]
                    if existing:
                        conn.execute(update(dict_entries)
                                     .where(_where(owner, scope), dict_entries.c.value_hmac.in_(existing))
                                     .values(last_used_at=now))
                    if reoffer:
                        conn.execute(update(dict_entries)
                                     .where(_where(owner, scope), dict_entries.c.value_hmac.in_(reoffer))
                                     .values(pending_until=pending_until))
                    self._touch_scope(conn, owner, scope, now)
                return result
            except IntegrityError:
                log.info("Conflitto di assegnazione tag (tentativo %d), riprovo", attempt + 1)
        raise Conflict("Troppe richieste concorrenti sulla stessa conversazione: riprova.")

    # ------------------------------------------------------------------ upload
    def upload(self, owner: str, scope: Scope, entries: list[dict]) -> tuple[int, list[dict]]:
        """Salva ciphertext/iv/keyId delle voci in attesa. -> (salvate, rifiutate)."""
        now = utcnow()
        rejected: list[dict] = []
        good: list[dict] = []
        key_ids = set()
        for e in entries:
            tag, ct, iv, kid = e.get("tag"), e.get("ciphertext"), e.get("iv"), e.get("keyId")
            if not isinstance(tag, str) or not _TAG_RX.match(tag):
                rejected.append({"tag": tag, "reason": "tag_non_valido"})
            elif not isinstance(kid, str) or not valid_key_id(kid):
                rejected.append({"tag": tag, "reason": "keyId_non_valido"})
            elif not isinstance(iv, str) or _b64_len(iv) != 12:
                rejected.append({"tag": tag, "reason": "iv_non_valido"})
            elif (not isinstance(ct, str) or len(ct) > MAX_CIPHERTEXT_B64
                  or _b64_len(ct) < 17):  # almeno 1 byte + tag GCM di 16 byte
                rejected.append({"tag": tag, "reason": "ciphertext_non_valido"})
            else:
                good.append(e)
                key_ids.add(kid)
        if self.keystore is not None:
            known = self.keystore.owner_keys(owner, key_ids)
            for e in list(good):
                if e["keyId"] not in known:
                    good.remove(e)
                    rejected.append({"tag": e["tag"], "reason": "keyId_senza_escrow"})
        stored = 0
        used_keys = set()
        with self.engine.begin() as conn:
            for e in good:
                n = conn.execute(
                    update(dict_entries)
                    .where(_where(owner, scope), dict_entries.c.tag == e["tag"],
                           dict_entries.c.ciphertext.is_(None),
                           dict_entries.c.pending_until >= now)
                    .values(ciphertext=e["ciphertext"], iv=e["iv"], key_id=e["keyId"],
                            uploaded_at=now, pending_until=None, last_used_at=now)).rowcount
                if n:
                    stored += 1
                    used_keys.add(e["keyId"])
                else:
                    rejected.append({"tag": e["tag"], "reason": "non_in_attesa_o_scaduta"})
            if stored:
                self._touch_scope(conn, owner, scope, now)
        if used_keys and self.keystore is not None:
            self.keystore.mark_has_entries(used_keys)
        return stored, rejected

    # ----------------------------------------------------------------- lettura
    def entries(self, owner: str, scope: Scope, touch: bool = True) -> dict[str, dict]:
        with self.engine.connect() as conn:
            rows = conn.execute(select(dict_entries.c.tag, dict_entries.c.ciphertext,
                                       dict_entries.c.iv, dict_entries.c.key_id,
                                       dict_entries.c.aad_scope)
                                .where(_where(owner, scope), dict_entries.c.ciphertext.is_not(None))
                                .order_by(dict_entries.c.id)).all()
        if touch and rows:
            self.touch(owner, scope)
        out = {}
        for t, c, i, k, aad in rows:
            e = {"ciphertext": c, "iv": i, "keyId": k}
            if aad:  # voce cifrata quando lo scope era un altro (pending:... prima del rebind)
                st, _, sid = aad.partition("|")
                e["aadScope"] = {"type": st, "id": sid}
            out[t] = e
        return out

    def tags_in_scope(self, owner: str, scope: Scope) -> set[str]:
        with self.engine.connect() as conn:
            return {r[0] for r in conn.execute(select(dict_entries.c.tag).where(_where(owner, scope)))}

    # ----------------------------------------------------------------- rotazione
    def list_for_key(self, owner: str, key_id: str, after: int = 0, limit: int = 500):
        with self.engine.connect() as conn:
            rows = conn.execute(
                select(dict_entries.c.id, dict_entries.c.scope_type, dict_entries.c.scope_id,
                       dict_entries.c.tag, dict_entries.c.ciphertext, dict_entries.c.iv,
                       dict_entries.c.key_id, dict_entries.c.aad_scope)
                .where(dict_entries.c.owner_pseudonym == owner, dict_entries.c.key_id == key_id,
                       dict_entries.c.id > after)
                .order_by(dict_entries.c.id).limit(limit + 1)).all()
        more = len(rows) > limit
        rows = rows[:limit]
        out = []
        for r in rows:
            e = {"scope": {"type": r[1], "id": r[2]}, "tag": r[3], "ciphertext": r[4], "iv": r[5],
                 "keyId": r[6]}
            if r[7]:
                st, _, sid = r[7].partition("|")
                e["aadScope"] = {"type": st, "id": sid}
            out.append(e)
        return out, (rows[-1][0] if more and rows else None)

    def count_for_key(self, key_id: str, owner: str | None = None) -> int:
        q = select(func.count()).select_from(dict_entries).where(dict_entries.c.key_id == key_id)
        if owner:
            q = q.where(dict_entries.c.owner_pseudonym == owner)
        with self.engine.connect() as conn:
            return int(conn.execute(q).scalar())

    def rekey(self, owner: str, old_key: str, new_key: str, entries: list[dict]) -> tuple[int, int]:
        """Sostituisce ciphertext/iv delle voci cifrate con old_key. -> (aggiornate, rimaste)."""
        now = utcnow()
        updated = 0
        with self.engine.begin() as conn:
            for e in entries:
                sc = e.get("scope") or {}
                scope = make_scope(str(sc.get("type")), str(sc.get("id")))
                iv, ct = e.get("iv"), e.get("ciphertext")
                if not (isinstance(iv, str) and _b64_len(iv) == 12 and isinstance(ct, str)
                        and len(ct) <= MAX_CIPHERTEXT_B64 and _b64_len(ct) >= 17):
                    raise BadRequest(f"Voce non valida: {e.get('tag')}")
                updated += conn.execute(
                    update(dict_entries)
                    .where(_where(owner, scope), dict_entries.c.tag == e.get("tag"),
                           dict_entries.c.key_id == old_key)
                    .values(ciphertext=ct, iv=iv, key_id=new_key, uploaded_at=now,
                            aad_scope=None)).rowcount  # ricifrato con l'AAD dello scope attuale
        return updated, self.count_for_key(old_key, owner)

    # ------------------------------------------------------------- gestione
    def rebind(self, owner: str, src: Scope, dst: Scope) -> int:
        """Sposta il dizionario di uno scope temporaneo (pending:...) su quello definitivo.
        Con voci in conflitto nella destinazione -> 409."""
        if src == dst:
            return 0
        with self.engine.begin() as conn:
            src_rows = conn.execute(select(dict_entries.c.id, dict_entries.c.tag,
                                           dict_entries.c.value_hmac)
                                    .where(_where(owner, src))).all()
            if not src_rows:
                return 0
            dst_rows = conn.execute(select(dict_entries.c.tag, dict_entries.c.value_hmac)
                                    .where(_where(owner, dst))).all()
            dst_by_tag = {t: h for t, h in dst_rows}
            dst_by_hmac = {h: t for t, h in dst_rows}
            move_ids, dup_ids = [], []
            for rid, tag, h in src_rows:
                if tag in dst_by_tag:
                    if dst_by_tag[tag] == h:
                        dup_ids.append(rid)
                        continue
                    raise Conflict("Lo scope di destinazione usa già gli stessi segnaposto per "
                                   "valori diversi.", code="rebind_conflict")
                if h in dst_by_hmac:
                    raise Conflict("Lo scope di destinazione associa già questo valore a un "
                                   "segnaposto diverso.", code="rebind_conflict")
                move_ids.append(rid)
            if dup_ids:
                conn.execute(delete(dict_entries).where(dict_entries.c.id.in_(dup_ids)))
            if move_ids:
                # l'AAD dei valori già cifrati resta quello dello scope di origine
                conn.execute(update(dict_entries).where(dict_entries.c.id.in_(move_ids),
                                                        dict_entries.c.ciphertext.is_not(None),
                                                        dict_entries.c.aad_scope.is_(None))
                             .values(aad_scope=f"{src.type}|{src.id}"))
                conn.execute(update(dict_entries).where(dict_entries.c.id.in_(move_ids))
                             .values(scope_type=dst.type, scope_id=dst.id))
            conn.execute(delete(dict_scopes).where(_where(owner, src, dict_scopes)))
            self._touch_scope(conn, owner, dst, utcnow())
            return len(move_ids)

    def delete_scope(self, owner: str, scope: Scope, reason: str = "utente") -> tuple[int, set[str]]:
        """Cancella le voci dello scope. -> (voci cancellate, keyId coinvolti)."""
        with self.engine.begin() as conn:
            key_ids = {r[0] for r in conn.execute(
                select(dict_entries.c.key_id).where(_where(owner, scope),
                                                    dict_entries.c.key_id.is_not(None)).distinct())}
            n = conn.execute(delete(dict_entries).where(_where(owner, scope))).rowcount
            conn.execute(delete(dict_scopes).where(_where(owner, scope, dict_scopes)))
            if n:
                log_deletion(conn, reason=reason, object="scope", owner=owner,
                             scope_type=scope.type, scope_id=scope.id, count=n)
        return n, key_ids

    def expired_scopes(self, now: datetime | None = None) -> list[tuple[str, str, str]]:
        """Scope scaduti secondo DECISIONI.md -> [(owner, scope_type, scope_id)]."""
        now = now or utcnow()
        conv_cut = now - timedelta(days=self.s.dict_ttl_conversation_days)
        proj_cut = now - timedelta(days=self.s.dict_ttl_project_inactivity_days)
        conf_cut = now - timedelta(days=self.s.project_confirm_interval_days)
        pend_cut = now - timedelta(hours=self.s.pending_scope_ttl_hours)
        out = []
        with self.engine.connect() as conn:
            rows = conn.execute(select(dict_scopes)).mappings().all()
            # voci senza riga in dict_scopes (es. dati migrati): scadenza dall'ultima voce
            orphans = conn.execute(
                select(dict_entries.c.owner_pseudonym, dict_entries.c.scope_type,
                       dict_entries.c.scope_id, func.min(dict_entries.c.created_at),
                       func.max(dict_entries.c.last_used_at))
                .group_by(dict_entries.c.owner_pseudonym, dict_entries.c.scope_type,
                          dict_entries.c.scope_id)).all()
        known = set()
        for r in rows:
            key = (r["owner_pseudonym"], r["scope_type"], r["scope_id"])
            known.add(key)
            last, created = as_utc(r["last_used_at"]), as_utc(r["created_at"])
            confirmed = as_utc(r["confirmed_at"]) if r["confirmed_at"] else None
            if r["scope_id"].startswith("pending:"):
                expired = created < pend_cut
            elif r["scope_type"] == "conversation":
                expired = last < conv_cut
            else:
                expired = last < proj_cut or (confirmed or created) < conf_cut
            if expired:
                out.append(key)
        for owner, st, sid, first, last in orphans:
            key = (owner, st, sid)
            if key in known:
                continue
            last = as_utc(last)
            if sid.startswith("pending:"):
                expired = as_utc(first) < pend_cut
            else:
                expired = last < (conv_cut if st == "conversation" else proj_cut)
            if expired:
                out.append(key)
        return out
