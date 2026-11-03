-- SPDX-License-Identifier: AGPL-3.0-or-later
-- PseudoGate: DB applicativo (SQLite, SOLO sviluppo e test).

CREATE TABLE IF NOT EXISTS dict_entries (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    scope_type       TEXT NOT NULL CHECK (scope_type IN ('conversation', 'project')),
    scope_id         TEXT NOT NULL,
    owner_pseudonym  TEXT NOT NULL,
    tag              TEXT NOT NULL,
    entity_type      TEXT NOT NULL,
    value_hmac       TEXT NOT NULL,
    ciphertext       TEXT,
    iv               TEXT,
    key_id           TEXT,
    aad_scope        TEXT,   -- "tipo|id" usato come AAD se diverso dallo scope attuale (dopo rebind)
    pending_until    TIMESTAMP,
    created_at       TIMESTAMP NOT NULL,
    last_used_at     TIMESTAMP NOT NULL,
    uploaded_at      TIMESTAMP,
    CONSTRAINT dict_entries_tag_uq   UNIQUE (scope_type, scope_id, owner_pseudonym, tag),
    CONSTRAINT dict_entries_value_uq UNIQUE (scope_type, scope_id, owner_pseudonym, value_hmac)
);
CREATE INDEX IF NOT EXISTS dict_entries_owner_key_idx ON dict_entries (owner_pseudonym, key_id);

CREATE TABLE IF NOT EXISTS dict_scopes (
    scope_type       TEXT NOT NULL,
    scope_id         TEXT NOT NULL,
    owner_pseudonym  TEXT NOT NULL,
    created_at       TIMESTAMP NOT NULL,
    last_used_at     TIMESTAMP NOT NULL,
    confirmed_at     TIMESTAMP,
    PRIMARY KEY (scope_type, scope_id, owner_pseudonym)
);

CREATE TABLE IF NOT EXISTS audit_events (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    ts               TIMESTAMP NOT NULL,
    user_pseudonym   TEXT NOT NULL,
    office           TEXT,
    action           TEXT NOT NULL,
    site             TEXT,
    scope_type       TEXT,
    scope_hash       TEXT,
    kind             TEXT,
    entity_counts    TEXT NOT NULL DEFAULT '{}',
    blocked          BOOLEAN NOT NULL DEFAULT 0,
    block_category   TEXT,
    prompt_sha256    TEXT,
    response_sha256  TEXT,
    latency_ms       INTEGER,
    trace_id         TEXT,
    details          TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS audit_events_ts_idx ON audit_events (ts);

CREATE TABLE IF NOT EXISTS audit_daily (
    day              DATE NOT NULL,
    office           TEXT NOT NULL DEFAULT '',
    action           TEXT NOT NULL,
    site             TEXT NOT NULL DEFAULT '',
    kind             TEXT NOT NULL DEFAULT '',
    blocked          BOOLEAN NOT NULL DEFAULT 0,
    block_category   TEXT NOT NULL DEFAULT '',
    events           INTEGER NOT NULL DEFAULT 0,
    entity_counts    TEXT NOT NULL DEFAULT '{}',
    PRIMARY KEY (day, office, action, site, kind, blocked, block_category)
);

CREATE TABLE IF NOT EXISTS judicial_holds (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at       TIMESTAMP NOT NULL,
    reference        TEXT NOT NULL,
    owner_pseudonym  TEXT NOT NULL,
    scope_type       TEXT,
    scope_id         TEXT,
    note             TEXT,
    created_by       TEXT NOT NULL,
    revoked_at       TIMESTAMP,
    revoked_by       TEXT,
    revoke_reference TEXT
);

CREATE TABLE IF NOT EXISTS deletion_log (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    ts               TIMESTAMP NOT NULL,
    reason           TEXT NOT NULL,
    object           TEXT NOT NULL,
    owner_pseudonym  TEXT,
    scope_type       TEXT,
    scope_id         TEXT,
    key_id           TEXT,
    count            INTEGER NOT NULL DEFAULT 0,
    prev_hash        TEXT NOT NULL,
    row_hash         TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS admin_log (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    ts               TIMESTAMP NOT NULL,
    actor            TEXT NOT NULL,
    action           TEXT NOT NULL,
    details          TEXT NOT NULL DEFAULT '{}',
    prev_hash        TEXT NOT NULL,
    row_hash         TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS deletion_log_no_update BEFORE UPDATE ON deletion_log
    BEGIN SELECT RAISE(ABORT, 'deletion_log in sola aggiunta'); END;
CREATE TRIGGER IF NOT EXISTS admin_log_no_update BEFORE UPDATE ON admin_log
    BEGIN SELECT RAISE(ABORT, 'admin_log in sola aggiunta'); END;
CREATE TRIGGER IF NOT EXISTS deletion_log_no_delete BEFORE DELETE ON deletion_log
    WHEN OLD.ts > datetime('now', '-730 days')
    BEGIN SELECT RAISE(ABORT, 'deletion_log: righe cancellabili solo oltre 24 mesi'); END;
CREATE TRIGGER IF NOT EXISTS admin_log_no_delete BEFORE DELETE ON admin_log
    WHEN OLD.ts > datetime('now', '-730 days')
    BEGIN SELECT RAISE(ABORT, 'admin_log: righe cancellabili solo oltre 24 mesi'); END;
