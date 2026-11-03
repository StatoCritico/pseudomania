# SPDX-License-Identifier: AGPL-3.0-or-later
"""Key store separato ("pseudogate_keys"): copie di custodia (escrow) delle chiavi utente,
chiavi pubbliche dei dispositivi per il recupero, chiavi recuperate dai custodi, richieste
di rotazione forzata.

Gli escrow sono cifrati dall'estensione con la chiave PUBBLICA di custodia (RSA-OAEP-4096,
SHA-256): il server non può decifrarli. La chiave privata è divisa tra i custodi
(tools/custodi/). Questo database ha volume e backup propri (14 giorni) e non compare mai
nei backup del DB applicativo.
"""

from __future__ import annotations

import base64
import binascii
import logging
import uuid
from datetime import timedelta

from sqlalchemy import and_, delete, func, or_, select, update
from sqlalchemy.engine import Engine
from sqlalchemy.exc import IntegrityError

from .db import as_utc, device_keys, escrows, recovered_keys, rotation_requests, utcnow
from .dictionary import valid_key_id
from .errors import BadRequest, Conflict
from .registri import log_deletion

log = logging.getLogger("pseudogate.keystore")


def _b64(value, field: str) -> bytes:
    try:
        return base64.b64decode(value, validate=True)
    except (binascii.Error, ValueError, TypeError) as e:
        raise BadRequest(f"Campo {field} non è base64 valido.") from e


def check_rsa_spki(spki_b64: str, min_bits: int = 2048) -> None:
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import rsa

    try:
        key = serialization.load_der_public_key(_b64(spki_b64, "publicKey"))
    except ValueError as e:
        raise BadRequest("Chiave pubblica non valida (atteso SPKI DER in base64).") from e
    if not isinstance(key, rsa.RSAPublicKey) or key.key_size < min_bits:
        raise BadRequest(f"Serve una chiave pubblica RSA di almeno {min_bits} bit.")


class KeyStore:
    def __init__(self, engine: Engine, app_engine: Engine, settings):
        self.engine = engine
        self.app_engine = app_engine  # per il registro delle cancellazioni
        self.s = settings

    # ---------------------------------------------------------------- escrow
    def put_escrow(self, owner: str, key_id: str, wrapped_key: str, escrow_key_id: str) -> None:
        if not valid_key_id(key_id):
            raise BadRequest("keyId deve essere un UUID.")
        if escrow_key_id != self.s.escrow_key_id:
            raise Conflict("escrowKeyId non corrisponde alla chiave di custodia attuale: "
                           "ricaricare la configurazione.", code="escrow_key_mismatch")
        raw = _b64(wrapped_key, "wrappedKey")
        if len(raw) != 512:  # RSA-4096: il cifrato è lungo 512 byte
            raise BadRequest("wrappedKey deve essere un cifrato RSA-OAEP-4096 (512 byte).")
        now = utcnow()
        try:
            with self.engine.begin() as conn:
                existing = conn.execute(select(escrows.c.owner_pseudonym, escrows.c.wrapped_key)
                                        .where(escrows.c.key_id == key_id)).first()
                if existing:
                    if existing[0] != owner:
                        raise Conflict("keyId già in uso.", code="key_id_conflict")
                    if existing[1] == wrapped_key:
                        return
                    raise Conflict("Escrow già registrato per questa chiave.", code="escrow_exists")
                conn.execute(escrows.insert().values(key_id=key_id, owner_pseudonym=owner,
                                                     escrow_key_id=escrow_key_id,
                                                     wrapped_key=wrapped_key, created_at=now,
                                                     has_entries=False))
        except IntegrityError as e:
            raise Conflict("keyId già in uso.", code="key_id_conflict") from e

    def owner_keys(self, owner: str, key_ids) -> set[str]:
        key_ids = list(key_ids)
        if not key_ids:
            return set()
        with self.engine.connect() as conn:
            return {r[0] for r in conn.execute(select(escrows.c.key_id).where(
                escrows.c.owner_pseudonym == owner, escrows.c.key_id.in_(key_ids)))}

    def mark_has_entries(self, key_ids) -> None:
        with self.engine.begin() as conn:
            conn.execute(update(escrows).where(escrows.c.key_id.in_(list(key_ids)),
                                               escrows.c.has_entries.is_(False))
                         .values(has_entries=True))

    def delete_escrow(self, key_id: str, reason: str) -> bool:
        with self.engine.begin() as conn:
            row = conn.execute(select(escrows.c.owner_pseudonym).where(escrows.c.key_id == key_id)).first()
            if not row:
                return False
            conn.execute(delete(escrows).where(escrows.c.key_id == key_id))
        with self.app_engine.begin() as conn:
            log_deletion(conn, reason=reason, object="escrow", owner=row[0], key_id=key_id, count=1)
        return True

    def retire(self, key_id: str) -> None:
        with self.engine.begin() as conn:
            conn.execute(update(escrows).where(escrows.c.key_id == key_id,
                                               escrows.c.retired_at.is_(None))
                         .values(retired_at=utcnow()))

    def candidates_for_deletion(self) -> list[tuple[str, str, bool]]:
        """Escrow che hanno avuto voci oppure sono stati ritirati -> [(key_id, owner, ritirato)]."""
        with self.engine.connect() as conn:
            return [(r[0], r[1], r[2] is not None) for r in conn.execute(
                select(escrows.c.key_id, escrows.c.owner_pseudonym, escrows.c.retired_at)
                .where(or_(escrows.c.has_entries.is_(True), escrows.c.retired_at.is_not(None))))]

    def export_owner(self, owner: str, key_id: str | None = None) -> dict:
        with self.engine.connect() as conn:
            q = select(escrows).where(escrows.c.owner_pseudonym == owner)
            if key_id:
                q = q.where(escrows.c.key_id == key_id)
            es = conn.execute(q.order_by(escrows.c.created_at)).mappings().all()
            ds = conn.execute(select(device_keys).where(device_keys.c.owner_pseudonym == owner)
                              .order_by(device_keys.c.created_at)).mappings().all()
        return {
            "formato": "pseudomania-escrow-export", "versione": 1,
            "ownerPseudonym": owner,
            "escrows": [{"keyId": e["key_id"], "escrowKeyId": e["escrow_key_id"],
                         "wrappedKey": e["wrapped_key"],
                         "createdAt": as_utc(e["created_at"]).isoformat(),
                         "retired": e["retired_at"] is not None} for e in es],
            "deviceKeys": [{"deviceKeyId": d["device_key_id"], "publicKey": d["public_key"],
                            "createdAt": as_utc(d["created_at"]).isoformat()} for d in ds],
        }

    # ---------------------------------------------------------------- rotazione
    def rotate_needed(self, owner: str) -> bool:
        with self.engine.connect() as conn:
            row = conn.execute(select(escrows.c.created_at, escrows.c.escrow_key_id).where(
                escrows.c.owner_pseudonym == owner, escrows.c.retired_at.is_(None))
                .order_by(escrows.c.created_at.desc()).limit(1)).first()
            if row is None:
                return False  # primo avvio: l'estensione genera la chiave da sé
            newest = as_utc(row[0])
            if row[1] != self.s.escrow_key_id:
                return True  # chiave di custodia sostituita: nuovo escrow con la chiave attuale
            if newest < utcnow() - timedelta(days=self.s.key_rotation_days):
                return True
            req = conn.execute(select(func.max(rotation_requests.c.requested_at)).where(
                rotation_requests.c.owner_pseudonym.in_([owner, "*"]))).scalar()
        return req is not None and as_utc(req) > newest

    def request_rotation(self, owner: str, reason: str) -> None:
        with self.engine.begin() as conn:
            conn.execute(rotation_requests.insert().values(owner_pseudonym=owner, reason=reason,
                                                           requested_at=utcnow()))

    # ---------------------------------------------------------------- recupero
    def add_device_key(self, owner: str, public_key: str) -> str:
        check_rsa_spki(public_key)
        dk = str(uuid.uuid4())
        with self.engine.begin() as conn:
            conn.execute(device_keys.insert().values(device_key_id=dk, owner_pseudonym=owner,
                                                     public_key=public_key, created_at=utcnow()))
        return dk

    def add_recovered(self, items: list[dict]) -> int:
        """Chiavi ricifrate dai custodi per la chiave pubblica di un dispositivo."""
        n = 0
        with self.engine.begin() as conn:
            for it in items:
                dk, kid, wk = it.get("deviceKeyId"), it.get("keyId"), it.get("wrappedKey")
                dev = conn.execute(select(device_keys.c.owner_pseudonym)
                                   .where(device_keys.c.device_key_id == dk)).first()
                if not dev:
                    raise BadRequest(f"deviceKeyId sconosciuto: {dk}")
                owner = dev[0]
                if it.get("ownerPseudonym") and it["ownerPseudonym"] != owner:
                    raise BadRequest("ownerPseudonym non corrisponde al dispositivo.")
                if not valid_key_id(str(kid)):
                    raise BadRequest("keyId non valido.")
                _b64(wk, "wrappedKey")
                conn.execute(delete(recovered_keys).where(and_(recovered_keys.c.device_key_id == dk,
                                                               recovered_keys.c.key_id == kid)))
                conn.execute(recovered_keys.insert().values(owner_pseudonym=owner, device_key_id=dk,
                                                            key_id=kid, wrapped_key=wk,
                                                            created_at=utcnow()))
                n += 1
        return n

    def recovered_for(self, owner: str) -> list[dict]:
        now = utcnow()
        with self.engine.begin() as conn:
            rows = conn.execute(select(recovered_keys).where(
                recovered_keys.c.owner_pseudonym == owner).order_by(recovered_keys.c.id)).mappings().all()
            if rows:
                conn.execute(update(recovered_keys).where(recovered_keys.c.owner_pseudonym == owner,
                                                          recovered_keys.c.fetched_at.is_(None))
                             .values(fetched_at=now))
        return [{"keyId": r["key_id"], "wrappedKey": r["wrapped_key"],
                 "deviceKeyId": r["device_key_id"], "createdAt": as_utc(r["created_at"]).isoformat()}
                for r in rows]

    def purge_transient(self) -> dict:
        now = utcnow()
        with self.engine.begin() as conn:
            rec = conn.execute(delete(recovered_keys).where(
                recovered_keys.c.created_at < now - timedelta(days=self.s.recovered_key_ttl_days))).rowcount
            dev = conn.execute(delete(device_keys).where(
                device_keys.c.created_at < now - timedelta(days=self.s.device_key_ttl_days))).rowcount
            rot = conn.execute(delete(rotation_requests).where(
                rotation_requests.c.requested_at < now - timedelta(days=365))).rowcount
        return {"recovered_keys": rec, "device_keys": dev, "rotation_requests": rot}
