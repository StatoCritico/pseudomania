-- SPDX-License-Identifier: AGPL-3.0-or-later
-- PseudoGate: key store "pseudogate_keys" (PostgreSQL separato, volume e backup propri).
-- Contiene le copie di custodia (escrow) delle chiavi utente, cifrate con la chiave
-- pubblica di custodia: il server NON può decifrarle (la privata è divisa tra i custodi).

CREATE TABLE IF NOT EXISTS escrows (
    key_id           TEXT PRIMARY KEY,
    owner_pseudonym  TEXT        NOT NULL,
    escrow_key_id    TEXT        NOT NULL,
    wrapped_key      TEXT        NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    has_entries      BOOLEAN     NOT NULL DEFAULT false,
    retired_at       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS escrows_owner_idx ON escrows (owner_pseudonym, created_at);

CREATE TABLE IF NOT EXISTS device_keys (
    device_key_id    TEXT PRIMARY KEY,
    owner_pseudonym  TEXT        NOT NULL,
    public_key       TEXT        NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recovered_keys (
    id               BIGSERIAL PRIMARY KEY,
    owner_pseudonym  TEXT        NOT NULL,
    device_key_id    TEXT        NOT NULL,
    key_id           TEXT        NOT NULL,
    wrapped_key      TEXT        NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    fetched_at       TIMESTAMPTZ,
    CONSTRAINT recovered_keys_uq UNIQUE (device_key_id, key_id)
);

CREATE TABLE IF NOT EXISTS rotation_requests (
    id               BIGSERIAL PRIMARY KEY,
    owner_pseudonym  TEXT        NOT NULL,   -- '*' = tutti gli utenti
    reason           TEXT        NOT NULL,
    requested_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
