// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Personal edition: OCR di immagini (OCR-CONTRATTO.md, sezione 4) e PDF trattati come PDF
// (PDF-CONTRATTO.md, sezione B) in local.js.
// local.js viene caricato in un contesto vm isolato con stub di idb, keys, Rizzo-PII e del client OCR.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '../../src');
const read = (p) => fs.readFileSync(path.join(SRC, p), 'utf8');

/** Stub di ocr-map se il file reale non c'è (sviluppo in parallelo). */
function stubOcrMap() {
  function buildText(lines) {
    let text = '';
    const words = [];
    (lines || []).forEach((l, li) => {
      let first = true;
      for (const w of l.words || []) {
        const t = String(w.text || '').trim();
        if (!t) continue;
        if (first) { if (text) text += '\n'; first = false; } else text += ' ';
        const start = text.length;
        text += t;
        words.push({ text: t, start, end: text.length, bbox: w.bbox, conf: w.conf, line: li });
      }
    });
    return { text, words };
  }
  return {
    buildText,
    boxesForSpans(words, spans) {
      const out = [];
      for (const s of spans) {
        let first = true;
        for (const w of words) if (w.start < s.end && w.end > s.start) { out.push(Object.assign({}, w.bbox, { label: first ? s.tag : '' })); first = false; }
      }
      return out;
    },
    quality(words) {
      if (!words.length) return { wordCount: 0, meanConf: 0, lowConf: false, noText: true };
      const m = words.reduce((a, w) => a + w.conf, 0) / words.length;
      return { wordCount: words.length, meanConf: m, lowConf: m < 60, noText: false };
    },
  };
}

class OcrError extends Error {
  constructor(code, message) { super(message || code); this.code = code; }
}

/**
 * Ambiente: `names` = valori che il finto Rizzo riconosce come FULLNAME; `ocr` = implementazione
 * finta di PG.ocrClient; `fileText` = testo restituito da analyzeFile (PDF via Rizzo).
 */
function makeEnv(opts) {
  const calls = { redact: [], analyzeFile: 0, analyzeText: [], prepare: [], pdfRedact: [], pdfRestore: [], restorePdf: 0, logs: [] };
  const store = {};
  const ctx = {
    console: { warn() {}, log() {} },
    crypto: globalThis.crypto,
    TextEncoder, TextDecoder, setTimeout, clearTimeout, Promise, Date, Uint8Array,
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of ['shared/policy-data.js', 'shared/policy.js', 'shared/rizzo.js', 'shared/textfile.js', 'shared/pdfwrite.js']) {
    vm.runInContext(read(f), ctx, { filename: f });
  }
  const PG = ctx.PG;
  if (fs.existsSync(path.join(SRC, 'shared/ocr-map.js'))) vm.runInContext(read('shared/ocr-map.js'), ctx, { filename: 'ocr-map.js' });
  else PG.ocrMap = stubOcrMap();

  PG.strings = Object.assign({ pdfConvertito: (n) => `convertito ${n}` }, opts.strings || {});
  PG.keys = {
    b64: (buf) => Buffer.from(buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf).toString('base64'),
    unb64: (s) => new Uint8Array(Buffer.from(s, 'base64')),
  };
  PG.idb = {
    async get(st, k) { return (store[st] || {})[k]; },
    async put(st, rec) { (store[st] = store[st] || {})[st === 'pdict' ? rec.scopeKey : rec.id] = rec; },
    async add(st, rec) { (store[st] = store[st] || {})[Object.keys(store[st] || {}).length] = rec; calls.logs.push(rec); },
    async all(st) { return Object.values(store[st] || {}); },
    async del(st, k) { delete (store[st] || {})[k]; },
  };
  const names = opts.names || [];
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
    async analyzeFile() {
      calls.analyzeFile++;
      const text = opts.fileText || '';
      const dets = [];
      for (const n of names) { const i = text.indexOf(n); if (i >= 0) dets.push({ start: i, end: i + n.length, label: 'FULLNAME', value: n }); }
      return { text, detections: dets };
    }
    async restorePdf(name, bytes, mapping) {
      calls.restorePdf++;
      return opts.restorePdf ? opts.restorePdf(mapping) : null;
    }
    async health() { return 'ok'; }
  };
  PG.ocrClient = Object.assign({ OcrError }, opts.ocr ? opts.ocr(calls) : {});
  vm.runInContext(read('background/local.js'), ctx, { filename: 'local.js' });

  // Il registro è cifrato: per verificare che non contenga testo lo si rilegge decifrato.
  return { PG, calls, readLog: () => PG.local.readLog() };
}

const word = (text, x0, conf) => ({ text, bbox: { x0, y0: 10, x1: x0 + text.length * 10, y1: 30 }, conf: conf == null ? 90 : conf });
const scope = { type: 'conversation', id: 'c1' };
const cfg = { rizzoUrl: 'http://127.0.0.1:5005' };
const B64 = Buffer.from('finta immagine').toString('base64');
const PDF_B64 = Buffer.from('%PDF-1.4 finto').toString('base64');

test('immagine con dati: riquadri a redact, entities {tag,type}, nome generico, registro senza testo', async () => {
  const env = makeEnv({
    names: ['Mario Rossi'],
    ocr: (calls) => ({
      async image() { return { width: 400, height: 100, lines: [{ words: [word('Gentile', 0), word('Mario', 80), word('Rossi', 140)] }, { words: [word('saluti', 0)] }] }; },
      async redact(b64, mime, boxes, outMime) { calls.redact.push({ mime, boxes, outMime }); return { b64: 'UkVE', mime: outMime }; },
    }),
  });
  const r = await env.PG.local.pseudonymizeImage(cfg, { scope, kind: 'paste', name: 'Mario_Rossi.jpg', mime: 'image/jpeg', b64: B64 });
  assert.equal(r.ok, true);
  const d = r.data;
  assert.equal(d.blocked, false);
  assert.equal(d.contentB64, 'UkVE');
  assert.equal(d.mime, 'image/jpeg');
  assert.match(d.filename, /^immagine-\d{14}\.jpg$/);
  assert.deepEqual(JSON.parse(JSON.stringify(d.entities)), [{ tag: '[FULLNAME_1]', type: 'FULLNAME' }]);
  assert.equal(d.ocr.covered, 1);
  assert.equal(d.ocr.wordCount, 4);
  assert.equal(d.ocr.noText, false);
  // Il nome del file NON passa per Rizzo: solo il testo OCR è stato analizzato.
  assert.deepEqual(env.calls.analyzeText, ['Gentile Mario Rossi\nsaluti']);
  assert.equal(env.calls.redact.length, 1);
  const { boxes, outMime } = env.calls.redact[0];
  assert.equal(outMime, 'image/jpeg');
  assert.ok(boxes.length >= 1);
  assert.equal(boxes[0].label, '[FULLNAME_1]');
  const minX = Math.min(...boxes.map((b) => b.x0));
  const maxX = Math.max(...boxes.map((b) => b.x1));
  assert.ok(minX <= 80 && maxX >= 190, 'i riquadri coprono «Mario Rossi»');
  assert.ok(boxes.every((b) => b.x0 >= 70), '«Gentile» non è coperta');
  const log = JSON.parse(JSON.stringify(await env.readLog()));
  assert.equal(log.length, 1);
  assert.equal(log[0].action, 'pseudonymize_image');
  assert.deepEqual(log[0].counts, { FULLNAME: 1 });
  assert.equal(log[0].ocr.wordCount, 4);
  assert.doesNotMatch(JSON.stringify(log), /Mario|Rossi|Gentile/);
});

test('immagine PNG senza testo: ri-codificata comunque in PNG, noText', async () => {
  const env = makeEnv({
    ocr: (calls) => ({
      async image() { return { width: 10, height: 10, lines: [] }; },
      async redact(b64, mime, boxes, outMime) { calls.redact.push({ boxes, outMime }); return { b64: 'UE5H', mime: outMime }; },
    }),
  });
  const r = await env.PG.local.pseudonymizeImage(cfg, { scope, kind: 'upload', name: 'x.webp', mime: 'image/webp', b64: B64 });
  assert.equal(r.data.blocked, false);
  assert.match(r.data.filename, /^immagine-\d{14}\.png$/);
  assert.equal(r.data.ocr.noText, true);
  assert.equal(env.calls.redact[0].outMime, 'image/png');
  assert.equal(env.calls.redact[0].boxes.length, 0);
});

test('immagine con categoria particolare: bloccata, nessun redact', async () => {
  const env = makeEnv({
    names: ['Mario Rossi'],
    ocr: (calls) => ({
      async image() { return { width: 400, height: 100, lines: [{ words: [word('Mario', 0), word('Rossi', 60), word('in', 120), word('malattia', 150)] }] }; },
      async redact() { calls.redact.push(1); return { b64: '', mime: 'image/png' }; },
    }),
  });
  const r = await env.PG.local.pseudonymizeImage(cfg, { scope, kind: 'paste', name: 'a.png', mime: 'image/png', b64: B64 });
  assert.equal(r.ok, true);
  assert.equal(r.data.blocked, true);
  assert.equal(r.data.blockCategory, 'salute');
  assert.equal(r.data.contentB64, '');
  assert.equal(env.calls.redact.length, 0);
  assert.doesNotMatch(JSON.stringify(await env.readLog()), /Mario|malattia/);
});

test('immagine non decodificabile: bloccata unsupported_format con il testo di strings', async () => {
  const env = makeEnv({
    strings: { immagineNonLeggibile: 'IMMAGINE ILLEGGIBILE' },
    ocr: () => ({ async image() { throw new OcrError('decode', 'bad'); } }),
  });
  const r = await env.PG.local.pseudonymizeImage(cfg, { scope, kind: 'paste', name: 'a.png', mime: 'image/png', b64: B64 });
  assert.equal(r.data.blocked, true);
  assert.equal(r.data.blockCategory, 'unsupported_format');
  assert.equal(r.data.blockReason, 'IMMAGINE ILLEGGIBILE');
});

test('immagine: altro errore OCR → ok:false (non bloccata come formato)', async () => {
  const env = makeEnv({ ocr: () => ({ async image() { throw new OcrError('timeout', 'lento'); } }) });
  const r = await env.PG.local.pseudonymizeImage(cfg, { scope, kind: 'paste', name: 'a.png', mime: 'image/png', b64: B64 });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'timeout');
});

// --- PDF trattati come PDF (PDF-CONTRATTO.md, sezione B) ---------------------------------------
const pw = (text, x0, y0) => ({ text, bbox: { x0, y0, x1: x0 + text.length * 5, y1: y0 + 10 }, conf: 85 });
const pdfMsg = (name) => ({ scope, kind: 'upload', name: name || 'lettera.pdf', mime: 'application/pdf', b64: PDF_B64 });
const plain = (o) => JSON.parse(JSON.stringify(o));

/** Finto client PDF: `pages` da pdf:prepare, `report` (o funzione) da pdf:redact. */
function pdfOcr(o) {
  return (calls) => ({
    async pdfPrepare(b64, opts) {
      calls.prepare.push(opts);
      if (o.prepareError) throw new OcrError(o.prepareError, 'errore');
      return { pageCount: o.pageCount || o.pages.length, truncated: Boolean(o.truncated), pages: o.pages };
    },
    async pdfRedact(b64, mapping, ocrBoxes, imagePolicy) {
      calls.pdfRedact.push({ mapping: plain(mapping), ocrBoxes: plain(ocrBoxes), imagePolicy });
      const report = Object.assign({ redacted: Object.keys(mapping).length, skipped: [], residual: [], imagesRemoved: 0, ocrBoxes: ocrBoxes.length },
        typeof o.report === 'function' ? o.report(mapping) : o.report || {});
      return { b64: 'UERGT1VU', report };
    },
    async pdfRestore(b64, mapping) {
      calls.pdfRestore.push(plain(mapping));
      if (o.restoreError) throw new OcrError(o.restoreError, 'errore');
      return { b64: 'UkVTVE9SRUQ=', report: { restored: 1, unknown: ['[X_9]'] } };
    },
  });
}

test('PDF con dati: mapping col valore esatto, riquadri OCR, PDF in uscita con nome pseudonimizzato, registro senza testo', async () => {
  const env = makeEnv({
    names: ['Mario Rossi', 'Anna Bianchi'],
    ocr: pdfOcr({ pages: [
      { index: 0, width: 595, height: 842, text: 'Lettera per Mario Rossi\nRoma', textChars: 28, images: [], ocr: null },
      { index: 1, width: 595, height: 842, text: 'Firma', textChars: 5, images: [{ x0: 0, y0: 100, x1: 300, y1: 200 }],
        ocr: [{ words: [pw('Anna', 50, 120), pw('Bianchi', 80, 120), pw('firmato', 130, 120)] }] },
    ] }),
  });
  const r = await env.PG.local.pseudonymizeFile(cfg, pdfMsg('Mario_Rossi.pdf'));
  assert.equal(r.ok, true);
  const d = r.data;
  assert.equal(d.blocked, false);
  assert.equal(d.mime, 'application/pdf');
  assert.equal(d.contentB64, 'UERGT1VU');
  assert.equal(d.filename, '[FULLNAME_1].pdf');
  assert.deepEqual(plain(d.entities), [{ tag: '[FULLNAME_1]', type: 'FULLNAME' }, { tag: '[FULLNAME_2]', type: 'FULLNAME' }]);
  assert.deepEqual(plain(env.calls.prepare), [{ imagePolicy: 'ocr', maxOcrPages: 30 }]);
  assert.equal(env.calls.analyzeText[0], 'Lettera per Mario Rossi\nRoma\n\nFirma\nAnna Bianchi firmato');
  const { mapping, ocrBoxes, imagePolicy } = env.calls.pdfRedact[0];
  assert.equal(imagePolicy, 'ocr');
  // Il valore OCR non è nel testo di pagina: nel mapping solo il valore del testo estratto.
  assert.deepEqual(mapping, { '[FULLNAME_1]': 'Mario Rossi' });
  assert.equal(ocrBoxes.length, 1);
  assert.equal(ocrBoxes[0].page, 1);
  assert.equal(ocrBoxes[0].label, '[FULLNAME_2]');
  assert.ok(ocrBoxes[0].x0 <= 50 && ocrBoxes[0].x1 >= 115 && ocrBoxes[0].x1 < 130, 'coperti solo «Anna Bianchi»');
  assert.match(d.notice, /pagine|pagina|OCR/);
  const log = plain(await env.readLog());
  assert.equal(log.length, 1);
  assert.equal(log[0].format, 'pdf');
  assert.deepEqual(log[0].pdf, { pages: 2, imagePolicy: 'ocr', images: 1, imagesRemoved: 0, ocrPages: 1, skipped: 0, signatures: 0 });
  assert.doesNotMatch(JSON.stringify(log), /Mario|Rossi|Anna|Bianchi|Lettera|Firma/);
});

test('PDF: valore spezzato fra testo di pagina e OCR e fra pagine → un valore per pezzo, riquadri solo delle parole OCR', async () => {
  const env = makeEnv({
    names: ['Mario\nRossi', 'Via\n\nVerdi'],
    ocr: pdfOcr({ pages: [
      { index: 0, width: 595, height: 842, text: 'Gentile Mario', textChars: 13, images: [{ x0: 0, y0: 0, x1: 595, y1: 842 }],
        ocr: [{ words: [pw('Rossi', 10, 10), pw('Via', 50, 10)] }] },
      { index: 1, width: 595, height: 842, text: 'Verdi 3', textChars: 7, images: [], ocr: null },
    ] }),
  });
  const r = await env.PG.local.pseudonymizeFile(cfg, pdfMsg());
  assert.equal(r.data.blocked, false);
  const { mapping, ocrBoxes } = env.calls.pdfRedact[0];
  // «Mario» (testo pag. 0) e «Verdi» (testo pag. 1): stringhe esatte del testo estratto
  assert.deepEqual(Object.values(mapping).sort(), ['Mario', 'Verdi']);
  assert.equal(mapping['[FULLNAME_1]'], 'Mario');
  assert.equal(mapping['[FULLNAME_2]'], 'Verdi');
  // riquadri solo per «Rossi» e «Via»; il segnaposto è già scritto nel testo, quindi nessuna etichetta su «Rossi»
  assert.deepEqual(ocrBoxes.map((b) => [b.page, b.x0 <= 10 ? 'Rossi' : 'Via', b.label]), [[0, 'Rossi', ''], [0, 'Via', '[FULLNAME_2]']]);
});

test('PDF: stesso tag con valori di testo diversi (pezzo e intero) → chiavi distinte; grafie equivalenti → un solo valore', async () => {
  const env = makeEnv({
    names: ['Mario\nRossi', 'Mario Rossi', 'MARIO  ROSSI'],
    ocr: pdfOcr({
      pages: [
        { index: 0, text: 'Mario', images: [{ x0: 0, y0: 0, x1: 9, y1: 9 }], ocr: [{ words: [pw('Rossi', 0, 0)] }] },
        { index: 1, text: 'Mario Rossi e MARIO  ROSSI', images: [], ocr: null },
      ],
      report: (m) => ({ skipped: Object.keys(m).filter((k) => k !== '[FULLNAME_1]') }),
    }),
    strings: { pdfValoriNonCoperti: (n) => `NON COPERTI ${n}` },
  });
  const r = await env.PG.local.pseudonymizeFile(cfg, pdfMsg());
  assert.deepEqual(env.calls.pdfRedact[0].mapping, { '[FULLNAME_1]': 'Mario', '[FULLNAME_1] ': 'Mario Rossi' });
  assert.deepEqual(plain(r.data.entities), [{ tag: '[FULLNAME_1]', type: 'FULLNAME' }]);
  // le chiavi del report sono riportate al tag: 1 dato non coperto, non 2
  assert.equal(r.data.notice.split(' ').slice(0, 3).join(' '), 'NON COPERTI 1');
});

test('PDF: residui dopo la redazione → bloccato, mai inviato', async () => {
  const env = makeEnv({
    names: ['Mario Rossi'],
    strings: { pdfResidui: (n) => `RESIDUI ${n}` },
    ocr: pdfOcr({ pages: [{ index: 0, text: 'Mario Rossi', images: [], ocr: null }], report: { residual: ['[FULLNAME_1]'] } }),
  });
  const r = await env.PG.local.pseudonymizeFile(cfg, pdfMsg());
  assert.equal(r.data.blocked, true);
  assert.equal(r.data.blockReason, 'RESIDUI 1');
  assert.equal(r.data.contentB64, '');
  assert.doesNotMatch(JSON.stringify(await env.readLog()), /Mario/);
});

test('PDF protetto da password → bloccato (pdfProtetto), nessun ripiego', async () => {
  const env = makeEnv({ strings: { pdfProtetto: 'PROTETTO' }, ocr: pdfOcr({ prepareError: 'encrypted', pages: [] }) });
  const r = await env.PG.local.pseudonymizeFile(cfg, pdfMsg());
  assert.equal(r.data.blocked, true);
  assert.equal(r.data.blockReason, 'PROTETTO');
  assert.equal(r.data.blockCategory, 'encrypted');
  assert.equal(env.calls.analyzeFile, 0);
});

test('PDF: prepare in errore → ripiego .txt via Rizzo con notice', async () => {
  const env = makeEnv({
    names: ['Mario Rossi'],
    fileText: 'Lettera di Mario Rossi',
    strings: { pdfRipiegoTesto: (n) => `RIPIEGO ${n}` },
    ocr: pdfOcr({ prepareError: 'pdf', pages: [] }),
  });
  const r = await env.PG.local.pseudonymizeFile(cfg, pdfMsg());
  assert.equal(r.data.blocked, false);
  assert.equal(r.data.mime, 'text/plain');
  assert.equal(r.data.filename, 'lettera.txt');
  assert.equal(Buffer.from(r.data.contentB64, 'base64').toString('utf8'), 'Lettera di [FULLNAME_1]');
  assert.equal(r.data.notice, 'RIPIEGO lettera.pdf');
  assert.equal(env.calls.analyzeFile, 1);
  assert.equal(env.calls.pdfRedact.length, 0);
});

test('PDF: ripiego .txt con testo Rizzo vuoto → bloccato (pdfSenzaTesto)', async () => {
  const env = makeEnv({ fileText: '  ', strings: { pdfSenzaTesto: 'PDF SENZA TESTO' }, ocr: pdfOcr({ prepareError: 'timeout', pages: [] }) });
  const r = await env.PG.local.pseudonymizeFile(cfg, pdfMsg());
  assert.equal(r.data.blocked, true);
  assert.equal(r.data.blockReason, 'PDF SENZA TESTO');
});

test('PDF senza testo né OCR → bloccato (pdfSenzaTesto), nessuna redazione', async () => {
  const env = makeEnv({
    strings: { pdfSenzaTesto: 'PDF SENZA TESTO' },
    ocr: pdfOcr({ pages: [{ index: 0, text: '', images: [{ x0: 0, y0: 0, x1: 1, y1: 1 }], ocr: [] }, { index: 1, text: '\n', images: [], ocr: null }] }),
  });
  const r = await env.PG.local.pseudonymizeFile(cfg, pdfMsg());
  assert.equal(r.data.blocked, true);
  assert.equal(r.data.blockReason, 'PDF SENZA TESTO');
  assert.equal(r.data.blockCategory, 'unreadable');
  assert.equal(env.calls.pdfRedact.length, 0);
});

test('PDF: valori skipped → notice pdfValoriNonCoperti e conteggio nel registro', async () => {
  const env = makeEnv({
    names: ['Mario Rossi'],
    strings: { pdfValoriNonCoperti: (n) => `NON COPERTI ${n}` },
    ocr: pdfOcr({ pages: [{ index: 0, text: 'Mario Rossi', images: [], ocr: null }], report: { skipped: ['[FULLNAME_1]'] } }),
  });
  const r = await env.PG.local.pseudonymizeFile(cfg, pdfMsg());
  assert.equal(r.data.blocked, false);
  assert.equal(r.data.notice, 'NON COPERTI 1');
  assert.equal(plain(await env.readLog())[0].pdf.skipped, 1);
});

test('PDF: policy keep con immagini → notice pdfImmaginiLasciate, nessun OCR', async () => {
  const env = makeEnv({
    strings: { pdfImmaginiLasciate: (n) => `LASCIATE ${n}` },
    ocr: pdfOcr({ pages: [{ index: 0, text: 'Testo', images: [{ x0: 0, y0: 0, x1: 9, y1: 9 }, { x0: 10, y0: 0, x1: 19, y1: 9 }], ocr: null }] }),
  });
  const r = await env.PG.local.pseudonymizeFile(Object.assign({}, cfg, { pdfImagePolicy: 'keep' }), pdfMsg());
  assert.equal(r.data.notice, 'LASCIATE 2');
  assert.equal(env.calls.prepare[0].imagePolicy, 'keep');
  assert.equal(env.calls.pdfRedact[0].imagePolicy, 'keep');
});

test('PDF: policy remove → notice pdfImmaginiTolte con imagesRemoved del report', async () => {
  const env = makeEnv({
    strings: { pdfImmaginiTolte: (n) => `TOLTE ${n}` },
    ocr: pdfOcr({ pages: [{ index: 0, text: 'Testo', images: [{ x0: 0, y0: 0, x1: 9, y1: 9 }], ocr: null }], report: { imagesRemoved: 3 } }),
  });
  const r = await env.PG.local.pseudonymizeFile(Object.assign({}, cfg, { pdfImagePolicy: 'remove' }), pdfMsg());
  assert.equal(r.data.notice, 'TOLTE 3');
  assert.equal(env.calls.pdfRedact[0].imagePolicy, 'remove');
  assert.equal(plain(await env.readLog())[0].pdf.imagesRemoved, 3);
});

test('PDF: policy non valida → ocr; OCR troncato → notice pdfImmaginiOcr(pagine, true)', async () => {
  const env = makeEnv({
    strings: { pdfImmaginiOcr: (p, t) => `OCR ${p} ${t}` },
    ocr: pdfOcr({ truncated: true, pages: [{ index: 0, text: 'Testo', images: [{ x0: 0, y0: 0, x1: 9, y1: 9 }], ocr: [{ words: [pw('ciao', 0, 0)] }] }] }),
  });
  const r = await env.PG.local.pseudonymizeFile(Object.assign({}, cfg, { pdfImagePolicy: 'boh' }), pdfMsg());
  assert.equal(r.data.notice, 'OCR 1 true');
  assert.equal(env.calls.prepare[0].imagePolicy, 'ocr');
});

test('PDF con categoria particolare → bloccato, nessuna redazione', async () => {
  const env = makeEnv({
    names: ['Mario Rossi'],
    ocr: pdfOcr({ pages: [{ index: 0, text: 'Mario Rossi', images: [], ocr: [{ words: [pw('certificato', 0, 0), pw('di', 60, 0), pw('malattia', 80, 0)] }] }] }),
  });
  const r = await env.PG.local.pseudonymizeFile(cfg, pdfMsg());
  assert.equal(r.data.blocked, true);
  assert.equal(r.data.blockCategory, 'salute');
  assert.equal(env.calls.pdfRedact.length, 0);
  assert.doesNotMatch(JSON.stringify(await env.readLog()), /Mario|malattia/);
});

/** Dizionario della conversazione con [FULLNAME_1] = Mario Rossi. */
async function withEntry(env) {
  await env.PG.local.pseudonymize(cfg, { scope, kind: 'prompt', text: 'Mario Rossi' });
}

test('reidentify PDF: ripristino locale con pdfRestore e il dizionario della conversazione', async () => {
  const env = makeEnv({ names: ['Mario Rossi'], ocr: pdfOcr({ pages: [] }) });
  await withEntry(env);
  const r = await env.PG.local.reidentifyFile(cfg, { scope, name: 'out.pdf', mime: 'application/pdf', b64: PDF_B64 });
  assert.equal(r.ok, true);
  assert.equal(r.data.mime, 'application/pdf');
  assert.equal(r.data.contentB64, 'UkVTVE9SRUQ=');
  assert.deepEqual(plain(r.data.unknownTags), ['[X_9]']);
  assert.deepEqual(env.calls.pdfRestore, [{ '[FULLNAME_1]': 'Mario Rossi' }]);
  assert.equal(env.calls.restorePdf, 0);
});

test('reidentify PDF: pdfRestore in errore → Rizzo restorePdf', async () => {
  const env = makeEnv({ names: ['Mario Rossi'], restorePdf: () => new Uint8Array([37, 80, 68, 70]), ocr: pdfOcr({ pages: [], restoreError: 'pdf' }) });
  await withEntry(env);
  const r = await env.PG.local.reidentifyFile(cfg, { scope, name: 'out.pdf', mime: 'application/pdf', b64: PDF_B64 });
  assert.equal(r.data.mime, 'application/pdf');
  assert.equal(Buffer.from(r.data.contentB64, 'base64').toString('latin1'), '%PDF');
  assert.equal(env.calls.restorePdf, 1);
});

test('reidentify PDF: pdfRestore e restorePdf non disponibili → PDF di solo testo', async () => {
  const env = makeEnv({
    names: ['Mario Rossi'],
    fileText: 'Lettera per [FULLNAME_1]',
    strings: { pdfRipristinatoTesto: 'SOLO TESTO' },
    ocr: pdfOcr({ pages: [], restoreError: 'ocr' }),
  });
  await withEntry(env);
  const r = await env.PG.local.reidentifyFile(cfg, { scope, name: 'out.pdf', mime: 'application/pdf', b64: PDF_B64 });
  assert.equal(r.data.mime, 'application/pdf');
  assert.equal(r.data.notice, 'SOLO TESTO');
  assert.equal(env.calls.restorePdf, 1);
  assert.equal(env.calls.analyzeFile, 1);
  assert.match(Buffer.from(r.data.contentB64, 'base64').toString('latin1'), /^%PDF/);
});
