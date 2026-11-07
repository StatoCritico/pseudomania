// SPDX-License-Identifier: AGPL-3.0-or-later
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveConfig, DEFAULT_TAG_INSTRUCTION, DEFAULT_RIZZO_URL } = require('../../src/shared/config.js');

test('senza policy: Personal edition autonoma (Rizzo-PII locale, nessun server)', () => {
  const c = resolveConfig({});
  assert.equal(c.mode, 'personale');
  assert.equal(c.edition, 'personal');
  assert.equal(c.serverUrl, '');
  assert.equal(c.rizzoUrl, DEFAULT_RIZZO_URL);
  assert.equal(c.failClosed, false);
  assert.equal(c.allowDisable, true);
  assert.equal(c.enabled, true);
  assert.equal(c.authMethod, 'none');
  assert.equal(c.configured, true);
  assert.deepEqual(c.sites, ['claude.ai']);
  assert.equal(c.tagInstruction, DEFAULT_TAG_INSTRUCTION);
  assert.equal('globalTagScope' in c, false, 'globalTagScope eliminato');
});

test('personale: indirizzo di Rizzo-PII dalle impostazioni locali', () => {
  const c = resolveConfig({ local: { rizzoUrl: 'http://localhost:5099/', enabled: false, serverUrl: 'http://x' } });
  assert.equal(c.rizzoUrl, 'http://localhost:5099');
  assert.equal(c.serverUrl, '', 'nessun server nella Personal edition');
  assert.equal(c.enabled, true, 'nessun interruttore globale: lo stato è per conversazione');
});

test('ente: fail-closed, non disattivabile, impostazioni locali ignorate', () => {
  const c = resolveConfig({
    managed: { mode: 'ente', serverUrl: 'https://pg.ente.local', oidcIssuer: 'https://idp/', oidcClientId: 'pg' },
    local: { rizzoUrl: 'http://127.0.0.1:1', enabled: false },
  });
  assert.equal(c.edition, 'server');
  assert.equal(c.serverUrl, 'https://pg.ente.local');
  assert.equal(c.rizzoUrl, '');
  assert.equal(c.failClosed, true);
  assert.equal(c.allowDisable, false);
  assert.equal(c.enabled, true);
  assert.equal(c.authMethod, 'oidc');
  assert.equal(c.oidc.issuer, 'https://idp');
  assert.equal(c.configured, true);
});

test('ente senza serverUrl: non configurato (e quindi fail-closed)', () => {
  const c = resolveConfig({ managed: { mode: 'ente' } });
  assert.equal(c.serverUrl, '');
  assert.equal(c.configured, false);
  assert.equal(c.failClosed, true);
});

test('ente: /v1/config non può indebolire failClosed/allowDisable; campi della cifratura', () => {
  const server = {
    failClosed: false, allowDisable: true, tagInstruction: 'ISTR', maxFileMB: 7, allowlist: ['Comune'],
    escrowPublicKey: 'MII...', escrowKeyId: 'esc-1', rotateKey: true, keyRotationDays: 30, pendingEntryMinutes: 5,
  };
  const a = resolveConfig({ managed: { mode: 'ente', serverUrl: 'https://x' }, server, local: { enabled: false }, serverTs: 123 });
  assert.equal(a.failClosed, true, 'solo la policy decide in ente');
  assert.equal(a.allowDisable, false);
  assert.equal(a.enabled, true);
  assert.equal(a.tagInstruction, 'ISTR');
  assert.equal(a.maxFileMB, 7);
  assert.equal(a.escrowPublicKey, 'MII...');
  assert.equal(a.escrowKeyId, 'esc-1');
  assert.equal(a.rotateKey, true);
  assert.equal(a.keyRotationDays, 30);
  assert.equal(a.pendingEntryMinutes, 5);
  assert.equal(a.serverConfigTs, 123);
  const d = resolveConfig({ managed: { mode: 'ente', serverUrl: 'https://x' } });
  assert.equal(d.keyRotationDays, 90);
  assert.equal(d.rotateKey, false);
});

test('ente: la policy può esplicitamente consentire la disattivazione', () => {
  const c = resolveConfig({ managed: { mode: 'ente', serverUrl: 'https://x', allowDisable: true, failClosed: false }, local: { enabled: false } });
  assert.equal(c.allowDisable, true);
  assert.equal(c.failClosed, false);
  assert.equal(c.enabled, false);
});

test('istruzione di riserva identica alla SPEC', () => {
  const spec = require('fs').readFileSync(require('path').join(__dirname, '..', '..', '..', 'SPEC.md'), 'utf8');
  const m = spec.match(/> (I testi contengono[\s\S]*?di nuovi\.)/);
  if (!m) return; // SPEC non disponibile fuori dal repository
  assert.equal(DEFAULT_TAG_INSTRUCTION, m[1].replace(/\n> /g, ' ').replace(/\s+/g, ' '));
});

test('valori di policy con tipo errato vengono ignorati', () => {
  const c = resolveConfig({ managed: { mode: 'boh', failClosed: 'yes', sites: 'claude.ai' } });
  assert.equal(c.mode, 'personale');
  assert.equal(c.failClosed, false);
  assert.deepEqual(c.sites, ['claude.ai']);
});

test('manifest: campo key presente, ID calcolabile, nome Pseudomania e sito', () => {
  const m = require('../../manifest.json');
  const { idFromDer } = require('../../scripts/extension-id.js');
  assert.ok(m.key, 'manca "key" in manifest.json');
  assert.match(idFromDer(Buffer.from(m.key, 'base64')), /^[a-p]{32}$/);
  assert.equal(m.name, 'Pseudomania');
  assert.equal(m.homepage_url, 'https://pseudomania.statocritico.it');
});

test('immagini e modalità di attivazione: predefiniti per edizione, valori non validi ignorati', () => {
  const { resolveConfig } = require('../../src/shared/config.js');
  const p = resolveConfig({});
  assert.equal(p.imagePolicy, 'ocr', 'Personal: oscuramento automatico predefinito');
  assert.equal(p.imagePolicyEffective, 'ocr');
  assert.equal(p.activationMode, 'off');
  const p2 = resolveConfig({ local: { imagePolicy: 'ocr', activationMode: 'ask' } });
  assert.equal(p2.imagePolicy, 'ocr');
  assert.equal(p2.imagePolicyEffective, 'ocr', 'Personal: OCR locale disponibile');
  assert.equal(p2.activationMode, 'ask');
  const p3 = resolveConfig({ local: { imagePolicy: 'qualsiasi', activationMode: 'x' } });
  assert.equal(p3.imagePolicy, 'ocr');
  assert.equal(p3.activationMode, 'off');
  const pc = resolveConfig({ local: { imagePolicy: 'confirm' } });
  assert.equal(pc.imagePolicy, 'confirm');
  assert.equal(pc.imagePolicyEffective, 'confirm');
  const pb = resolveConfig({ local: { imagePolicy: 'block' } });
  assert.equal(pb.imagePolicyEffective, 'block');
  const e4 = resolveConfig({ managed: { mode: 'ente', imagePolicy: 'ocr' }, local: { imagePolicy: 'ocr' } });
  assert.equal(e4.imagePolicy, 'ocr');
  assert.equal(e4.imagePolicyEffective, 'block', 'Server edition: OCR non disponibile, vale come «bloccate»');
  const e5 = resolveConfig({ managed: { mode: 'ente' }, local: { imagePolicy: 'ocr' } });
  assert.equal(e5.imagePolicyEffective, 'block');
  const e = resolveConfig({ managed: { mode: 'ente', serverUrl: 'https://s' }, local: { imagePolicy: 'confirm' } });
  assert.equal(e.imagePolicy, 'block', 'Server edition: decide solo la policy');
  const e2 = resolveConfig({ managed: { mode: 'ente', imagePolicy: 'confirm' } });
  assert.equal(e2.imagePolicyEffective, 'confirm');
  const e3 = resolveConfig({ managed: { mode: 'ente', imagePolicy: 'sbagliato' } });
  assert.equal(e3.imagePolicy, 'block');
});

test('immagini nei PDF: solo Personal, ocr|remove|keep, predefinito ocr', () => {
  const { resolveConfig, PDF_IMAGE_POLICIES } = require('../../src/shared/config.js');
  assert.deepEqual(PDF_IMAGE_POLICIES, ['ocr', 'remove', 'keep']);
  assert.equal(resolveConfig({}).pdfImagePolicy, 'ocr');
  assert.equal(resolveConfig({ local: { pdfImagePolicy: 'remove' } }).pdfImagePolicy, 'remove');
  assert.equal(resolveConfig({ local: { pdfImagePolicy: 'keep' } }).pdfImagePolicy, 'keep');
  assert.equal(resolveConfig({ local: { pdfImagePolicy: 'block' } }).pdfImagePolicy, 'ocr', 'valore non valido');
  assert.equal(resolveConfig({ local: { pdfImagePolicy: 42 } }).pdfImagePolicy, 'ocr');
  const e = resolveConfig({ managed: { mode: 'ente', serverUrl: 'https://s' }, local: { pdfImagePolicy: 'keep' } });
  assert.equal(e.pdfImagePolicy, null, 'Server edition: i PDF li tratta il server');
  const { toPlain } = require('../../src/shared/config.js');
  assert.equal(toPlain(resolveConfig({ local: { pdfImagePolicy: 'remove' } })).pdfImagePolicy, 'remove');
});
