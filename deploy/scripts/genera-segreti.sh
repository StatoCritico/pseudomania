#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Genera i segreti di deploy/.env.
#
#   cd deploy && ./scripts/genera-segreti.sh
#
# - se .env non esiste lo crea da .env.example;
# - sostituisce SOLO i valori segnaposto (mai i segreti già presenti):
#     __GENERA__        40 caratteri alfanumerici
#     __GENERA_HEX32__  64 caratteri esadecimali (32 byte)
#     __GENERA_PK__     chiave pubblica Langfuse  pk-lf-<uuid>
#     __GENERA_SK__     chiave segreta Langfuse   sk-lf-<uuid>
# - imposta i permessi 600 su .env e crea secrets/ (700) e certs/ (750).
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE=".env"
if [ ! -f "$ENV_FILE" ]; then
  cp .env.example "$ENV_FILE"
  echo "Creato $ENV_FILE da .env.example"
fi
umask 077

rand_bytes() { head -c "$1" /dev/urandom; }
# niente "tr < /dev/urandom | head": con pipefail il SIGPIPE di tr farebbe uscire lo script
alnum() {
  local n="${1:-40}" s=""
  while [ "${#s}" -lt "$n" ]; do
    s+=$(rand_bytes 256 | LC_ALL=C tr -dc 'A-Za-z0-9')
  done
  printf '%s' "${s:0:$n}"
}
hex32() { rand_bytes 32 | od -An -vtx1 | tr -d ' \n'; }
uuid() {
  if [ -r /proc/sys/kernel/random/uuid ]; then cat /proc/sys/kernel/random/uuid
  else local h; h=$(rand_bytes 16 | od -An -vtx1 | tr -d ' \n')
       echo "${h:0:8}-${h:8:4}-4${h:13:3}-a${h:17:3}-${h:20:12}"; fi
}

tmp=$(mktemp "${ENV_FILE}.XXXXXX")
count=0
while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in
    *=__GENERA__)       line="${line%__GENERA__}$(alnum 40)"; count=$((count + 1)) ;;
    *=__GENERA_HEX32__) line="${line%__GENERA_HEX32__}$(hex32)"; count=$((count + 1)) ;;
    *=__GENERA_PK__)    line="${line%__GENERA_PK__}pk-lf-$(uuid)"; count=$((count + 1)) ;;
    *=__GENERA_SK__)    line="${line%__GENERA_SK__}sk-lf-$(uuid)"; count=$((count + 1)) ;;
  esac
  printf '%s\n' "$line" >> "$tmp"
done < "$ENV_FILE"
mv "$tmp" "$ENV_FILE"
chmod 600 "$ENV_FILE"

mkdir -p secrets secrets/api certs custodia registro esportazioni
chmod 700 secrets
chmod 750 certs

# token amministrativo per POST /v1/keys/recovered (caricamento delle chiavi recuperate
# dai custodi). Facoltativo: chi non lo usa può cancellare il file.
if [ ! -s secrets/api/admin-api-token ]; then
  alnum 48 > secrets/api/admin-api-token
  echo "Creato secrets/api/admin-api-token"
fi
# cartelle e file letti/scritti dall'api (utente 10001 nel container)
API_UID=10001
if chown -R "$API_UID:$API_UID" secrets/api registro esportazioni 2>/dev/null; then
  chmod 500 secrets/api && chmod 400 secrets/api/admin-api-token
  chmod 750 registro
  chmod 700 esportazioni   # esportazioni per i custodi: escluse dai backup, svuotare dopo l'uso
else
  echo "Nota: eseguire lo script con sudo, oppure: sudo chown -R 10001:10001 secrets/api registro esportazioni"
fi

echo "Segreti generati: $count."
if grep -Eq '^[A-Z0-9_]+=__GENERA' "$ENV_FILE"; then
  echo "ATTENZIONE: restano segnaposto non sostituiti in $ENV_FILE" >&2
  exit 1
fi
echo "Ora imposta a mano i valori 'DA IMPOSTARE' in $ENV_FILE (domini, OIDC, email)."
