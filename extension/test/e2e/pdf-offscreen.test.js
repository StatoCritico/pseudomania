// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Prova end-to-end del motore PDF del documento offscreen (PDF-CONTRATTO.md, sezione A): MuPDF.js e
// Tesseract.js caricati davvero dall'estensione in Chromium. Il documento è aperto in una scheda
// (chrome-extension://<id>/src/offscreen/ocr.html) e interrogato con PGOffscreen.handle(...).
// Fixture in test/fixtures/pdf/ (rigenerabili con `python3 test/fixtures/pdf/genera.py`); i PDF prodotti
// sono controllati con PyMuPDF tramite test/fixtures/pdf/verifica.py (prova saltata se manca PyMuPDF).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const EXT = path.join(__dirname, '..', '..');
const FIX = path.join(EXT, 'test', 'fixtures', 'pdf');
const b64 = (name) => fs.readFileSync(path.join(FIX, name)).toString('base64');

function executablePath() {
  try {
    const p = chromium.executablePath();
    if (p && fs.existsSync(p)) return undefined;
  } catch (_) { /* ripiego */ }
  return fs.existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined;
}

function hasPyMuPDF() {
  try {
    execFileSync('python3', ['-c', 'import pymupdf'], { stdio: 'ignore' });
    return true;
  } catch (_) {
    return false;
  }
}

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-pdf-out-'));
/** Descrizione JSON (verifica.py) di un PDF in base64. */
function inspect(b64data, name) {
  const f = path.join(TMP, name || 'out.pdf');
  fs.writeFileSync(f, Buffer.from(b64data, 'base64'));
  return JSON.parse(execFileSync('python3', [path.join(FIX, 'verifica.py'), f], { encoding: 'utf8' }));
}

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const MAPPING = {
  '[FULLNAME_1]': 'Mario Rossi',
  '[FULLNAME_2]': 'Francesco Bianchi',
  '[CF_1]': 'RSSMRA80A01H501U',
  '[IBAN_1]': 'IT60X0542811101000000123456',
  '[ORG_1]': 'Re',
  '[X_1]': 'C',
  // stesso tag, secondo valore: chiave con spazio in coda (formato di local.js)
  '[FULLNAME_1] ': 'Rossi',
};
const VALUES = ['Mario Rossi', 'Francesco Bianchi', 'Fran-\ncesco Bianchi', 'RSSMRA80A01H501U', 'IT60X0542811101000000123456'];

test('motore PDF del documento offscreen (MuPDF.js + Tesseract.js)', { timeout: 300000, skip: !hasPyMuPDF() && 'PyMuPDF non disponibile' }, async (t) => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-pdf-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    executablePath: executablePath(),
    args: ['--headless=new', `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  t.after(async () => {
    await context.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
    fs.rmSync(TMP, { recursive: true, force: true });
  });
  let sw = context.serviceWorkers()[0];
  if (!sw) sw = await context.waitForEvent('serviceworker');
  const id = new URL(sw.url()).host;

  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  if (process.env.PG_DEBUG) page.on('console', (m) => console.log('[console]', m.type(), m.text()));
  await page.goto(`chrome-extension://${id}/src/offscreen/ocr.html`);
  await page.waitForFunction(() => globalThis.PGOffscreen && globalThis.PG && globalThis.PG.ocrMap, null, { timeout: 10000 });
  const call = (msg) => page.evaluate((m) => globalThis.PGOffscreen.handle(Object.assign({ target: 'pg-offscreen' }, m)), msg);
  const times = {};
  const timed = async (name, msg) => {
    const t0 = Date.now();
    const r = await call(msg);
    times[name] = Date.now() - t0;
    return r;
  };

  await t.test('pdf:prepare su PDF di testo (primo caricamento di MuPDF)', async () => {
    const r = await timed('prepareTesto(primo avvio MuPDF)', { type: 'pdf:prepare', b64: b64('testo.pdf'), imagePolicy: 'ocr' });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.data.pageCount, 2);
    assert.equal(r.data.truncated, false);
    const p = r.data.pages[0];
    assert.equal(p.index, 0);
    assert.equal(p.width, 595);
    assert.equal(p.height, 842);
    assert.match(p.text, /Il sottoscritto Mario Rossi, nato a Roma/);
    assert.match(p.text, /Fran-\ncesco Bianchi/);
    assert.deepEqual(p.images, []);
    assert.equal(p.ocr, null);
    assert.ok(p.textChars > 200);
    const again = await timed('prepareTesto', { type: 'pdf:prepare', b64: b64('testo.pdf'), imagePolicy: 'ocr' });
    assert.equal(again.ok, true);
  });

  await t.test('pdf:redact: testo, sillabazione, valore corto, metadati, annotazioni, widget, segnalibri, allegati', async () => {
    const r = await timed('redactTesto', { type: 'pdf:redact', b64: b64('testo.pdf'), mapping: MAPPING, ocrBoxes: [], imagePolicy: 'ocr' });
    assert.equal(r.ok, true, JSON.stringify(r));
    const rep = r.data.report;
    assert.deepEqual(rep.residual, []);
    assert.deepEqual(rep.skipped, ['[X_1]']);
    assert.equal(rep.byPlaceholder['[ORG_1]'], 2, '«Re» (2 lettere) è redatto, ma solo come parola intera');
    assert.ok(rep.redacted >= 8, JSON.stringify(rep));
    assert.equal(rep.embedded, 1);
    assert.equal(rep.imagesRemoved, 0);
    const out = inspect(r.data.b64, 'redatto.pdf');
    const all = out.pages.map((p) => p.text).join('\n');
    for (const v of VALUES) assert.ok(!all.includes(v), `valore ancora presente: ${v}`);
    assert.ok(!/\bRe\b/.test(all), 'Re ancora presente');
    for (const ph of ['[FULLNAME_1]', '[FULLNAME_2]', '[CF_1]', '[IBAN_1]']) assert.ok(all.includes(ph), `manca ${ph}`);
    // parole che contengono i valori corti restano intatte (confini di parola)
    assert.match(all, /CORDELLA ricorda che DE non va toccato in CORDELLA/);
    assert.match(all, /iniziale C del secondo nome/, 'il valore saltato (C) resta');
    assert.match(all, /residente in via Garibaldi 3/);
    assert.match(all, /Seconda pagina senza dati personali/);
    // impaginazione: «, nato a Roma» resta sulla riga a y=90
    const nato = out.pages[0].lines.find((l) => l.text.startsWith(', nato a Roma'));
    assert.ok(nato && nato.origin[1] === 90, JSON.stringify(out.pages[0].lines));
    // metadati e XMP
    assert.equal(out.metadata.author, '');
    assert.equal(out.metadata.title, '');
    assert.equal(out.metadata.subject, '');
    assert.equal(out.xmp, '');
    // annotazioni e campo modulo
    const note = out.pages[0].annots.find((a) => a.type === 'Text');
    assert.equal(note.info.content, 'Nota per [FULLNAME_1]: verificare IBAN');
    assert.equal(note.info.title, '[FULLNAME_1]');
    assert.equal(note.info.subject, 'Pratica di [FULLNAME_1]');
    assert.deepEqual(out.pages[0].widgets, ['[FULLNAME_1]']);
    assert.ok(!JSON.stringify(out).includes('Mario Rossi'), 'Mario Rossi da qualche parte nella descrizione del PDF');
    // segnalibri e allegati
    assert.deepEqual(out.toc.map((e) => e[1]), ['Pratica [FULLNAME_1]', 'Allegati di [FULLNAME_1]', 'Indice']);
    assert.deepEqual(out.toc.map((e) => e[2]), [1, 2, 2]);
    assert.deepEqual(out.embedded, []);
    // il file non contiene i valori nemmeno nei byte non compressi rimasti
    const raw = Buffer.from(r.data.b64, 'base64').toString('latin1');
    assert.ok(!raw.includes('Mario Rossi') && !raw.includes('RSSMRA80A01H501U'));
  });

  let prepImg;
  await t.test('pdf:prepare con «ocr»: parole OCR solo nelle zone immagine, bbox in punti', async () => {
    prepImg = await timed('prepareImmaginiOcr(2 pagine, primo avvio Tesseract)', { type: 'pdf:prepare', b64: b64('immagini.pdf'), imagePolicy: 'ocr' });
    assert.equal(prepImg.ok, true, JSON.stringify(prepImg));
    const [p0, p1] = prepImg.data.pages;
    assert.equal(p0.images.length, 1);
    const im = p0.images[0];
    assert.ok(Math.abs(im.x0 - 72) < 1 && Math.abs(im.y0 - 200) < 1 && Math.abs(im.x1 - 372) < 1 && Math.abs(im.y1 - 240) < 1, JSON.stringify(im));
    assert.match(p0.text, /Relazione tecnica/);
    const w0 = p0.ocr.flatMap((l) => l.words);
    assert.ok(norm(w0.map((w) => w.text).join(' ')).includes('giuliabianchi'), JSON.stringify(w0.map((w) => w.text)));
    // nessuna parola del testo vero (fuori dall'immagine) nell'OCR
    assert.ok(!w0.some((w) => /Relazione|figura/i.test(w.text)));
    for (const w of w0) {
      const cx = (w.bbox.x0 + w.bbox.x1) / 2;
      const cy = (w.bbox.y0 + w.bbox.y1) / 2;
      assert.ok(cx >= im.x0 && cx <= im.x1 && cy >= im.y0 && cy <= im.y1, JSON.stringify(w));
    }
    // pagina scansionata: immagine che copre la pagina, testo solo da OCR
    assert.equal(p1.textChars, 0);
    assert.equal(p1.images.length, 1);
    const w1 = p1.ocr.flatMap((l) => l.words);
    const t1 = norm(w1.map((w) => w.text).join(' '));
    for (const s of ['Luca', 'Neri', 'NRELCU75C12F205Z', 'Torino']) assert.ok(t1.includes(norm(s)), `manca ${s}: ${t1}`);
    const luca = w1.find((w) => /Luca/.test(w.text));
    // «Destinatario: Luca Neri» disegnato a y=30+70 px su 1754 px → circa 48 pt dall'alto della pagina
    assert.ok(luca.bbox.y0 > 35 && luca.bbox.y1 < 75 && luca.bbox.x0 > 100 && luca.bbox.x1 < 300, JSON.stringify(luca));
    // con 'keep' / 'remove' nessuna OCR
    const keep = await call({ type: 'pdf:prepare', b64: b64('immagini.pdf'), imagePolicy: 'keep' });
    assert.equal(keep.data.pages[1].ocr, null);
    assert.equal(keep.data.pages[1].images.length, 1);
    // maxOcrPages
    const tr = await call({ type: 'pdf:prepare', b64: b64('immagini.pdf'), imagePolicy: 'ocr', maxOcrPages: 1 });
    assert.equal(tr.data.truncated, true);
    assert.ok(Array.isArray(tr.data.pages[0].ocr));
    assert.equal(tr.data.pages[1].ocr, null);
  });

  /** OCR di controllo sul PDF risultato (stesso motore): testo OCR di tutte le pagine. */
  async function ocrText(b64data) {
    const r = await call({ type: 'pdf:prepare', b64: b64data, imagePolicy: 'ocr' });
    assert.equal(r.ok, true, JSON.stringify(r));
    return r.data.pages.map((p) => (p.ocr || []).map((l) => l.words.map((w) => w.text).join(' ')).join('\n')).join('\n');
  }

  await t.test('pdf:redact con ocrBoxes: il nome nelle immagini non si legge più', async () => {
    // Riquadri come li calcola il service worker (ocr-map.boxesForPages) sulle parole OCR.
    const boxes = await page.evaluate((pages) => {
      const doc = globalThis.PG.ocrMap.pagesToDoc(pages);
      const spans = [];
      for (const [val, tag] of [['Giulia Bianchi', '[FULLNAME_1]'], ['Luca Neri', '[FULLNAME_2]'], ['NRELCU75C12F205Z', '[CF_1]']]) {
        const i = doc.text.indexOf(val);
        if (i >= 0) spans.push({ start: i, end: i + val.length, tag });
      }
      const sizes = {};
      for (const p of pages) sizes[p.index] = { width: p.width, height: p.height };
      return { spans: spans.length, boxes: globalThis.PG.ocrMap.boxesForPages(doc.ocrWords, spans, { pad: 2, sizes }) };
    }, prepImg.data.pages);
    assert.equal(boxes.spans, 3, 'testo OCR non riconosciuto come atteso');
    const r = await timed('redactOcrBoxes', { type: 'pdf:redact', b64: b64('immagini.pdf'), mapping: {}, ocrBoxes: boxes.boxes, imagePolicy: 'ocr' });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.data.report.ocrBoxes, boxes.boxes.length);
    assert.deepEqual(r.data.report.residual, []);
    const t0 = Date.now();
    const txt = norm(await ocrText(r.data.b64));
    times.ocrDiControllo = Date.now() - t0;
    for (const s of ['Giulia', 'Bianchi', 'Luca', 'Neri', 'NRELCU75C12F205Z']) assert.ok(!txt.includes(norm(s)), `ancora leggibile: ${s} in ${txt}`);
    for (const s of ['Torino', 'Verbale', 'Firmato']) assert.ok(txt.includes(norm(s)), `il resto dell'immagine deve restare leggibile: ${s} in ${txt}`);
    const out = inspect(r.data.b64, 'ocr.pdf');
    assert.equal(out.pages[0].images.length, 1, 'immagine conservata (solo i pixel nella zona cancellati)');
    assert.equal(out.pages[1].images.length, 1);
    assert.ok(out.pages[1].text.includes('[FULLNAME_2]') && out.pages[1].text.includes('[CF_1]'), 'segnaposto scritto sopra: ' + out.pages[1].text);
    assert.ok(out.pages[0].text.includes('[FULLNAME_1]'));
  });

  await t.test('pdf:redact con «remove»: immagini tolte; con «keep»: intatte', async () => {
    const orig = inspect(b64('immagini.pdf'), 'orig.pdf');
    const rm = await timed('redactRemove', { type: 'pdf:redact', b64: b64('immagini.pdf'), mapping: {}, ocrBoxes: [], imagePolicy: 'remove' });
    assert.equal(rm.ok, true, JSON.stringify(rm));
    assert.equal(rm.data.report.imagesRemoved, 2);
    const o = inspect(rm.data.b64, 'rm.pdf');
    assert.deepEqual(o.pages.map((p) => p.images.length), [0, 0]);
    assert.match(o.pages[0].text, /Relazione tecnica[\s\S]*Testo dopo la figura/);
    const raw = Buffer.from(rm.data.b64, 'base64');
    assert.ok(raw.length < 15000, 'immagini davvero eliminate dal file: ' + raw.length);

    // 'keep' con ocrBoxes (non dovrebbe arrivarne, ma le immagini restano comunque intatte)
    const kp = await timed('redactKeep', { type: 'pdf:redact', b64: b64('immagini.pdf'), mapping: { '[X_1]': 'Relazione' }, ocrBoxes: [{ page: 1, x0: 0, y0: 0, x1: 300, y1: 100, label: '[Y_1]' }], imagePolicy: 'keep' });
    assert.equal(kp.ok, true, JSON.stringify(kp));
    const k = inspect(kp.data.b64, 'keep.pdf');
    assert.deepEqual(k.pages.map((p) => p.images.map((i) => i.digest)), orig.pages.map((p) => p.images.map((i) => i.digest)));
    assert.ok(!k.pages[0].text.includes('Relazione') && k.pages[0].text.includes('[X_1]'));
    assert.equal(kp.data.report.ocrBoxes, 0);
  });

  await t.test('pdf:restore: segnaposto ripristinati, posizione della riga conservata', async () => {
    const mapping = { '[FULLNAME_1]': 'Mario Rossi', '[ID_1]': 'PR-2026/000123', '[CF_1]': 'assente' };
    const r = await timed('restore', { type: 'pdf:restore', b64: b64('ripristino.pdf'), mapping });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.data.report.restored, 2);
    assert.deepEqual(r.data.report.unknown, ['[EMAIL_9]']);
    const before = inspect(b64('ripristino.pdf'), 'rip0.pdf').pages[0].lines;
    const after = inspect(r.data.b64, 'rip1.pdf').pages[0].lines;
    const line = after.find((l) => l.text.startsWith('Gentile'));
    assert.equal(line.text, "Gentile Mario Rossi, la pratica PR-2026/000123 e' chiusa.");
    const orig = before.find((l) => l.text.startsWith('Gentile'));
    assert.deepEqual(line.origin, orig.origin);
    assert.equal(line.size, orig.size);
    assert.equal(line.font, 'Helvetica');
    // le altre righe restano dove erano
    for (const t2 of ['Riga senza segnaposto.', 'Sconosciuto: [EMAIL_9].']) {
      const a = after.find((l) => l.text === t2);
      const b = before.find((l) => l.text === t2);
      assert.ok(a && b && a.origin[1] === b.origin[1], t2);
    }
    assert.ok(!after.some((l) => l.text.includes('[FULLNAME_1]')));
    // round trip: redact → restore
    const red = await call({ type: 'pdf:redact', b64: b64('testo.pdf'), mapping: { '[FULLNAME_1]': 'Mario Rossi' }, ocrBoxes: [], imagePolicy: 'ocr' });
    const back = await call({ type: 'pdf:restore', b64: red.data.b64, mapping: { '[FULLNAME_1]': 'Mario Rossi' } });
    assert.equal(back.ok, true);
    assert.ok(back.data.report.restored >= 2, JSON.stringify(back.data.report));
    // Il segnaposto redatto è una riga a sé (testo aggiunto in coda al contenuto): il valore
    // ripristinato torna nella stessa posizione, sulla riga di «Il sottoscritto» (y = 90).
    const lines = inspect(back.data.b64, 'rt.pdf').pages[0].lines;
    const head = lines.find((l) => l.text.startsWith('Il sottoscritto'));
    const name = lines.find((l) => l.text === 'Mario Rossi' && Math.abs(l.origin[1] - 90) < 3);
    assert.ok(head && name && name.origin[0] > head.origin[0], JSON.stringify(lines));
  });

  await t.test('PDF firmato digitalmente: firma, certificato, /Perms e /DSS tolti; riquadro con il nome sparito', async () => {
    const orig = Buffer.from(b64('firmato.pdf'), 'base64').toString('latin1');
    assert.ok(orig.includes('/ByteRange') && orig.includes('/DSS'), 'la prova contiene una firma');
    const r = await timed('redactFirmato', { type: 'pdf:redact', b64: b64('firmato.pdf'), mapping: { '[FULLNAME_1]': 'Luca Neri', '[FULLNAME_1] ': 'LUCA\nNERI' }, ocrBoxes: [], imagePolicy: 'ocr' });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.ok(r.data.report.signatures >= 1, JSON.stringify(r.data.report));
    assert.deepEqual(r.data.report.residual, [], 'nessun residuo: ' + JSON.stringify(r.data.report));
    const raw = Buffer.from(r.data.b64, 'base64');
    // il file è compresso: si controlla anche la versione decompressa con PyMuPDF
    const out = inspect(r.data.b64, 'firmato-out.pdf');
    assert.deepEqual(out.pages[0].widgets, [], 'campo firma tolto');
    assert.ok(!/LUCA|NERI/.test(out.pages[0].text), 'riquadro con il nome sparito: ' + out.pages[0].text);
    const plain = execFileSync('python3', ['-I', '-c', 'import sys,pymupdf;d=pymupdf.open(sys.argv[1]);print("".join(d.xref_object(x)+("" if "/Image" in d.xref_object(x) else (d.xref_stream(x) or b"").decode("latin1")) if d.xref_is_stream(x) else d.xref_object(x) for x in range(1,d.xref_length())))', path.join(TMP, 'firmato-out.pdf')], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    for (const s of ['/Sig', '/ByteRange', '/DSS', '/Perms', '/SigFlags', 'Luca Neri', 'NRELCU80A01L219X', '4C756361204E657269']) {
      assert.ok(!plain.includes(s) && !raw.toString('latin1').includes(s), 'resta nel PDF: ' + s);
    }
    assert.equal(out.pages[0].images.length, 1, 'la pagina scansionata resta');
  });

  await t.test('errori: PDF protetto → encrypted, non PDF → pdf', async () => {
    for (const type of ['pdf:prepare', 'pdf:redact', 'pdf:restore']) {
      const enc = await call({ type, b64: b64('protetto.pdf'), mapping: { '[A_1]': 'Mario' } });
      assert.deepEqual([enc.ok, enc.error], [false, 'encrypted'], type + ' ' + JSON.stringify(enc));
      const bad = await call({ type, b64: Buffer.from('non sono un PDF, solo testo').toString('base64'), mapping: { '[A_1]': 'Mario' } });
      assert.deepEqual([bad.ok, bad.error], [false, 'pdf'], type + ' ' + JSON.stringify(bad));
    }
    const png = await call({ type: 'pdf:prepare', b64: fs.readFileSync(path.join(EXT, 'test', 'fixtures', 'ocr', 'testo.png')).toString('base64') });
    assert.deepEqual([png.ok, png.error], [false, 'pdf']);
  });

  await t.test('chrome.runtime.onMessage: pdf:* serviti anche via messaggio', async () => {
    const r = await sw.evaluate((b) => chrome.runtime.sendMessage({ target: 'pg-offscreen', type: 'pdf:prepare', b64: b, imagePolicy: 'keep' }), b64('ripristino.pdf'));
    assert.equal(r.ok, true);
    assert.equal(r.data.pageCount, 1);
  });

  assert.deepEqual(errors, []);
  console.log('[tempi ms]', JSON.stringify(times));
});
