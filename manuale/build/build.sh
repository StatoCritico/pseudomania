#!/bin/sh
# SPDX-License-Identifier: AGPL-3.0-or-later
# Genera Manuale-Pseudomania.docx e Manuale-Pseudomania.pdf dai capitoli Markdown.
set -eu
QUI=$(cd "$(dirname "$0")" && pwd)
MAN=$(dirname "$QUI")
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

cd "$MAN"

# 1. schema: SVG -> PNG (usato da DOCX e PDF)
node "$QUI/stampa.js" svg2png img/schema-funzionamento.svg img/schema-funzionamento.png

# 2. unione dei capitoli
python3 "$QUI/prepara.py" "$MAN" "$TMP/manuale.md"

COMUNI="-f markdown+pipe_tables+task_lists --metadata-file=$QUI/metadati.yaml --resource-path=$MAN --toc --toc-depth=2"

# 3. DOCX
REF="$MAN/../governance/reference-a4.docx"
REFOPT=""
[ -f "$REF" ] && REFOPT="--reference-doc=$REF"
# shellcheck disable=SC2086
pandoc "$TMP/manuale.md" $COMUNI $REFOPT -o "$MAN/Manuale-Pseudomania.docx"

# 4. PDF: HTML autonomo + stampa con Chromium
# shellcheck disable=SC2086
pandoc "$TMP/manuale.md" $COMUNI -s --embed-resources \
  --css="$QUI/stile.css" -t html5 -o "$TMP/manuale.html"
node "$QUI/stampa.js" pdf "$TMP/manuale.html" "$MAN/Manuale-Pseudomania.pdf"

echo "Prodotti: $MAN/Manuale-Pseudomania.docx  $MAN/Manuale-Pseudomania.pdf"
