#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Sblocca OpenBao dopo un riavvio (chiavi Shamir). Ogni custode inserisce la propria
# chiave quando richiesto; servono tante chiavi quanto la soglia (OPENBAO_KEY_THRESHOLD).
# Le chiavi NON vengono mostrate né salvate.
#
#   ./scripts/openbao-unseal.sh
set -euo pipefail
cd "$(dirname "$0")/.."

sealed() { docker compose exec -T openbao bao status >/dev/null 2>&1; [ $? -eq 2 ]; }

if ! sealed; then
  echo "OpenBao non è sigillato (o non è in esecuzione: docker compose ps openbao)."
  exit 0
fi
while sealed; do
  read -r -s -p "Chiave di sblocco: " key
  echo
  [ -z "$key" ] && continue
  # la chiave passa via stdin, così non compare nella lista dei processi dell'host
  printf '%s\n' "$key" | docker compose exec -T openbao sh -c 'read -r k; bao operator unseal "$k"' \
    | grep -E '^(Sealed|Unseal Progress)' || true
  unset key
done
echo "OpenBao sbloccato."
