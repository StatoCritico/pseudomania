#!/bin/sh
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Key store di Pseudomania: eseguito da postgres-keys SOLO alla prima inizializzazione
# del volume. Crea l'utente applicativo "pseudogate_keys_app" (non superuser),
# proprietario del DB "pseudogate_keys" (copie di custodia delle chiavi utente).
set -eu

if [ -z "${KEYS_DB_PASSWORD:-}" ]; then
  echo "KEYS_DB_PASSWORD non impostata" >&2
  exit 1
fi

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
     -v app_pw="$KEYS_DB_PASSWORD" <<'SQL'
CREATE ROLE pseudogate_keys_app LOGIN PASSWORD :'app_pw' NOSUPERUSER NOCREATEDB NOCREATEROLE;
ALTER DATABASE pseudogate_keys OWNER TO pseudogate_keys_app;
ALTER SCHEMA public OWNER TO pseudogate_keys_app;
REVOKE ALL ON DATABASE pseudogate_keys FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE pseudogate_keys TO pseudogate_keys_app;
SQL
