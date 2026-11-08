// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Personal edition, «Dati da non mascherare» (keepTypes): validazione in config.js e filtro delle
// rilevazioni in local.js per testo, nome del file, txt/csv/md, docx/xlsx, PDF (MuPDF e ripiego .txt)
// e immagini OCR. local.js è caricato in un contesto vm con stub di idb, keys, Rizzo-PII e OCR.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const config = require('../../src/shared/config.js');

const SRC = path.join(__dirname, '../../src');
const read = (p) => fs.readFileSync(path.join(SRC, p), 'utf8');
const plain = (x) => JSON.parse(JSON.stringify(x));

// --- config.js -------------------------------------------------------------------------------------
test('config: keepTypes predefinito [] in Personal, null in Server edition', () => {
  assert.deepEqual(config.resolveConfig({}).keepTypes, []);
  assert.deepEqual(config.resolveConfig({ local: {} }).keepTypes, []);
  assert.equal(config.resolveConfig({ managed: { mode: 'ente', serverUrl: 'https://x' }, local: { keepTypes: ['DATE'] } }).keepTypes, null);
});

test('config: solo i tipi ammessi, maiuscolo, senza doppioni, ordine fisso; il resto scartato', () => {
  assert.deepEqual(config.KEEPABLE_TYPES, ['DATE', 'TIME', 'AMOUNT', 'AGE', 'GENDER', 'ORG']);
  const r = config.resolveConfig({ local: { keepTypes: ['org', 'FULLNAME', 'CF', 'IBAN', 'EMAIL', 'TELEPHONENUM', 'STREET', 'TARGA', 'DOCID', 'amount', 'DATE', 'DATE', 42, null, ' time '] } });
  assert.deepEqual(r.keepTypes, ['DATE', 'TIME', 'AMOUNT', 'ORG']);
  assert.deepEqual(config.resolveConfig({ local: { keepTypes: 'DATE' } }).keepTypes, []);
  assert.deepEqual(config.resolveConfig({ local: { keepTypes: { DATE: true } } }).keepTypes, []);
  assert.deepEqual(config.sanitizeKeepTypes(['AGE', 'GENDER']), ['AGE', 'GENDER']);
  assert.ok('keepTypes' in config.toPlain(config.resolveConfig({})));
});

// --- local.js --------------------------------------------------------------------------------------
class OcrError extends Error {
  constructor(code, message) { super(message || code); this.code = code; }
}

/** `ents` = [{value, label}] riconosciuti dal finto Rizzo (ogni occorrenza nel testo). */
function makeEnv(opts) {
  const calls = { clients: [], analyzeText: [], pdfRedact: [], redact: [], office: [] };
  const store = {};
  const ctx = { console: { warn() {}, log() {} }, crypto: globalThis.crypto, TextEncoder, TextDecoder, setTimeout, clearTimeout, Promise, Date, Uint8Array };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  const files = ['shared/policy-data.js', 'shared/policy.js', 'shared/rizzo.js', 'shared/textfile.js', 'shared/pdfwrite.js', 'shared/ocr-map.js'];
  if (opts.withConfig !== false) files.unshift('shared/config.js');
  for (const f of files) vm.runInContext(read(f), ctx, { filename: f });
  const PG = ctx.PG;
  PG.strings = { pdfConvertito: (n) => `convertito ${n}` };
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
  const ents = opts.ents || [];
  const find = (text) => {
    const out = [];
    for (const e of ents) {
      let i = -1;
      while ((i = text.indexOf(e.value, i + 1)) >= 0) out.push({ start: i, end: i + e.value.length, label: e.label, value: e.value });
    }
    return out;
  };
  PG.rizzo.RizzoClient = class {
    constructor(url, o) { calls.clients.push(plain((o && o.excludeTags) || [])); }
    async analyzeText(text) { calls.analyzeText.push(text); return find(text); }
    async analyzeFile() { const text = opts.fileText || ''; return { text, detections: find(text) }; }
    async health() { return 'ok'; }
  };
  PG.ocrClient = Object.assign({ OcrError }, opts.ocr ? opts.ocr(calls) : {});
  if (opts.office) {
    // Finto OOXML: i «testi» del documento sono opts.office; si registrano le sostituzioni.
    PG.ooxml = {
      async transformOffice(bytes, kind, transform) {
        const edits = await transform(opts.office);
        calls.office.push(plain(edits));
        return bytes;
      },
      async detectOfficeKind() { return 'docx'; },
    };
    PG.zip = { ZipError: class extends Error {} };
    PG.textfile.detectKind = async () => ({ kind: 'docx' });
  }
  vm.runInContext(read('background/local.js'), ctx, { filename: 'local.js' });
  return { PG, calls, readLog: async () => plain(await PG.local.readLog()) };
}

const scope = { type: 'conversation', id: 'c1' };
const ENTS = [
  { value: 'Mario Rossi', label: 'FULLNAME' },
  { value: '12/03/2024', label: 'DATE' },
  { value: '€ 1.250,00', label: 'AMOUNT' },
  { value: 'RSSMRA80A01F205X', label: 'CF' },
];
const TEXT = 'Il 12/03/2024 Mario Rossi (RSSMRA80A01F205X) ha pagato € 1.250,00.';
const b64 = (s) => Buffer.from(s).toString('base64');

test('testo: predefinito tutto mascherato, nessun excludeTags, nessun kept nel registro', async () => {
  const env = makeEnv({ ents: ENTS });
  const r = await env.PG.local.pseudonymize({ rizzoUrl: 'x', keepTypes: [] }, { scope, kind: 'prompt', text: TEXT });
  assert.equal(r.data.text, 'Il [DATE_1] [FULLNAME_1] ([CF_1]) ha pagato [AMOUNT_1].');
  assert.deepEqual(env.calls.clients, [[]]);
  const log = await env.readLog();
  assert.equal(log[0].kept, undefined);
});

test('testo: keepTypes DATE/AMOUNT → date e importi in chiaro, nome e CF mascherati; excludeTags a Rizzo; kept: n', async () => {
  const env = makeEnv({ ents: ENTS });
  const cfg = { rizzoUrl: 'x', keepTypes: ['DATE', 'AMOUNT'] };
  const r = await env.PG.local.pseudonymize(cfg, { scope, kind: 'prompt', text: TEXT });
  assert.equal(r.data.text, 'Il 12/03/2024 [FULLNAME_1] ([CF_1]) ha pagato € 1.250,00.');
  assert.deepEqual(plain(r.data.entities).map((e) => e.type), ['FULLNAME', 'CF']);
  assert.deepEqual(env.calls.clients, [['DATE', 'AMOUNT']]);
  const log = await env.readLog();
  assert.equal(log[0].kept, 2);
  assert.deepEqual(log[0].counts, { FULLNAME: 1, CF: 1 });
  assert.doesNotMatch(JSON.stringify(log), /12\/03|1\.250|Rossi/);
});

test('keepTypes non ammessi (FULLNAME, CF) ignorati anche se arrivano a local.js; funziona anche senza config.js', async () => {
  for (const withConfig of [true, false]) {
    const env = makeEnv({ ents: ENTS, withConfig });
    const r = await env.PG.local.pseudonymize({ rizzoUrl: 'x', keepTypes: ['FULLNAME', 'cf', 'date'] }, { scope, kind: 'prompt', text: TEXT });
    assert.equal(r.data.text, 'Il 12/03/2024 [FULLNAME_1] ([CF_1]) ha pagato [AMOUNT_1].');
    assert.deepEqual(env.calls.clients, [['DATE']]);
  }
});

test('ORG mantenuta che si sovrappone a un nome: il nome resta mascherato', async () => {
  const env = makeEnv({ ents: [{ value: 'Studio Mario Rossi', label: 'ORG' }, { value: 'Mario Rossi', label: 'FULLNAME' }, { value: 'INPS', label: 'ORG' }] });
  const r = await env.PG.local.pseudonymize({ rizzoUrl: 'x', keepTypes: ['ORG'] }, { scope, kind: 'prompt', text: 'Lo Studio Mario Rossi scrive all\'INPS.' });
  assert.equal(r.data.text, 'Lo Studio [FULLNAME_1] scrive all\'INPS.');
});

test('file txt/csv/md e nome del file: tipi mantenuti in chiaro, kept sommato', async () => {
  const env = makeEnv({ ents: ENTS });
  const cfg = { rizzoUrl: 'x', keepTypes: ['DATE', 'AMOUNT'] };
  for (const name of ['nota 12/03/2024 Mario Rossi.txt', 'tab.csv', 'doc.md']) {
    const r = await env.PG.local.pseudonymizeFile(cfg, { scope, kind: 'upload', name, b64: b64(TEXT) });
    assert.equal(r.data.blocked, false, name);
    assert.equal(Buffer.from(r.data.contentB64, 'base64').toString(), 'Il 12/03/2024 [FULLNAME_1] ([CF_1]) ha pagato € 1.250,00.', name);
  }
  const log = await env.readLog();
  assert.equal(log[0].kept, 3, 'due nel testo + la data nel nome del file');
});

test('docx/xlsx: tipi mantenuti senza sostituzioni', async () => {
  const env = makeEnv({ ents: ENTS, office: ['Udienza del 12/03/2024', 'Mario Rossi deve € 1.250,00'] });
  const r = await env.PG.local.pseudonymizeFile({ rizzoUrl: 'x', keepTypes: ['DATE', 'AMOUNT'] }, { scope, kind: 'upload', name: 'atto.docx', b64: b64('PK finto') });
  assert.equal(r.data.blocked, false);
  assert.deepEqual(env.calls.office[0], [[], [{ start: 0, end: 11, text: '[FULLNAME_1]' }]]);
  assert.equal((await env.readLog())[0].kept, 2);
});

const pdfOcr = (pages) => (calls) => ({
  async pdfPrepare() { return { pageCount: pages.length, truncated: false, pages }; },
  async pdfRedact(b, mapping, ocrBoxes) { calls.pdfRedact.push({ mapping: plain(mapping), ocrBoxes: plain(ocrBoxes) }); return { b64: 'UERG', report: {} }; },
});
const pw = (text, x0) => ({ text, bbox: { x0, y0: 0, x1: x0 + text.length * 10, y1: 20 }, conf: 90 });

test('PDF (MuPDF + OCR): tipi mantenuti né nel mapping né nei riquadri', async () => {
  const env = makeEnv({
    ents: ENTS,
    ocr: pdfOcr([{ index: 0, width: 595, height: 842, text: TEXT, images: [{}], ocr: [{ words: [pw('scadenza', 0), pw('12/03/2024', 100), pw('Mario', 220), pw('Rossi', 280)] }] }]),
  });
  const r = await env.PG.local.pseudonymizeFile({ rizzoUrl: 'x', keepTypes: ['DATE', 'AMOUNT'], pdfImagePolicy: 'ocr' }, { scope, kind: 'upload', name: 'a.pdf', b64: b64('%PDF-1.4 finto') });
  assert.equal(r.data.blocked, false);
  assert.equal(r.data.mime, 'application/pdf');
  const { mapping, ocrBoxes } = env.calls.pdfRedact[0];
  assert.deepEqual(mapping, { '[FULLNAME_1]': 'Mario Rossi', '[CF_1]': 'RSSMRA80A01F205X' });
  assert.ok(ocrBoxes.length >= 1 && ocrBoxes.every((b) => b.x0 >= 200), 'la data nell\'OCR non è coperta');
  assert.equal((await env.readLog())[0].kept, 3);
});

test('PDF ripiego .txt (Rizzo analyzeFile): tipi mantenuti in chiaro', async () => {
  const env = makeEnv({ ents: ENTS, fileText: TEXT, ocr: () => ({ async pdfPrepare() { throw new OcrError('pdf', 'x'); } }) });
  const r = await env.PG.local.pseudonymizeFile({ rizzoUrl: 'x', keepTypes: ['DATE', 'AMOUNT'] }, { scope, kind: 'upload', name: 'a.pdf', b64: b64('%PDF-1.4 finto') });
  assert.equal(r.data.mime, 'text/plain');
  assert.equal(Buffer.from(r.data.contentB64, 'base64').toString(), 'Il 12/03/2024 [FULLNAME_1] ([CF_1]) ha pagato € 1.250,00.');
  assert.ok(env.calls.clients.some((c) => c.join() === 'DATE,AMOUNT'));
  assert.equal((await env.readLog())[0].kept, 2);
});

test('immagine OCR: tipi mantenuti non coperti dai riquadri', async () => {
  const env = makeEnv({
    ents: ENTS,
    ocr: (calls) => ({
      async image() { return { width: 400, height: 40, lines: [{ words: [pw('12/03/2024', 0), pw('Mario', 120), pw('Rossi', 180)] }] }; },
      async redact(b, mime, boxes) { calls.redact.push(plain(boxes)); return { b64: 'UE5H', mime: 'image/png' }; },
    }),
  });
  const r = await env.PG.local.pseudonymizeImage({ rizzoUrl: 'x', keepTypes: ['DATE'] }, { scope, kind: 'paste', name: 'a.png', mime: 'image/png', b64: b64('img') });
  assert.equal(r.data.ocr.covered, 1);
  assert.deepEqual(plain(r.data.entities), [{ tag: '[FULLNAME_1]', type: 'FULLNAME' }]);
  assert.ok(env.calls.redact[0].length >= 1 && env.calls.redact[0].every((b) => b.x0 >= 100));
  assert.equal((await env.readLog())[0].kept, 1);
});
