#!/bin/sh
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Eseguito da postgres SOLO alla prima inizializzazione del volume.
# Crea l'utente applicativo "pseudogate_app" (non superuser), proprietario del DB
# "pseudogate": l'api applica da sola le migrazioni dello schema all'avvio.
set -eu

if [ -z "${PSEUDOGATE_DB_PASSWORD:-}" ]; then
  echo "PSEUDOGATE_DB_PASSWORD non impostata" >&2
  exit 1
fi

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
     -v app_pw="$PSEUDOGATE_DB_PASSWORD" <<'SQL'
CREATE ROLE pseudogate_app LOGIN PASSWORD :'app_pw' NOSUPERUSER NOCREATEDB NOCREATEROLE;
ALTER DATABASE pseudogate OWNER TO pseudogate_app;
ALTER SCHEMA public OWNER TO pseudogate_app;
REVOKE ALL ON DATABASE pseudogate FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE pseudogate TO pseudogate_app;
SQL
