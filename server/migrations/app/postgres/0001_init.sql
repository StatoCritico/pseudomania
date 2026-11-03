-- SPDX-License-Identifier: AGPL-3.0-or-later
-- PseudoGate: DB applicativo "pseudogate" (PostgreSQL).
-- Nessun valore originale: i valori del dizionario sono cifrati DALL'ESTENSIONE con la
-- chiave dell'utente (AES-GCM); il server conserva solo value_hmac, ciphertext, iv, key_id.

CREATE TABLE IF NOT EXISTS dict_entries (
    id               BIGSERIAL PRIMARY KEY,
    scope_type       TEXT        NOT NULL CHECK (scope_type IN ('conversation', 'project')),
    scope_id         TEXT        NOT NULL,
    owner_pseudonym  TEXT        NOT NULL,
    tag              TEXT        NOT NULL,
    entity_type      TEXT        NOT NULL,
    value_hmac       TEXT        NOT NULL,
    ciphertext       TEXT,
    iv               TEXT,
    key_id           TEXT,
    aad_scope        TEXT,   -- "tipo|id" usato come AAD se diverso dallo scope attuale (dopo rebind)
    pending_until    TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    uploaded_at      TIMESTAMPTZ,
    CONSTRAINT dict_entries_tag_uq   UNIQUE (scope_type, scope_id, owner_pseudonym, tag),
    CONSTRAINT dict_entries_value_uq UNIQUE (scope_type, scope_id, owner_pseudonym, value_hmac),
    CONSTRAINT dict_entries_cipher_ck CHECK ((ciphertext IS NULL) = (iv IS NULL) AND (ciphertext IS NULL) = (key_id IS NULL))
);
CREATE INDEX IF NOT EXISTS dict_entries_owner_key_idx ON dict_entries (owner_pseudonym, key_id);
CREATE INDEX IF NOT EXISTS dict_entries_key_idx ON dict_entries (key_id);

CREATE TABLE IF NOT EXISTS dict_scopes (
    scope_type       TEXT        NOT NULL,
    scope_id         TEXT        NOT NULL,
    owner_pseudonym  TEXT        NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    confirmed_at     TIMESTAMPTZ,
    PRIMARY KEY (scope_type, scope_id, owner_pseudonym)
);
CREATE INDEX IF NOT EXISTS dict_scopes_last_used_idx ON dict_scopes (last_used_at);

CREATE TABLE IF NOT EXISTS audit_events (
    id               BIGSERIAL PRIMARY KEY,
    ts               TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_pseudonym   TEXT        NOT NULL,
    office           TEXT,
    action           TEXT        NOT NULL,
    site             TEXT,
    scope_type       TEXT,
    scope_hash       TEXT,
    kind             TEXT,
    entity_counts    JSONB       NOT NULL DEFAULT '{}'::jsonb,
    blocked          BOOLEAN     NOT NULL DEFAULT false,
    block_category   TEXT,
    prompt_sha256    TEXT,
    response_sha256  TEXT,
    latency_ms       INTEGER,
    trace_id         TEXT,
    details          JSONB       NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS audit_events_ts_idx    ON audit_events (ts);
CREATE INDEX IF NOT EXISTS audit_events_user_idx  ON audit_events (user_pseudonym, ts);
CREATE INDEX IF NOT EXISTS audit_events_hash_idx  ON audit_events (prompt_sha256);

-- aggregati anonimi (dopo AUDIT_RETENTION_DAYS): nessun utente, solo conteggi
CREATE TABLE IF NOT EXISTS audit_daily (
    day              DATE    NOT NULL,
    office           TEXT    NOT NULL DEFAULT '',
    action           TEXT    NOT NULL,
    site             TEXT    NOT NULL DEFAULT '',
    kind             TEXT    NOT NULL DEFAULT '',
    blocked          BOOLEAN NOT NULL DEFAULT false,
    block_category   TEXT    NOT NULL DEFAULT '',
    events           INTEGER NOT NULL DEFAULT 0,
    entity_counts    JSONB   NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (day, office, action, site, kind, blocked, block_category)
);

CREATE TABLE IF NOT EXISTS judicial_holds (
    id               BIGSERIAL PRIMARY KEY,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    reference        TEXT        NOT NULL,
    owner_pseudonym  TEXT        NOT NULL,
    scope_type       TEXT,
    scope_id         TEXT,
    note             TEXT,
    created_by       TEXT        NOT NULL,
    revoked_at       TIMESTAMPTZ,
    revoked_by       TEXT,
    revoke_reference TEXT
);

-- registri append-only con catena di hash (UPDATE vietato; DELETE solo oltre 24 mesi)
CREATE TABLE IF NOT EXISTS deletion_log (
    id               BIGSERIAL PRIMARY KEY,
    ts               TIMESTAMPTZ NOT NULL,
    reason           TEXT        NOT NULL,
    object           TEXT        NOT NULL,
    owner_pseudonym  TEXT,
    scope_type       TEXT,
    scope_id         TEXT,
    key_id           TEXT,
    count            INTEGER     NOT NULL DEFAULT 0,
    prev_hash        TEXT        NOT NULL,
    row_hash         TEXT        NOT NULL
);
CREATE TABLE IF NOT EXISTS admin_log (
    id               BIGSERIAL PRIMARY KEY,
    ts               TIMESTAMPTZ NOT NULL,
    actor            TEXT        NOT NULL,
    action           TEXT        NOT NULL,
    details          JSONB       NOT NULL DEFAULT '{}'::jsonb,
    prev_hash        TEXT        NOT NULL,
    row_hash         TEXT        NOT NULL
);

CREATE OR REPLACE FUNCTION pseudogate_append_only() RETURNS trigger AS $fn$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'tabella % in sola aggiunta', TG_TABLE_NAME;
    END IF;
    IF OLD.ts > now() - interval '730 days' THEN
        RAISE EXCEPTION 'tabella %: si possono cancellare solo righe oltre 24 mesi', TG_TABLE_NAME;
    END IF;
    RETURN OLD;
END
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS deletion_log_append_only ON deletion_log;
CREATE TRIGGER deletion_log_append_only BEFORE UPDATE OR DELETE ON deletion_log
    FOR EACH ROW EXECUTE FUNCTION pseudogate_append_only();
DROP TRIGGER IF EXISTS admin_log_append_only ON admin_log;
CREATE TRIGGER admin_log_append_only BEFORE UPDATE OR DELETE ON admin_log
    FOR EACH ROW EXECUTE FUNCTION pseudogate_append_only();
