#!/bin/sh
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Inizializzazione di OpenBao per Pseudomania (Server edition) (idempotente: si può rieseguire).
#
#   docker compose --profile init run --rm openbao-init
#
# DUE MODALITÀ di inizializzazione (scelte con OPENBAO_PGP_KEYS in .env):
#
# A) CONSIGLIATA - quote cifrate con PGP, una chiave pubblica per custode.
#    Prima della cerimonia ogni custode consegna la propria chiave PUBBLICA, esportata così:
#        gpg --export <id-chiave> | base64 -w0 > custode1.b64
#    e i file vanno copiati in deploy/secrets/pgp/. In .env:
#        OPENBAO_PGP_KEYS=custode1.b64,custode2.b64,custode3.b64,custode4.b64,custode5.b64
#        OPENBAO_ROOT_TOKEN_PGP_KEY=custode1.b64     # chi riceve il token root (cifrato)
#    Il numero di file deve essere uguale a OPENBAO_KEY_SHARES.
#    Primo passaggio: "operator init" con -pgp-keys e -root-token-pgp-key. Ogni quota e il
#    token root escono già CIFRATI per il rispettivo custode in secrets/openbao-init-cifrato.txt:
#    nessuno (nemmeno chi esegue lo script) vede le quote in chiaro. Poi:
#      1. ogni custode decifra la propria quota sul suo PC:
#             echo "<quota>" | base64 -d | gpg -d
#         e la inserisce con ./scripts/openbao-unseal.sh (fino alla soglia);
#      2. il destinatario del token root lo decifra allo stesso modo e riesegue lo script
#         passando il token senza scriverlo sulla riga di comando:
#             read -rs BAO_TOKEN && export BAO_TOKEN
#             docker compose --profile init run --rm -e BAO_TOKEN openbao-init
#      3. al termine lo script REVOCA il token root (OPENBAO_REVOKE_ROOT=true, predefinito).
#
# B) SEMPLICE - senza PGP (OPENBAO_PGP_KEYS vuota): le quote sono scritte in chiaro in
#    secrets/openbao-init.txt (chi esegue lo script le vede tutte: il doppio controllo
#    dipende dalla procedura). Lo script sblocca, configura, poi REVOCA il token root e lo
#    TOGLIE dal file: restano solo le quote, da distribuire ai custodi e poi cancellare
#    (shred -u secrets/openbao-init.txt).
#    Solo per il RIPRISTINO su un'istanza temporanea: -e OPENBAO_REVOKE_ROOT=false lascia
#    il token root temporaneo nel file, per caricare lo snapshot (vedi scripts/backup.sh).
#
# Configurazione applicata (entrambe le modalità):
#   - motore transit con la chiave HMAC non esportabile e non cancellabile:
#       user-hmac (hmac, 32 byte)  pseudonimi degli utenti, HMAC dei valori e degli scope
#     (i valori del dizionario NON sono cifrati da OpenBao: li cifra l'estensione con la
#      chiave dell'utente; vedi DECISIONI.md)
#   - policy "pseudogate-api" (solo hmac su quella chiave) e AppRole
#     "pseudogate-api": role_id e secret_id in secrets/openbao-approle/ (letti dall'api)
#   - policy "pseudogate-backup" e token periodico secrets/openbao-backup-token (snapshot)
#
# Operazioni amministrative successive (es. nuovo secret_id): token generato con la
# soglia dei custodi ("bao operator generate-root", vedi docs/installazione-ente.md).
set -eu

OUT=/out
INIT_FILE="$OUT/openbao-init.txt"
INIT_PGP_FILE="$OUT/openbao-init-cifrato.txt"
PGP_DIR="$OUT/pgp"
APPROLE_DIR="$OUT/openbao-approle"
SHARES="${OPENBAO_KEY_SHARES:-5}"
THRESHOLD="${OPENBAO_KEY_THRESHOLD:-3}"
PGP_KEYS="${OPENBAO_PGP_KEYS:-}"
ROOT_PGP_KEY="${OPENBAO_ROOT_TOKEN_PGP_KEY:-}"
REVOKE_ROOT="${OPENBAO_REVOKE_ROOT:-true}"
API_UID="${API_UID:-10001}"
umask 077
mkdir -p "$OUT" "$APPROLE_DIR"

status_code() { bao status >/dev/null 2>&1; echo $?; }

echo "Attendo OpenBao su $BAO_ADDR ..."
i=0
while [ "$(status_code)" = "1" ]; do
  i=$((i + 1))
  if [ "$i" -gt 60 ]; then echo "OpenBao non risponde" >&2; exit 1; fi
  sleep 2
done

# --- 1. inizializzazione -------------------------------------------------------
if bao status 2>/dev/null | grep -Eq '^Initialized[[:space:]]+false'; then
  if [ -n "$PGP_KEYS" ]; then
    # percorsi completi dei file delle chiavi pubbliche (base64 di "gpg --export")
    paths=""
    n=0
    for k in $(echo "$PGP_KEYS" | tr ',' ' '); do
      [ -s "$PGP_DIR/$k" ] || { echo "Chiave PGP mancante: secrets/pgp/$k" >&2; exit 1; }
      paths="${paths:+$paths,}$PGP_DIR/$k"
      n=$((n + 1))
    done
    if [ "$n" != "$SHARES" ]; then
      echo "OPENBAO_PGP_KEYS contiene $n chiavi ma OPENBAO_KEY_SHARES=$SHARES" >&2
      exit 1
    fi
    [ -n "$ROOT_PGP_KEY" ] && [ -s "$PGP_DIR/$ROOT_PGP_KEY" ] || {
      echo "Imposta OPENBAO_ROOT_TOKEN_PGP_KEY (file in secrets/pgp/)" >&2; exit 1; }
    echo "Inizializzo OpenBao con quote cifrate PGP ($SHARES quote, soglia $THRESHOLD)..."
    bao operator init -key-shares="$SHARES" -key-threshold="$THRESHOLD" \
      -pgp-keys="$paths" -root-token-pgp-key="$PGP_DIR/$ROOT_PGP_KEY" > "$INIT_PGP_FILE"
    chmod 600 "$INIT_PGP_FILE"
    cat <<EOF
OpenBao inizializzato. Le quote e il token root sono CIFRATI in secrets/openbao-init-cifrato.txt
("Unseal Key N" è cifrata con la N-esima chiave di OPENBAO_PGP_KEYS: $PGP_KEYS).
Prossimi passi:
  1. consegnare a ogni custode la propria riga; ciascuno la decifra con
       echo "<quota>" | base64 -d | gpg -d
     e sblocca con ./scripts/openbao-unseal.sh (servono $THRESHOLD custodi);
  2. il destinatario del token root lo decifra e riesegue:
       read -rs BAO_TOKEN && export BAO_TOKEN
       docker compose --profile init run --rm -e BAO_TOKEN openbao-init
EOF
    exit 0
  fi
  echo "Inizializzo OpenBao ($SHARES quote, soglia $THRESHOLD) SENZA PGP..."
  bao operator init -key-shares="$SHARES" -key-threshold="$THRESHOLD" > "$INIT_FILE"
  chmod 600 "$INIT_FILE"
  echo "Quote di sblocco in secrets/openbao-init.txt: distribuirle ai custodi e cancellare il file."
fi

# --- 2. sblocco ---------------------------------------------------------------------
if [ "$(status_code)" = "2" ]; then
  if [ -f "$INIT_FILE" ] && grep -Eq '^(Unseal|Recovery) Key [0-9]+:' "$INIT_FILE"; then
    echo "Sblocco OpenBao con le quote in $INIT_FILE ..."
    grep -E '^(Unseal|Recovery) Key [0-9]+:' "$INIT_FILE" | head -n "$THRESHOLD" \
      | awk '{print $NF}' | while read -r key; do
          bao operator unseal "$key" >/dev/null
        done
  fi
  if [ "$(status_code)" = "2" ]; then
    echo "OpenBao è sigillato: i custodi lo sbloccano con scripts/openbao-unseal.sh, poi rilanciare." >&2
    exit 2
  fi
fi

# --- token amministrativo -------------------------------------------------------------
if [ -z "${BAO_TOKEN:-}" ] && [ -f "$INIT_FILE" ]; then
  BAO_TOKEN=$(grep -E '^Initial Root Token:' "$INIT_FILE" | awk '{print $NF}' || true)
fi
if [ -z "${BAO_TOKEN:-}" ]; then
  echo "Serve un token amministrativo (root decifrato o generato con generate-root):" >&2
  echo "  read -rs BAO_TOKEN && export BAO_TOKEN" >&2
  echo "  docker compose --profile init run --rm -e BAO_TOKEN openbao-init" >&2
  exit 3
fi
export BAO_TOKEN

# raft: attende che il nodo diventi leader
i=0
until bao secrets list >/dev/null 2>&1; do
  i=$((i + 1)); [ "$i" -gt 30 ] && { echo "OpenBao non pronto o token non valido" >&2; exit 1; }
  sleep 2
done

# --- 3. transit e chiavi ----------------------------------------------------------------
if ! bao secrets list | grep -q '^transit/'; then
  bao secrets enable transit
fi
if ! bao read transit/keys/user-hmac >/dev/null 2>&1; then
  bao write -f transit/keys/user-hmac type=hmac key_size=32 exportable=false
  echo "Creata la chiave transit user-hmac"
fi
# NB: NON ruotare user-hmac: l'api usa la versione 1 (OPENBAO_HMAC_KEY_VERSION) per
# avere pseudonimi e tag stabili.

# --- 4. policy e AppRole dell'api -----------------------------------------------------
bao policy write pseudogate-api - <<'POLICY'
# API di Pseudomania: solo HMAC, nessuna gestione
path "transit/hmac/user-hmac"    { capabilities = ["update"] }
path "transit/hmac/user-hmac/*"  { capabilities = ["update"] }
POLICY

if ! bao auth list | grep -q '^approle/'; then
  bao auth enable approle
fi
bao write auth/approle/role/pseudogate-api \
  token_policies=pseudogate-api token_ttl=1h token_max_ttl=4h \
  secret_id_ttl=0 secret_id_num_uses=0 token_num_uses=0 >/dev/null

bao read -field=role_id auth/approle/role/pseudogate-api/role-id > "$APPROLE_DIR/role_id"
if [ ! -s "$APPROLE_DIR/secret_id" ]; then
  bao write -f -field=secret_id auth/approle/role/pseudogate-api/secret-id > "$APPROLE_DIR/secret_id"
  echo "Creato un nuovo secret_id per l'api"
fi
chown "$API_UID:$API_UID" "$APPROLE_DIR" "$APPROLE_DIR/role_id" "$APPROLE_DIR/secret_id"
chmod 500 "$APPROLE_DIR"
chmod 400 "$APPROLE_DIR/role_id" "$APPROLE_DIR/secret_id"

# --- 5. backup ------------------------------------------------------------------------
bao policy write pseudogate-backup - <<'POLICY'
path "sys/storage/raft/snapshot" { capabilities = ["read"] }
path "auth/token/renew-self"     { capabilities = ["update"] }
POLICY
if [ ! -s "$OUT/openbao-backup-token" ]; then
  bao token create -orphan -policy=pseudogate-backup -period=768h \
    -display-name=pseudogate-backup -field=token > "$OUT/openbao-backup-token"
  chmod 600 "$OUT/openbao-backup-token"
  echo "Creato il token per i backup (secrets/openbao-backup-token)"
fi

# --- 6. token root: revoca e rimozione dal disco ----------------------------------------
if [ "$REVOKE_ROOT" = "true" ]; then
  if bao token lookup -format=json 2>/dev/null | grep -q '"root"'; then
    bao token revoke -self >/dev/null && echo "Token root revocato (rigenerabile solo con la soglia dei custodi)."
  fi
fi
if [ "$REVOKE_ROOT" = "true" ] && grep -q '^Initial Root Token:' "$INIT_FILE" 2>/dev/null; then
  sed -i '/^Initial Root Token:/d' "$INIT_FILE"
  echo "Token root rimosso da secrets/openbao-init.txt."
fi
unset BAO_TOKEN

echo "OpenBao pronto per Pseudomania."
if [ -f "$INIT_FILE" ]; then
  echo "RICORDA: distribuire le quote di secrets/openbao-init.txt ai custodi e poi: shred -u secrets/openbao-init.txt"
fi
