#!/bin/sh
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Scarica in src/vendor/ le librerie OCR e PDF della Personal edition (versioni fissate, impronte
# SHA-256 verificate). Serve solo a chi ricostruisce la cartella da zero: i file sono già nel
# repository. Uso: sh scripts/vendor-ocr.sh  (dalla cartella extension/)
set -eu
CDN=https://cdn.jsdelivr.net/npm
cd "$(dirname "$0")/.."

get() { # url destinazione sha256
  mkdir -p "$(dirname "$2")"
  curl -fsSL "$1" -o "$2.tmp"
  echo "$3  $2.tmp" | sha256sum -c --quiet - || { echo "Impronta errata: $2" >&2; rm -f "$2.tmp"; exit 1; }
  mv "$2.tmp" "$2"
}

get $CDN/tesseract.js@6.0.1/dist/tesseract.min.js src/vendor/tesseract/tesseract.min.js 10fff78484067759c43028a02a72d76d0b90eb17302bb23b58a9ec5410bc928b
get $CDN/tesseract.js@6.0.1/dist/worker.min.js src/vendor/tesseract/worker.min.js 38645599043239c0eb6db08a6504a92dcdc292200535f3e9339cd77c4443b842
get $CDN/tesseract.js@6.0.1/LICENSE.md src/vendor/tesseract/LICENSE b40930bbcf80744c86c46a12bc9da056641d722716c378f5659b9e555ef833e1
get $CDN/tesseract.js-core@6.1.2/tesseract-core-simd-lstm.wasm.js src/vendor/tesseract/core/tesseract-core-simd-lstm.wasm.js 9d7c43fb206dc9f48475228b46bf35f888fa9e6259da2e67d5a75c77049f2dc7
get $CDN/tesseract.js-core@6.1.2/tesseract-core-lstm.wasm.js src/vendor/tesseract/core/tesseract-core-lstm.wasm.js 775a35df6f2ae100e02609443e6bd5cafcd07983dd6175454ca4a432a7730687
get $CDN/tesseract.js-core@6.1.2/LICENSE src/vendor/tesseract/core/LICENSE c6596eb7be8581c18be736c846fb9173b69eccf6ef94c5135893ec56bd92ba08
get $CDN/@tesseract.js-data/ita@1.0.0/4.0.0_best_int/ita.traineddata.gz src/vendor/tesseract/lang/ita.traineddata.gz f702fcfad297ce028ede3626d1467b67939f23ff23595f9badd54681cf25a4d3
get $CDN/mupdf@1.28.1/dist/mupdf.js src/vendor/mupdf/mupdf.js 5d237eadcb9640584e0050f6f958e547887b7a54d80a04043e12be9420931076
get $CDN/mupdf@1.28.1/dist/mupdf-wasm.js src/vendor/mupdf/mupdf-wasm.js 25382abbfbf5c52191e5ac59e1412a0da88647fecfab0c1d797bb5948443eea4
get $CDN/mupdf@1.28.1/dist/mupdf-wasm.wasm src/vendor/mupdf/mupdf-wasm.wasm 5a30ef7b027f541ea8fc54e7c73f16414b0b59940741a12efe5e55f1fd0a99d7
get $CDN/mupdf@1.28.1/LICENSE src/vendor/mupdf/LICENSE 57c8ff33c9c0cfc3ef00e650a1cc910d7ee479a8bc509f6c9209a7c2a11399d6
echo "Librerie OCR e PDF pronte in src/vendor/."
