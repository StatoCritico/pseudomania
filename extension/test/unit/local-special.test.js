// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Personal edition: categorie particolari (artt. 9-10 GDPR) bloccate di default, invio
// pseudonimizzato solo con allowSpecial (conferma esplicita nello script di contenuto).
// Decisione dell'8/11/2026. local.js in un contesto vm isolato con stub di idb, keys e Rizzo-PII.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '../../src');
const read = (p) => fs.readFileSync(path.join(SRC, p), 'utf8');

function makeEnv(opts) {
  opts = opts || {};
  const store = {};
  const calls = { analyzeText: [], redact: [] };
  const ctx = {
    console: { warn() {}, log() {} },
    crypto: globalThis.crypto,
    TextEncoder, TextDecoder, setTimeout, clearTimeout, Promise, Date, Uint8Array, DataView, ArrayBuffer,
    CompressionStream: globalThis.CompressionStream, DecompressionStream: globalThis.DecompressionStream,
    Blob: globalThis.Blob, Response: globalThis.Response, DOMParser: undefined,
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of ['shared/policy-data.js', 'shared/policy.js', 'shared/rizzo.js', 'shared/textfile.js', 'shared/zip.js', 'shared/ooxml.js', 'shared/pdfwrite.js', 'shared/ocr-map.js']) {
    vm.runInContext(read(f), ctx, { filename: f });
  }
  const PG = ctx.PG;
  PG.strings = {};
  PG.keys = {
    b64: (buf) => Buffer.from(buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf).toString('base64'),
    unb64: (s) => new Uint8Array(Buffer.from(s, 'base64')),
  };
  PG.idb = {
    async get(st, k) { return (store[st] || {})[k]; },
    async put(st, rec) { (store[st] = store[st] || {})[st === 'pdict' ? rec.scopeKey : rec.id] = rec; },
    async add(st, rec) { (store[st] = store[st] || {})[Object.keys(store[st] || {}).length] = rec; },
    async all(st) { return Object.values(store[st] || {}); },
    async del(st, k) { delete (store[st] || {})[k]; },
  };
  const names = opts.names || ['Mario Rossi'];
  PG.rizzo.RizzoClient = class {
    async analyzeText(text) {
      calls.analyzeText.push(text);
      const out = [];
      for (const n of names) {
        let i = -1;
        while ((i = text.indexOf(n, i + 1)) >= 0) out.push({ start: i, end: i + n.length, label: 'FULLNAME', value: n });
      }
      return out;
    }
    async health() { return 'ok'; }
  };
  PG.ocrClient = opts.ocr ? opts.ocr(calls) : {};
  vm.runInContext(read('background/local.js'), ctx, { filename: 'local.js' });
  return { PG, calls, readLog: async () => JSON.parse(JSON.stringify(await PG.local.readLog())) };
}

const scope = { type: 'conversation', id: 'c1' };
const cfg = { rizzoUrl: 'http://127.0.0.1:5005' };
const TEXT = 'Mario Rossi ha presentato querela contro il vicino';
const b64 = (s) => Buffer.from(s).toString('base64');
const plain = (x) => JSON.parse(JSON.stringify(x));

test('testo con categoria particolare: bloccato con canOverride, nessuna analisi', async () => {
  const env = makeEnv();
  const r = await env.PG.local.pseudonymize(cfg, { scope, kind: 'message', text: TEXT });
  assert.equal(r.ok, true);
  assert.equal(r.data.blocked, true);
  assert.equal(r.data.canOverride, true);
  assert.equal(r.data.blockCategory, 'giudiziari');
  assert.match(r.data.blockLabel, /condanne penali e reati/);
  assert.match(r.data.blockReason, /querela/);
  assert.equal(r.data.text, '');
  assert.equal(env.calls.analyzeText.length, 0);
  const log = await env.readLog();
  assert.equal(log.length, 1);
  assert.equal(log[0].blocked, true);
  assert.equal(log[0].category, 'giudiziari');
  assert.ok(!('specialOverride' in log[0]));
});

test('testo con allowSpecial: pseudonimizzato, parole sensibili restano, registro con specialOverride', async () => {
  const env = makeEnv();
  const r = await env.PG.local.pseudonymize(cfg, { scope, kind: 'message', text: TEXT, allowSpecial: true });
  assert.equal(r.data.blocked, false);
  assert.equal(r.data.text, '[FULLNAME_1] ha presentato querela contro il vicino');
  const log = await env.readLog();
  assert.equal(log.length, 1);
  assert.deepEqual(log[0].specialOverride, { category: 'giudiziari' });
  assert.deepEqual(log[0].counts, { FULLNAME: 1 });
  assert.doesNotMatch(JSON.stringify(log), /Mario|querela|vicino/);
});

test('allowSpecial diverso da true (stringa, 1) non vale come conferma', async () => {
  const env = makeEnv();
  for (const v of ['true', 1, {}]) {
    const r = await env.PG.local.pseudonymize(cfg, { scope, kind: 'message', text: TEXT, allowSpecial: v });
    assert.equal(r.data.blocked, true);
  }
});

test('testo senza categorie particolari con allowSpecial: nessun specialOverride nel registro', async () => {
  const env = makeEnv();
  const r = await env.PG.local.pseudonymize(cfg, { scope, kind: 'message', text: 'Saluti a Mario Rossi', allowSpecial: true });
  assert.equal(r.data.blocked, false);
  const log = await env.readLog();
  assert.ok(!('specialOverride' in log[0]));
});

test('file .txt con categoria: bloccato con canOverride; con allowSpecial pseudonimizzato', async () => {
  const env = makeEnv();
  const msg = { scope, kind: 'upload', name: 'nota.txt', mime: 'text/plain', b64: b64(TEXT) };
  const r1 = await env.PG.local.pseudonymizeFile(cfg, msg);
  assert.equal(r1.data.blocked, true);
  assert.equal(r1.data.canOverride, true);
  assert.equal(r1.data.blockCategory, 'giudiziari');
  assert.equal(r1.data.contentB64, '');
  const r2 = await env.PG.local.pseudonymizeFile(cfg, Object.assign({}, msg, { allowSpecial: true }));
  assert.equal(r2.data.blocked, false);
  assert.equal(Buffer.from(r2.data.contentB64, 'base64').toString(), '[FULLNAME_1] ha presentato querela contro il vicino');
  const log = await env.readLog();
  const ok = log.find((e) => e.action === 'pseudonymize_file' && !e.blocked);
  assert.deepEqual(ok.specialOverride, { category: 'giudiziari' });
  assert.doesNotMatch(JSON.stringify(log), /Mario|querela/);
});

test('file .csv e .md con categoria: stesso comportamento', async () => {
  const env = makeEnv();
  for (const name of ['a.csv', 'b.md']) {
    const msg = { scope, kind: 'upload', name, mime: 'text/plain', b64: b64('nome;nota\nMario Rossi;diagnosi di diabete') };
    assert.equal((await env.PG.local.pseudonymizeFile(cfg, msg)).data.canOverride, true);
    const r = await env.PG.local.pseudonymizeFile(cfg, Object.assign({}, msg, { allowSpecial: true }));
    assert.equal(r.data.blocked, false);
    assert.match(Buffer.from(r.data.contentB64, 'base64').toString(), /\[FULLNAME_1\];diagnosi di diabete/);
  }
});

test('DOCX con categoria: bloccato con canOverride; con allowSpecial pseudonimizzato', async () => {
  const env = makeEnv();
  const enc = (x) => new TextEncoder().encode(x);
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const zip = await env.PG.zip.writeZip([
    { name: '[Content_Types].xml', content: enc('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>') },
    { name: 'word/document.xml', content: enc(`<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="${W}"><w:body><w:p><w:r><w:t>${TEXT}</w:t></w:r></w:p></w:body></w:document>`) },
  ]);
  const msg = { scope, kind: 'upload', name: 'atto.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', b64: Buffer.from(zip).toString('base64') };
  const r1 = await env.PG.local.pseudonymizeFile(cfg, msg);
  assert.equal(r1.data.blocked, true);
  assert.equal(r1.data.canOverride, true);
  const r2 = await env.PG.local.pseudonymizeFile(cfg, Object.assign({}, msg, { allowSpecial: true }));
  assert.equal(r2.data.blocked, false);
  const out = env.PG.zip.readZip(new Uint8Array(Buffer.from(r2.data.contentB64, 'base64')));
  const doc = new TextDecoder().decode(await out.entries.find((e) => e.name === 'word/document.xml').data());
  assert.ok(doc.includes('[FULLNAME_1] ha presentato querela'), doc);
  assert.ok(!doc.includes('Mario'));
});

test('altri blocchi (formato non supportato, PDF protetto): canOverride false anche con allowSpecial', async () => {
  const env = makeEnv({
    ocr: () => ({
      async pdfPrepare() { const e = new Error('enc'); e.code = 'encrypted'; throw e; },
    }),
  });
  const r1 = await env.PG.local.pseudonymizeFile(cfg, { scope, kind: 'upload', name: 'x.exe', mime: 'application/octet-stream', b64: b64('MZ\u0000\u0001binario'), allowSpecial: true });
  assert.equal(r1.data.blocked, true);
  assert.equal(r1.data.canOverride, false);
  const r2 = await env.PG.local.pseudonymizeFile(cfg, { scope, kind: 'upload', name: 'p.pdf', mime: 'application/pdf', b64: b64('%PDF-1.4 finto'), allowSpecial: true });
  assert.equal(r2.data.blocked, true);
  assert.equal(r2.data.blockCategory, 'encrypted');
  assert.equal(r2.data.canOverride, false);
});

test('PDF con categoria: bloccato con canOverride; con allowSpecial redatto e annotato', async () => {
  const env = makeEnv({
    ocr: (calls) => ({
      async pdfPrepare() {
        return { pageCount: 1, pages: [{ index: 0, width: 600, height: 800, text: TEXT, images: [] }] };
      },
      async pdfRedact(b, mapping) { calls.redact.push(mapping); return { b64: 'UERG', report: { residual: [], skipped: [] } }; },
    }),
  });
  const msg = { scope, kind: 'upload', name: 'atto.pdf', mime: 'application/pdf', b64: b64('%PDF-1.4 finto') };
  const r1 = await env.PG.local.pseudonymizeFile(cfg, msg);
  assert.equal(r1.data.blocked, true);
  assert.equal(r1.data.canOverride, true);
  assert.equal(env.calls.redact.length, 0);
  const r2 = await env.PG.local.pseudonymizeFile(cfg, Object.assign({}, msg, { allowSpecial: true }));
  assert.equal(r2.data.blocked, false);
  assert.equal(r2.data.contentB64, 'UERG');
  assert.deepEqual(plain(env.calls.redact[0]), { '[FULLNAME_1]': 'Mario Rossi' });
  const log = await env.readLog();
  assert.deepEqual(log.find((e) => e.pdf).specialOverride, { category: 'giudiziari' });
});

test('immagine OCR con categoria: bloccata con canOverride; con allowSpecial oscurata', async () => {
  const w = (text, x0) => ({ text, bbox: { x0, y0: 10, x1: x0 + text.length * 10, y1: 30 }, conf: 90 });
  const env = makeEnv({
    ocr: (calls) => ({
      async image() { return { width: 600, height: 100, lines: [{ words: [w('Mario', 0), w('Rossi', 60), w('querela', 120)] }] }; },
      async redact(b, mime, boxes, outMime) { calls.redact.push(boxes); return { b64: 'SU1H', mime: outMime }; },
    }),
  });
  const msg = { scope, kind: 'paste', name: 'a.png', mime: 'image/png', b64: b64('img') };
  const r1 = await env.PG.local.pseudonymizeImage(cfg, msg);
  assert.equal(r1.data.blocked, true);
  assert.equal(r1.data.canOverride, true);
  assert.equal(env.calls.redact.length, 0);
  const r2 = await env.PG.local.pseudonymizeImage(cfg, Object.assign({}, msg, { allowSpecial: true }));
  assert.equal(r2.data.blocked, false);
  assert.equal(r2.data.ocr.covered, 1);
  const log = await env.readLog();
  assert.deepEqual(log.find((e) => e.action === 'pseudonymize_image' && !e.blocked).specialOverride, { category: 'giudiziari' });
});
