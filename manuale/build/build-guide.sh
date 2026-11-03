#!/bin/sh
# SPDX-License-Identifier: AGPL-3.0-or-later
# Genera DOCX e PDF delle guide rapide (stesso metodo del manuale).
set -eu
QUI=$(cd "$(dirname "$0")" && pwd)
MAN=$(dirname "$QUI")
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
cd "$MAN"
REF="$MAN/../governance/reference-a4.docx"
REFOPT=""
[ -f "$REF" ] && REFOPT="--reference-doc=$REF"
for g in guida-rapida-personal guida-rapida-utente-enterprise; do
  # shellcheck disable=SC2086
  pandoc "$g.md" -f markdown+pipe_tables $REFOPT -o "$g.docx"
  pandoc "$g.md" -f markdown+pipe_tables -s --embed-resources \
    --css="$QUI/stile.css" --css="$QUI/stile-guida.css" -t html5 -o "$TMP/$g.html"
  PIEDE="Guida rapida (bozza 0.1)" node "$QUI/stampa.js" pdf "$TMP/$g.html" "$g.pdf"
  echo "Prodotti: $g.docx $g.pdf ($(pdfinfo "$g.pdf" 2>/dev/null | awk '/Pages/{print $2}') pagine)"
done
