#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Backup cifrato del DB applicativo di Pseudomania (Server edition). Da eseguire sull'host, nella cartella
# deploy/, ad esempio ogni notte da cron:
#   15 2 * * *  cd /opt/pseudogate/deploy && ./scripts/backup.sh >> /var/log/pseudogate-backup.log 2>&1
#
# NON include il key store (escrow delle chiavi utente): ha un backup separato,
# scripts/backup-chiavi.sh, con rotazione di 14 giorni e destinazione diversa.
#
# Rotazione (DECISIONI.md, ≤ 35 giorni): 7 backup giornalieri in BACKUP_DIR/giornalieri e
# 4 settimanali (la domenica, o BACKUP_WEEKLY_DAY) in BACKUP_DIR/settimanali.
#
# COPIA OFFLINE (obbligatoria): almeno una volta alla settimana copiare l'ultima cartella
# settimanale su un supporto scollegabile (disco esterno cifrato o nastro) custodito fuori
# dalla sala server, ad esempio:
#     rsync -a --delete /var/backups/pseudogate/settimanali/ /media/backup-offline/pseudogate/
# poi scollegare il supporto. Annotare data e operatore nel registro dei backup. I file sono
# già cifrati (age/gpg); la chiave privata di decifratura non sta né sulla VM né sul supporto.
#
# Contenuto di ogni backup (un file per componente, tutti cifrati):
#   pseudogate-<data>.sql.gz.age   pg_dump del DB "pseudogate" (dizionario cifrato + registro)
#   langfuse-<data>.sql.gz.age     pg_dump del DB di Langfuse (utenti, progetti, chiavi API)
#   openbao-<data>.snap.age        snapshot raft di OpenBao (chiavi transit, cifrate dal seal)
#   env-<data>.age                 il file .env (segreti di deploy)
#   segreti-<data>.tar.age         secrets/openbao-approle/ (role_id, secret_id dell'api),
#                                  secrets/openbao-backup-token, secrets/pgp/ (chiavi PUBBLICHE
#                                  dei custodi), certs/ e ca/ (certificati e chiavi TLS), config/
#                                  NON include secrets/openbao-init*.txt (quote: solo ai custodi)
#   registro-<data>.tar.age         esportazione del registro delle cancellazioni (registro/),
#                                  da riapplicare dopo un ripristino (vedi sotto, passo 7)
# (estensione .gpg invece di .age se si usa GPG)
#
# Le trace di Langfuse in ClickHouse e gli oggetti in SeaweedFS NON sono inclusi:
# contengono solo testi pseudonimizzati e si possono ricostruire; se servono, usare
# "BACKUP ... TO Disk" di ClickHouse e una copia del volume langfuse-seaweedfs.
#
# Cifratura: age (consigliato, https://age-encryption.org) con BACKUP_AGE_RECIPIENT,
# oppure GPG con BACKUP_GPG_RECIPIENT. La chiave privata NON deve stare sulla VM.
#
# =============================================================================
# RIPRISTINO (note)
# =============================================================================
# Prerequisiti: stessa versione dei container (deploy/VERSIONS.md), il file .env
# originale, la chiave privata age/GPG, le chiavi di sblocco di OpenBao (custodi).
#
#  0. decifrare:   age -d -i chiave.txt -o file  file.age     (oppure gpg -d)
#  1. .env:        ripristinare deploy/.env (permessi 600)
#  2. avviare solo i servizi di base su volumi vuoti:
#        docker compose up -d postgres langfuse-postgres openbao
#  3. PostgreSQL di Pseudomania (DB applicativo). Il dump è senza proprietari (--no-owner): va caricato COME
#     pseudogate_app (creato da postgres/init/01-pseudogate.sh al primo avvio del volume),
#     così tabelle e sequenze appartengono all'utente dell'api:
#        gunzip -c pseudogate-<data>.sql.gz | docker compose exec -T postgres \
#          psql -U pseudogate_app -d pseudogate -v ON_ERROR_STOP=1
#     (se per errore si è caricato come postgres:
#        docker compose exec -T postgres psql -U postgres -d pseudogate \
#          -c 'REASSIGN OWNED BY postgres TO pseudogate_app')
#  4. Langfuse:
#        gunzip -c langfuse-<data>.sql.gz | docker compose exec -T langfuse-postgres \
#          psql -U langfuse -d langfuse -v ON_ERROR_STOP=1
#  5. OpenBao (su un'istanza NUOVA va prima inizializzata e sbloccata con chiavi
#     temporanee, poi lo snapshot sostituisce tutto, chiavi di sblocco comprese):
#     (in .env lasciare vuota OPENBAO_PGP_KEYS per l'istanza temporanea)
#        docker compose --profile init run --rm -e OPENBAO_REVOKE_ROOT=false openbao-init
#        TMPROOT=$(awk '/^Initial Root Token:/{print $NF}' secrets/openbao-init.txt)
#        docker compose cp openbao-<data>.snap openbao:/tmp/restore.snap
#        printf '%s' "$TMPROOT" | docker compose exec -T openbao sh -c \
#          'read -r BAO_TOKEN; export BAO_TOKEN; bao operator raft snapshot restore -force /tmp/restore.snap'
#        shred -u secrets/openbao-init.txt     # quote e token temporanei non servono più
#        ./scripts/openbao-unseal.sh        # con le chiavi ORIGINALI dei custodi
#     Le credenziali AppRole dell'api devono corrispondere allo snapshot: estrarre
#     l'archivio dei segreti dello STESSO backup (ripristina anche certs/ e il token di backup):
#        tar -xf segreti-<data>.tar -C deploy/     # poi: chown -R 10001:10001 secrets/openbao-approle
#     In alternativa rigenerare il secret_id con un token amministrativo (generate-root):
#        rm secrets/openbao-approle/secret_id
#        read -rs BAO_TOKEN && export BAO_TOKEN
#        docker compose --profile init run --rm -e BAO_TOKEN openbao-init
#  6. ripristinare anche il key store dal suo backup (scripts/backup-chiavi.sh, note in testa)
#  7. riapplicare le cancellazioni avvenute DOPO il backup (dal registro più recente, che è
#     fuori dal DB: cartella registro/ attuale o la copia nel backup più recente):
#        docker compose up -d api
#        docker compose exec api python -m pseudogate --operatore "<nome>" \
#          cancellazioni riapplica --file /var/lib/pseudogate/registro/cancellazioni.jsonl
#     (oppure ./scripts/riapplica-cancellazioni.sh) e redigere il verbale.
#  8. docker compose up -d   e verificare: curl -k https://<dominio>/v1/health
#
# Provare il ripristino su una VM di test almeno una volta l'anno.
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

set -a
# shellcheck disable=SC1091
. ./.env
set +a

BACKUP_DIR="${BACKUP_DIR:-/var/backups/pseudogate}"
DAILY_KEEP="${BACKUP_DAILY_KEEP:-7}"
WEEKLY_KEEP="${BACKUP_WEEKLY_KEEP:-4}"
WEEKLY_DAY="${BACKUP_WEEKLY_DAY:-7}"   # 1=lunedì ... 7=domenica
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
umask 077
DEST="$BACKUP_DIR/giornalieri/$STAMP"
mkdir -p "$DEST" "$BACKUP_DIR/settimanali"

if [ -n "${BACKUP_AGE_RECIPIENT:-}" ]; then
  command -v age >/dev/null || { echo "age non installato" >&2; exit 1; }
  EXT=age
  encrypt() { age -r "$BACKUP_AGE_RECIPIENT" -o "$1"; }
elif [ -n "${BACKUP_GPG_RECIPIENT:-}" ]; then
  command -v gpg >/dev/null || { echo "gpg non installato" >&2; exit 1; }
  EXT=gpg
  encrypt() { gpg --batch --yes --trust-model always -r "$BACKUP_GPG_RECIPIENT" -o "$1" --encrypt; }
else
  echo "Imposta BACKUP_AGE_RECIPIENT o BACKUP_GPG_RECIPIENT in .env: niente backup in chiaro." >&2
  exit 1
fi

log() { echo "$(date -u +%FT%TZ) $*"; }
dc() { docker compose "$@"; }

log "Backup PostgreSQL pseudogate (DB applicativo)"
dc exec -T postgres pg_dump -U postgres -d pseudogate --no-owner --clean --if-exists \
  | gzip -9 | encrypt "$DEST/pseudogate-$STAMP.sql.gz.$EXT"

if dc ps --status running --services 2>/dev/null | grep -qx langfuse-postgres; then
  log "Backup PostgreSQL langfuse"
  dc exec -T langfuse-postgres pg_dump -U langfuse -d langfuse --no-owner --clean --if-exists \
    | gzip -9 | encrypt "$DEST/langfuse-$STAMP.sql.gz.$EXT"
else
  log "langfuse-postgres non in esecuzione: salto"
fi

log "Snapshot OpenBao (chiave HMAC)"
if [ ! -s secrets/openbao-backup-token ]; then
  echo "Manca secrets/openbao-backup-token (creato da openbao-init)" >&2
  exit 1
fi
BAO_BACKUP_TOKEN=$(cat secrets/openbao-backup-token)
# rinnova il token periodico (scade se non usato per 32 giorni)
printf '%s' "$BAO_BACKUP_TOKEN" | dc exec -T openbao sh -c \
  'read -r BAO_TOKEN; export BAO_TOKEN; bao token renew >/dev/null && \
   bao operator raft snapshot save /tmp/pg-backup.snap >/dev/null && cat /tmp/pg-backup.snap; \
   rc=$?; rm -f /tmp/pg-backup.snap; exit $rc' \
  | encrypt "$DEST/openbao-$STAMP.snap.$EXT"
unset BAO_BACKUP_TOKEN

log "Copia di .env"
encrypt "$DEST/env-$STAMP.$EXT" < .env

log "Segreti di deploy (AppRole dell'api, token, chiavi pubbliche, certificati, custodia pubblica)"
items=""
for p in secrets/openbao-approle secrets/openbao-backup-token secrets/api secrets/pgp certs ca config custodia; do
  [ -e "$p" ] && items="$items $p"
done
# shellcheck disable=SC2086
tar -cf - --exclude='secrets/openbao-init*' $items | encrypt "$DEST/segreti-$STAMP.tar.$EXT"

log "Registro delle cancellazioni"
dc exec -T api python -m pseudogate --operatore "backup automatico" cancellazioni esporta >/dev/null || log "esportazione non riuscita (api ferma?)"
tar -cf - registro | encrypt "$DEST/registro-$STAMP.tar.$EXT"

for f in "$DEST"/*; do
  [ -s "$f" ] || { echo "Backup vuoto: $f" >&2; exit 1; }
done

if [ "$(date -u +%u)" = "$WEEKLY_DAY" ]; then
  log "Copia settimanale"
  cp -a "$DEST" "$BACKUP_DIR/settimanali/$STAMP"
fi

log "Rotazione: $DAILY_KEEP giornalieri, $WEEKLY_KEEP settimanali"
prune() {  # tiene le ultime N cartelle (nomi ordinabili per data)
  local dir=$1 keep=$2
  ls -1d "$dir"/*/ 2>/dev/null | sort | head -n -"$keep" | while read -r old; do
    rm -rf -- "$old"
  done
}
prune "$BACKUP_DIR/giornalieri" "$DAILY_KEEP"
prune "$BACKUP_DIR/settimanali" "$WEEKLY_KEEP"

log "Backup completato in $DEST (ricordare la copia offline settimanale)"
