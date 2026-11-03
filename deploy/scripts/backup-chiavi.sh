#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Backup del KEY STORE di Pseudomania (DB "pseudogate_keys": copie di custodia delle chiavi
# utente). È SEPARATO dal backup del DB applicativo (scripts/backup.sh):
#   - destinazione diversa (BACKUP_KEYS_DIR, possibilmente su un altro supporto);
#   - rotazione di 14 giorni (BACKUP_KEYS_KEEP_DAYS), come da DECISIONI.md: un escrow
#     distrutto (rotazione o cancellazione) sparisce da tutti i backup entro 14 giorni;
#   - destinatario di cifratura facoltativamente diverso (BACKUP_KEYS_AGE_RECIPIENT o
#     BACKUP_KEYS_GPG_RECIPIENT; in mancanza si usano quelli di backup.sh).
# Gli escrow sono già cifrati con la chiave pubblica dei custodi: anche con questo backup,
# senza la soglia di custodi non si decifra nulla.
#
# Esempio di pianificazione (cron dell'host):
#   45 2 * * *  cd /opt/pseudogate/deploy && ./scripts/backup-chiavi.sh >> /var/log/pseudogate-backup-chiavi.log 2>&1
#
# RIPRISTINO: avviare postgres-keys su volume vuoto, poi
#   age -d -i chiave.txt keys-<data>.sql.gz.age | gunzip | docker compose exec -T postgres-keys \
#     psql -U pseudogate_keys_app -d pseudogate_keys -v ON_ERROR_STOP=1
# quindi riapplicare il registro delle cancellazioni (scripts/riapplica-cancellazioni.sh),
# che distrugge di nuovo gli escrow cancellati dopo la data del backup.
set -euo pipefail
cd "$(dirname "$0")/.."

set -a
# shellcheck disable=SC1091
. ./.env
set +a

DIR="${BACKUP_KEYS_DIR:-/var/backups/pseudogate-chiavi}"
KEEP_DAYS="${BACKUP_KEYS_KEEP_DAYS:-14}"
AGE_R="${BACKUP_KEYS_AGE_RECIPIENT:-${BACKUP_AGE_RECIPIENT:-}}"
GPG_R="${BACKUP_KEYS_GPG_RECIPIENT:-${BACKUP_GPG_RECIPIENT:-}}"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
umask 077
mkdir -p "$DIR"

if [ -n "$AGE_R" ]; then
  command -v age >/dev/null || { echo "age non installato" >&2; exit 1; }
  EXT=age; encrypt() { age -r "$AGE_R" -o "$1"; }
elif [ -n "$GPG_R" ]; then
  command -v gpg >/dev/null || { echo "gpg non installato" >&2; exit 1; }
  EXT=gpg; encrypt() { gpg --batch --yes --trust-model always -r "$GPG_R" -o "$1" --encrypt; }
else
  echo "Imposta BACKUP_KEYS_AGE_RECIPIENT (o BACKUP_AGE_RECIPIENT) in .env" >&2
  exit 1
fi

docker compose exec -T postgres-keys pg_dump -U postgres -d pseudogate_keys --no-owner --clean --if-exists \
  | gzip -9 | encrypt "$DIR/keys-$STAMP.sql.gz.$EXT"
[ -s "$DIR/keys-$STAMP.sql.gz.$EXT" ] || { echo "Backup vuoto" >&2; exit 1; }

find "$DIR" -maxdepth 1 -type f -name 'keys-*.sql.gz.*' -mtime +"$((KEEP_DAYS - 1))" -delete
echo "$(date -u +%FT%TZ) backup del key store in $DIR/keys-$STAMP.sql.gz.$EXT (rotazione $KEEP_DAYS giorni)"
