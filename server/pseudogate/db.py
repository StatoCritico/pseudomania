# SPDX-License-Identifier: AGPL-3.0-or-later
"""Database: DB applicativo "pseudogate" e key store separato "pseudogate_keys".

In produzione entrambi sono PostgreSQL (container e volumi distinti); SQLite è
supportato solo per sviluppo e test. Migrazioni SQL semplici, per dialetto.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import (JSON, BigInteger, Boolean, Column, Date, DateTime, Integer, MetaData,
                        Table, Text, create_engine, event, text)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.engine import Engine

log = logging.getLogger("pseudogate.db")

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"
_MIGRATION_LOCK_ID = 727274001

_Json = JSON().with_variant(JSONB(), "postgresql")
_Id = BigInteger().with_variant(Integer(), "sqlite")
_TS = DateTime(timezone=True)

# --------------------------------------------------------------------------- app
app_metadata = MetaData()

dict_entries = Table(
    "dict_entries", app_metadata,
    Column("id", _Id, primary_key=True, autoincrement=True),
    Column("scope_type", Text, nullable=False),
    Column("scope_id", Text, nullable=False),
    Column("owner_pseudonym", Text, nullable=False),
    Column("tag", Text, nullable=False),
    Column("entity_type", Text, nullable=False),
    Column("value_hmac", Text, nullable=False),
    Column("ciphertext", Text),
    Column("iv", Text),
    Column("key_id", Text),
    Column("aad_scope", Text),
    Column("pending_until", _TS),
    Column("created_at", _TS, nullable=False),
    Column("last_used_at", _TS, nullable=False),
    Column("uploaded_at", _TS),
)

dict_scopes = Table(
    "dict_scopes", app_metadata,
    Column("scope_type", Text, primary_key=True),
    Column("scope_id", Text, primary_key=True),
    Column("owner_pseudonym", Text, primary_key=True),
    Column("created_at", _TS, nullable=False),
    Column("last_used_at", _TS, nullable=False),
    Column("confirmed_at", _TS),
)

audit_events = Table(
    "audit_events", app_metadata,
    Column("id", _Id, primary_key=True, autoincrement=True),
    Column("ts", _TS, nullable=False),
    Column("user_pseudonym", Text, nullable=False),
    Column("office", Text),
    Column("action", Text, nullable=False),
    Column("site", Text),
    Column("scope_type", Text),
    Column("scope_hash", Text),
    Column("kind", Text),
    Column("entity_counts", _Json, nullable=False),
    Column("blocked", Boolean, nullable=False),
    Column("block_category", Text),
    Column("prompt_sha256", Text),
    Column("response_sha256", Text),
    Column("latency_ms", Integer),
    Column("trace_id", Text),
    Column("details", _Json, nullable=False),
)

audit_daily = Table(
    "audit_daily", app_metadata,
    Column("day", Date, primary_key=True),
    Column("office", Text, primary_key=True),
    Column("action", Text, primary_key=True),
    Column("site", Text, primary_key=True),
    Column("kind", Text, primary_key=True),
    Column("blocked", Boolean, primary_key=True),
    Column("block_category", Text, primary_key=True),
    Column("events", Integer, nullable=False),
    Column("entity_counts", _Json, nullable=False),
)

judicial_holds = Table(
    "judicial_holds", app_metadata,
    Column("id", _Id, primary_key=True, autoincrement=True),
    Column("created_at", _TS, nullable=False),
    Column("reference", Text, nullable=False),
    Column("owner_pseudonym", Text, nullable=False),
    Column("scope_type", Text),
    Column("scope_id", Text),
    Column("note", Text),
    Column("created_by", Text, nullable=False),
    Column("revoked_at", _TS),
    Column("revoked_by", Text),
    Column("revoke_reference", Text),
)

deletion_log = Table(
    "deletion_log", app_metadata,
    Column("id", _Id, primary_key=True, autoincrement=True),
    Column("ts", _TS, nullable=False),
    Column("reason", Text, nullable=False),
    Column("object", Text, nullable=False),
    Column("owner_pseudonym", Text),
    Column("scope_type", Text),
    Column("scope_id", Text),
    Column("key_id", Text),
    Column("count", Integer, nullable=False),
    Column("prev_hash", Text, nullable=False),
    Column("row_hash", Text, nullable=False),
)

admin_log = Table(
    "admin_log", app_metadata,
    Column("id", _Id, primary_key=True, autoincrement=True),
    Column("ts", _TS, nullable=False),
    Column("actor", Text, nullable=False),
    Column("action", Text, nullable=False),
    Column("details", _Json, nullable=False),
    Column("prev_hash", Text, nullable=False),
    Column("row_hash", Text, nullable=False),
)

# --------------------------------------------------------------------------- key store
keys_metadata = MetaData()

escrows = Table(
    "escrows", keys_metadata,
    Column("key_id", Text, primary_key=True),
    Column("owner_pseudonym", Text, nullable=False),
    Column("escrow_key_id", Text, nullable=False),
    Column("wrapped_key", Text, nullable=False),
    Column("created_at", _TS, nullable=False),
    Column("has_entries", Boolean, nullable=False, default=False),
    Column("retired_at", _TS),
)

device_keys = Table(
    "device_keys", keys_metadata,
    Column("device_key_id", Text, primary_key=True),
    Column("owner_pseudonym", Text, nullable=False),
    Column("public_key", Text, nullable=False),
    Column("created_at", _TS, nullable=False),
)

recovered_keys = Table(
    "recovered_keys", keys_metadata,
    Column("id", _Id, primary_key=True, autoincrement=True),
    Column("owner_pseudonym", Text, nullable=False),
    Column("device_key_id", Text, nullable=False),
    Column("key_id", Text, nullable=False),
    Column("wrapped_key", Text, nullable=False),
    Column("created_at", _TS, nullable=False),
    Column("fetched_at", _TS),
)

rotation_requests = Table(
    "rotation_requests", keys_metadata,
    Column("id", _Id, primary_key=True, autoincrement=True),
    Column("owner_pseudonym", Text, nullable=False),
    Column("reason", Text, nullable=False),
    Column("requested_at", _TS, nullable=False),
)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def as_utc(dt: datetime) -> datetime:
    """SQLite restituisce datetime naive: li interpretiamo come UTC."""
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)


def make_engine(url: str) -> Engine:
    if url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://"):]
    if url.startswith("sqlite"):
        if url.startswith("sqlite:///"):
            Path(url[len("sqlite:///"):]).parent.mkdir(parents=True, exist_ok=True)
        engine = create_engine(url, connect_args={"check_same_thread": False, "timeout": 30})

        @event.listens_for(engine, "connect")
        def _sqlite_pragmas(dbapi_conn, _record):  # pragma: no cover - banale
            cur = dbapi_conn.cursor()
            cur.execute("PRAGMA journal_mode=WAL")
            cur.execute("PRAGMA busy_timeout=30000")
            cur.close()

        return engine
    return create_engine(url, pool_pre_ping=True, pool_size=10, max_overflow=10)


def migrate(engine: Engine, which: str = "app") -> list[str]:
    """Applica in ordine migrations/<which>/<dialetto>/NNNN_*.sql non ancora applicati.
    Ogni file è eseguito come script intero (può contenere funzioni e trigger)."""
    dialect = "postgres" if engine.dialect.name == "postgresql" else "sqlite"
    files = sorted((MIGRATIONS_DIR / which / dialect).glob("[0-9][0-9][0-9][0-9]_*.sql"))
    applied_now: list[str] = []
    with engine.begin() as conn:
        if dialect == "postgres":
            conn.execute(text("SELECT pg_advisory_xact_lock(:id)"), {"id": _MIGRATION_LOCK_ID})
        conn.execute(text("CREATE TABLE IF NOT EXISTS schema_migrations ("
                          "version TEXT PRIMARY KEY, applied_at TIMESTAMP NOT NULL)"))
        done = {r[0] for r in conn.execute(text("SELECT version FROM schema_migrations"))}
        for f in files:
            version = re.match(r"(\d{4})_", f.name).group(1)
            if version in done:
                continue
            script = f.read_text(encoding="utf-8")
            raw = conn.connection.driver_connection
            if dialect == "postgres":
                with raw.cursor() as cur:
                    cur.execute(script)  # senza parametri: più istruzioni ammesse
            else:
                raw.executescript(script)
            conn.execute(text("INSERT INTO schema_migrations (version, applied_at) "
                              "VALUES (:v, CURRENT_TIMESTAMP)"), {"v": version})
            applied_now.append(f"{which}/{f.name}")
            log.info("Migrazione applicata: %s/%s", which, f.name)
    return applied_now
