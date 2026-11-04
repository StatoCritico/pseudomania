#!/bin/sh
# SPDX-License-Identifier: AGPL-3.0-or-later
# Comando di build di Cloudflare Pages: copia in dist/ solo le pagine pubblicabili.
# Impostazione del progetto Pages: Build command = sh site/_build/pubblica.sh, output = dist
set -e
rm -rf dist
mkdir -p dist
cp -r site/index.html site/privacy.html site/404.html site/approfondimenti site/assets site/_headers dist/
echo "Pubblicabili: $(find dist -type f | wc -l) file"
