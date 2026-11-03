#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Dopo OGNI ripristino da backup (DB applicativo e/o key store): riapplica le cancellazioni
# registrate dopo la data del backup, leggendo l'esportazione del registro che sta FUORI dal
# database (deploy/registro/cancellazioni.jsonl). Idempotente. Redigere il verbale.
#
#   ./scripts/riapplica-cancellazioni.sh "Nome Cognome operatore" [file.jsonl]
set -euo pipefail
cd "$(dirname "$0")/.."
OPERATORE="${1:?indicare il nome dell operatore come primo argomento}"
FILE="${2:-/var/lib/pseudogate/registro/cancellazioni.jsonl}"
docker compose exec -T api python -m pseudogate --operatore "$OPERATORE" \
  cancellazioni riapplica --file "$FILE"
docker compose exec -T api python -m pseudogate registri verifica
