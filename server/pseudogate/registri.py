# SPDX-License-Identifier: AGPL-3.0-or-later
"""Registri tecnici append-only con catena di hash: cancellazioni (deletion_log) e
azioni amministrative e dei custodi (admin_log).

row_hash = SHA-256(prev_hash || JSON canonico dei campi): modificare o togliere una riga
spezza la catena (verifica con `python -m pseudogate registri verifica`). In PostgreSQL
un trigger vieta UPDATE e DELETE (salvo righe oltre 24 mesi).

Il registro delle cancellazioni è anche esportato in JSON Lines fuori dal database
(DELETION_LOG_DIR), così dopo un ripristino da backup le cancellazioni avvenute nel
frattempo si possono riapplicare (`python -m pseudogate cancellazioni riapplica`).
"""

from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime, timedelta
from pathlib import Path

from sqlalchemy import delete, select, text

from .db import admin_log, as_utc, deletion_log, utcnow

log = logging.getLogger("pseudogate.registri")
GENESIS = "0" * 64
_FIELDS = {
    "deletion_log": ("ts", "reason", "object", "owner_pseudonym", "scope_type", "scope_id",
                     "key_id", "count"),
    "admin_log": ("ts", "actor", "action", "details"),
}
_TABLES = {"deletion_log": deletion_log, "admin_log": admin_log}


def _canon(table: str, row: dict) -> str:
    vals = {}
    for f in _FIELDS[table]:
        v = row.get(f)
        if isinstance(v, datetime):
            v = as_utc(v).strftime("%Y-%m-%dT%H:%M:%S.%fZ")
        vals[f] = v
    return json.dumps(vals, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _hash(prev: str, table: str, row: dict) -> str:
    return hashlib.sha256((prev + _canon(table, row)).encode("utf-8")).hexdigest()


def append(conn, table: str, **fields) -> dict:
    """Aggiunge una riga nella transazione `conn` (serializzata sulla tabella)."""
    t = _TABLES[table]
    if conn.dialect.name == "postgresql":
        conn.execute(text(f"LOCK TABLE {table} IN SHARE ROW EXCLUSIVE MODE"))
    last = conn.execute(select(t.c.row_hash).order_by(t.c.id.desc()).limit(1)).scalar()
    row = {"ts": utcnow(), **fields}
    if table == "deletion_log":
        row.setdefault("count", 0)
    if table == "admin_log":
        row.setdefault("details", {})
    row["prev_hash"] = last or GENESIS
    row["row_hash"] = _hash(row["prev_hash"], table, row)
    conn.execute(t.insert(), [row])
    return row


def log_deletion(conn, *, reason: str, object: str, owner: str | None = None,
                 scope_type: str | None = None, scope_id: str | None = None,
                 key_id: str | None = None, count: int = 0) -> None:
    append(conn, "deletion_log", reason=reason, object=object, owner_pseudonym=owner,
           scope_type=scope_type, scope_id=scope_id, key_id=key_id, count=count)


def log_admin(engine, actor: str, action: str, **details) -> None:
    with engine.begin() as conn:
        append(conn, "admin_log", actor=actor, action=action, details=details)


def verify(engine, table: str) -> tuple[bool, int, str]:
    """(integro, righe verificate, messaggio)."""
    t = _TABLES[table]
    with engine.connect() as conn:
        rows = conn.execute(select(t).order_by(t.c.id)).mappings().all()
    prev = None
    for r in rows:
        r = dict(r)
        if isinstance(r.get("details"), str):
            r["details"] = json.loads(r["details"])
        if prev is not None and r["prev_hash"] != prev:
            return False, rows.index(r), f"catena interrotta alla riga id={r['id']}"
        if _hash(r["prev_hash"], table, r) != r["row_hash"]:
            return False, rows.index(r), f"hash non valido alla riga id={r['id']}"
        prev = r["row_hash"]
    return True, len(rows), "registro integro"


def purge_old(engine, table: str, days: int) -> int:
    t = _TABLES[table]
    with engine.begin() as conn:
        return conn.execute(delete(t).where(t.c.ts < utcnow() - timedelta(days=days))).rowcount


# --------------------------------------------------------------------------- esportazione
def export_deletions(engine, directory: str) -> int:
    """Aggiunge a <dir>/cancellazioni.jsonl le righe non ancora esportate. Idempotente."""
    d = Path(directory)
    try:
        d.mkdir(parents=True, exist_ok=True)
    except OSError:
        log.warning("Cartella del registro cancellazioni non scrivibile: %s", d)
        return 0
    f = d / "cancellazioni.jsonl"
    last_id = 0
    if f.exists():
        for line in f.read_text(encoding="utf-8").splitlines():
            if line.strip():
                last_id = max(last_id, int(json.loads(line)["id"]))
    with engine.connect() as conn:
        rows = conn.execute(select(deletion_log).where(deletion_log.c.id > last_id)
                            .order_by(deletion_log.c.id)).mappings().all()
    if not rows:
        return 0
    with f.open("a", encoding="utf-8") as fh:
        for r in rows:
            r = dict(r)
            r["ts"] = as_utc(r["ts"]).isoformat()
            fh.write(json.dumps(r, ensure_ascii=False, sort_keys=True) + "\n")
    return len(rows)


def read_export(path: str) -> list[dict]:
    rows = []
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        if line.strip():
            rows.append(json.loads(line))
    return rows
