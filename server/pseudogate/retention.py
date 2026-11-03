# SPDX-License-Identifier: AGPL-3.0-or-later
"""Conservazione (DECISIONI.md, tabella "Durate di conservazione").

Ad ogni esecuzione:
- dizionari: chat 30 giorni dall'ultimo uso; progetti 30 giorni dall'ultimo uso o
  senza conferma annuale; scope `pending:` 24 ore. Gli scope coperti da un blocco per
  autorità giudiziaria non vengono cancellati;
- escrow: cancellati quando la chiave non ha più voci vive (o è stata ritirata dopo la
  rotazione), salvo blocco sull'utente;
- registro azioni: oltre AUDIT_RETENTION_DAYS solo aggregati anonimi per giorno/ufficio;
- registri tecnici (deletion_log, admin_log): oltre 24 mesi;
- key store: chiavi recuperate (7 gg), chiavi di dispositivo (30 gg);
- Langfuse: trace del progetto Pseudomania oltre LANGFUSE_RETENTION_DAYS;
- esportazione del registro delle cancellazioni in DELETION_LOG_DIR.

Gira dentro l'api (RETENTION_JOB=internal; in PostgreSQL un advisory lock evita
esecuzioni parallele) oppure da cron: `python -m pseudogate retention`.
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections import defaultdict
from datetime import timedelta

import httpx
from sqlalchemy import delete, select, text

from . import registri
from .db import as_utc, audit_daily, audit_events, utcnow
from .dictionary import Scope
from .holds import Holds

log = logging.getLogger("pseudogate.retention")
_LOCK_ID = 727274002


# --------------------------------------------------------------------------- audit
def aggregate_audit(engine, retention_days: int) -> int:
    """Righe di audit_events più vecchie della soglia -> conteggi anonimi in audit_daily."""
    cut = utcnow() - timedelta(days=retention_days)
    with engine.begin() as conn:
        rows = conn.execute(select(audit_events.c.ts, audit_events.c.office, audit_events.c.action,
                                   audit_events.c.site, audit_events.c.kind, audit_events.c.blocked,
                                   audit_events.c.block_category, audit_events.c.entity_counts)
                            .where(audit_events.c.ts < cut)).all()
        if not rows:
            return 0
        agg: dict[tuple, dict] = defaultdict(lambda: {"events": 0, "entity_counts": defaultdict(int)})
        for ts, office, action, site, kind, blocked, cat, counts in rows:
            key = (as_utc(ts).date(), office or "", action, site or "", kind or "", bool(blocked), cat or "")
            a = agg[key]
            a["events"] += 1
            if isinstance(counts, str):
                counts = json.loads(counts or "{}")
            for t, n in (counts or {}).items():
                a["entity_counts"][t] += int(n)
        for key, a in agg.items():
            where = [audit_daily.c[k] == v for k, v in zip(
                ("day", "office", "action", "site", "kind", "blocked", "block_category"), key, strict=True)]
            cur = conn.execute(select(audit_daily.c.events, audit_daily.c.entity_counts).where(*where)).first()
            counts = dict(a["entity_counts"])
            if cur:
                old = cur[1] if isinstance(cur[1], dict) else json.loads(cur[1] or "{}")
                for t, n in old.items():
                    counts[t] = counts.get(t, 0) + int(n)
                conn.execute(audit_daily.update().where(*where).values(events=cur[0] + a["events"],
                                                                       entity_counts=counts))
            else:
                conn.execute(audit_daily.insert().values(
                    day=key[0], office=key[1], action=key[2], site=key[3], kind=key[4],
                    blocked=key[5], block_category=key[6], events=a["events"], entity_counts=counts))
        conn.execute(delete(audit_events).where(audit_events.c.ts < cut))
        return len(rows)


# --------------------------------------------------------------------------- Langfuse
def _old_trace_ids(c: httpx.Client, to_ts: str, max_pages: int) -> set[str]:
    """Id delle trace più vecchie di to_ts.

    Langfuse v4 (scrittura "events_only", predefinita) non popola più le tabelle legacy e
    `GET /api/public/traces` risponde 404: si usa `GET /api/public/v2/observations`
    (paginazione a cursore, max 1000 per pagina) e si raccolgono i traceId.
    Con server v3 / scrittura legacy si ripiega su `GET /api/public/traces`."""
    ids: set[str] = set()
    cursor = None
    for _ in range(max_pages):
        params = {"toStartTime": to_ts, "fields": "core", "limit": 1000}
        if cursor:
            params["cursor"] = cursor
        r = c.get("/api/public/v2/observations", params=params)
        if r.status_code in (400, 404) and not ids and cursor is None:
            break  # API v2 non disponibile: percorso legacy
        r.raise_for_status()
        body = r.json()
        ids |= {o["traceId"] for o in body.get("data", []) if o.get("traceId")}
        cursor = (body.get("meta") or {}).get("cursor")
        if not cursor:
            return ids
    else:
        return ids
    for page in range(1, max_pages + 1):
        r = c.get("/api/public/traces", params={"toTimestamp": to_ts, "limit": 100, "page": page,
                                                "fields": "core"})
        r.raise_for_status()
        data = r.json().get("data", [])
        ids |= {t["id"] for t in data}
        if len(data) < 100:
            break
    return ids


def purge_langfuse(host: str, public_key: str, secret_key: str, days: int,
                   transport: httpx.BaseTransport | None = None, max_pages: int = 20) -> int:
    """Cancella le trace più vecchie di `days` giorni tramite l'API pubblica di Langfuse
    (`DELETE /api/public/traces`, fino a 1000 id per richiesta; la cancellazione è
    asincrona lato Langfuse). Le chiavi API sono quelle del progetto Pseudomania: l'API
    opera solo su quel progetto. Verificato sul sorgente di Langfuse (main, 31/10/2026)."""
    to_ts = (utcnow() - timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    deleted = 0
    with httpx.Client(base_url=host, auth=(public_key, secret_key), timeout=60,
                      transport=transport) as c:
        ids = sorted(_old_trace_ids(c, to_ts, max_pages))
        for i in range(0, len(ids), 1000):
            chunk = ids[i:i + 1000]
            d = c.request("DELETE", "/api/public/traces", json={"traceIds": chunk})
            d.raise_for_status()
            deleted += len(chunk)
    return deleted


# --------------------------------------------------------------------------- job
def run_once(svc) -> dict:
    """svc: oggetto con engine, store, keystore, audit, settings."""
    engine, s = svc.engine, svc.settings
    locked, conn = True, None
    if engine.dialect.name == "postgresql":
        conn = engine.connect()
        locked = bool(conn.execute(text("SELECT pg_try_advisory_lock(:id)"), {"id": _LOCK_ID}).scalar())
        if not locked:
            conn.close()
            return {"skipped": True}
    try:
        counts: dict[str, int] = defaultdict(int)
        holds = Holds(engine).active()
        for owner, st, sid in svc.store.expired_scopes():
            if Holds.covers(holds, owner, st, sid):
                counts["scope_bloccati"] += 1
                continue
            n, _keys = svc.store.delete_scope(owner, Scope(st, sid), reason="scadenza")
            counts["voci_dizionario"] += n
            counts["scope"] += 1
        # escrow senza voci vive (o ritirati dopo la rotazione)
        for key_id, owner, _retired in svc.keystore.candidates_for_deletion():
            if Holds.covers(holds, owner):
                continue
            if svc.store.count_for_key(key_id) == 0:
                if svc.keystore.delete_escrow(key_id, reason="chiave_senza_voci"):
                    counts["escrow"] += 1
        for k, v in svc.keystore.purge_transient().items():
            counts[k] += v
        counts["audit_aggregati"] = aggregate_audit(engine, s.audit_retention_days)
        for t in ("deletion_log", "admin_log"):
            try:
                counts[t + "_scaduti"] = registri.purge_old(engine, t, s.admin_log_retention_days)
            except Exception:
                log.exception("Pulizia di %s non riuscita", t)
        if s.langfuse_enabled and s.langfuse_retention_days > 0:
            try:
                counts["langfuse_trace"] = purge_langfuse(s.langfuse_host, s.langfuse_public_key,
                                                          s.langfuse_secret_key, s.langfuse_retention_days)
            except Exception:
                log.warning("Pulizia delle trace Langfuse non riuscita", exc_info=True)
        counts["cancellazioni_esportate"] = registri.export_deletions(engine, s.deletion_log_dir)
        counts = {k: v for k, v in counts.items() if v}
        if counts:
            log.info("Conservazione: %s", counts)
        return counts
    finally:
        if conn is not None:
            conn.execute(text("SELECT pg_advisory_unlock(:id)"), {"id": _LOCK_ID})
            conn.close()


async def loop(svc) -> None:
    interval = max(1, svc.settings.retention_interval_minutes) * 60
    while True:
        try:
            await asyncio.to_thread(run_once, svc)
        except Exception:
            log.exception("Errore nel job di conservazione")
        await asyncio.sleep(interval)


# --------------------------------------------------------------------------- riapplicazione
def reapply_deletions(svc, path: str, actor: str = "cli") -> dict:
    """Dopo un ripristino da backup: riapplica le cancellazioni dell'esportazione JSONL
    successive al backup (idempotente: cancellare dati già assenti non fa nulla)."""
    from sqlalchemy import and_

    from .db import dict_entries, dict_scopes
    rows = registri.read_export(path)
    done = {"scope": 0, "voci": 0, "escrow": 0}
    for r in rows:
        if r["object"] == "scope" and r.get("owner_pseudonym"):
            with svc.engine.begin() as conn:
                n = conn.execute(delete(dict_entries).where(and_(
                    dict_entries.c.owner_pseudonym == r["owner_pseudonym"],
                    dict_entries.c.scope_type == r["scope_type"],
                    dict_entries.c.scope_id == r["scope_id"]))).rowcount
                conn.execute(delete(dict_scopes).where(and_(
                    dict_scopes.c.owner_pseudonym == r["owner_pseudonym"],
                    dict_scopes.c.scope_type == r["scope_type"],
                    dict_scopes.c.scope_id == r["scope_id"])))
            if n:
                done["scope"] += 1
                done["voci"] += n
        elif r["object"] == "escrow" and r.get("key_id"):
            from .db import escrows
            with svc.keystore.engine.begin() as conn:
                done["escrow"] += conn.execute(delete(escrows).where(escrows.c.key_id == r["key_id"])).rowcount
    registri.log_admin(svc.engine, actor, "cancellazioni_riapplicate", file=path,
                       righe=len(rows), **done)
    return done
