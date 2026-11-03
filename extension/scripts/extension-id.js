#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 gli autori di Pseudomania
//
// Calcola l'ID dell'estensione Chrome e il valore del campo "key" del manifest.
//
//   node scripts/extension-id.js chiave-privata.pem        # da una chiave privata PEM (RSA)
//   node scripts/extension-id.js                           # dal campo "key" di manifest.json
//   node scripts/extension-id.js chiave.pem --scrivi       # scrive "key" in manifest.json
//
// ID = primi 32 caratteri esadecimali dello SHA-256 della chiave pubblica (DER, SubjectPublicKeyInfo),
// con le cifre 0-9a-f trascritte nelle lettere a-p.

'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const MANIFEST = path.join(__dirname, '..', 'manifest.json');

function idFromDer(der) {
  const hex = crypto.createHash('sha256').update(der).digest('hex').slice(0, 32);
  return [...hex].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
}

function publicDerFromPem(pemText) {
  const key = crypto.createPublicKey(crypto.createPrivateKey(pemText));
  return key.export({ type: 'spki', format: 'der' });
}

function main() {
  const args = process.argv.slice(2);
  const pemPath = args.find((a) => !a.startsWith('--'));
  let der;
  if (pemPath) der = publicDerFromPem(fs.readFileSync(pemPath, 'utf8'));
  else {
    const m = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
    if (!m.key) {
      console.error('manifest.json non contiene "key": indicare una chiave privata PEM.');
      process.exit(1);
    }
    der = Buffer.from(m.key, 'base64');
  }
  const key = der.toString('base64');
  const id = idFromDer(der);
  console.log(`ID estensione:  ${id}`);
  console.log(`Redirect OIDC:  https://${id}.chromiumapp.org/oidc`);
  console.log(`CORS server:    CORS_ALLOW_ORIGIN_REGEX=^chrome-extension://${id}`);
  console.log(`Campo "key":    ${key}`);
  if (args.includes('--scrivi')) {
    const text = fs.readFileSync(MANIFEST, 'utf8');
    const m = JSON.parse(text);
    m.key = key;
    fs.writeFileSync(MANIFEST, JSON.stringify(m, null, 2) + '\n');
    console.log('manifest.json aggiornato.');
  }
}

if (require.main === module) main();
module.exports = { idFromDer, publicDerFromPem };
