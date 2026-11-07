// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Personal edition, PDF trattati nell'estensione con MuPDF.js (Rizzo-PII finto solo per il
// riconoscimento nel testo): invio del PDF con l'impaginazione e i dati rimossi davvero, pulizie
// (metadati, commenti, moduli, segnalibri, allegati), le tre scelte per le immagini e il ripristino
// del PDF scaricato con l'impaginazione.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { startHarness, waitFor } = require('./harness.js');

const FIX = path.join(__dirname, '..', 'fixtures', 'pdf');
const TESTO = fs.readFileSync(path.join(FIX, 'testo.pdf')); // Mario Rossi, RSSMRA80A01H501U, metadati, commenti, modulo, segnalibri, allegato
const IMMAGINI = fs.readFileSync(path.join(FIX, 'immagini.pdf')); // testo + immagine con un nome + pagina scansionata

function multipartFile(buf) {
  const s = buf.toString('latin1');
  const name = /filename="([^"]*)"/.exec(s)[1];
  const start = s.indexOf('\r\n\r\n', s.indexOf('filename=')) + 4;
  const end = s.lastIndexOf('\r\n--');
  return { name, data: buf.subarray(start, end) };
}

test('Personal edition: PDF con MuPDF.js', { timeout: 300000 }, async (t) => {
  const h = await startHarness({ edition: 'personal' });
  t.after(() => h.close());
  const ext = await h.context.newPage();
  await ext.goto(`chrome-extension://${h.extensionId}/src/offscreen/ocr.html`);
  await ext.waitForFunction(() => globalThis.PGOffscreen && globalThis.PG && globalThis.PG.ocrMap, null, { timeout: 10000 });
  const msg = (m) => ext.evaluate((x) => chrome.runtime.sendMessage(x), m);
  /** Descrive un PDF con il motore dell'estensione: testo (pagine), immagini, OCR delle immagini. */
  const describe = (buf, imagePolicy) => ext.evaluate(async ({ b64, imagePolicy }) => {
    const r = await globalThis.PGOffscreen.handle({ target: 'pg-offscreen', type: 'pdf:prepare', b64, imagePolicy });
    if (!r.ok) return { err: r.error };
    return {
      pages: r.data.pageCount,
      text: r.data.pages.map((p) => p.text).join('\n'),
      images: r.data.pages.reduce((n, p) => n + p.images.length, 0),
      ocr: r.data.pages.map((p) => (p.ocr ? globalThis.PG.ocrMap.buildText(p.ocr).text : '')).join('\n'),
    };
  }, { b64: buf.toString('base64'), imagePolicy: imagePolicy || 'keep' });
  const raw = (buf) => buf.toString('latin1');

  const page = await h.context.newPage();
  await page.goto('https://claude.ai/new');
  await page.waitForSelector('pg-ui[data-pg-ui="status"]', { state: 'attached', timeout: 10000 });
  const tabId = await h.sw.evaluate(async () => (await chrome.tabs.query({ url: 'https://claude.ai/*' }))[0].id);
  await h.sw.evaluate((id) => globalThis.pgToggleForTab({ id }, 'toolbar'), tabId);
  await page.waitForFunction(() => {
    const e = document.querySelector('pg-ui[data-pg-ui="status"]');
    return e && e.getAttribute('data-pg-activation') === 'on';
  }, null, { timeout: 8000 });
  const uploads = () => h.apiRequests.filter((r) => r.path.endsWith('/upload'));
  async function upload(name, buf) {
    const before = uploads().length;
    await page.setInputFiles('#file', { name, mimeType: 'application/pdf', buffer: buf });
    return multipartFile((await waitFor(() => (uploads().length > before ? uploads()[uploads().length - 1] : null), 90000)).buffer);
  }

  await t.test('predefinito Personal: immagini dei PDF trattate con OCR', async () => {
    const st = await h.state();
    assert.equal(st.config.pdfImagePolicy, 'ocr');
  });

  await t.test('PDF di testo: parte come PDF con i segnaposto, nessun valore nel file, pulizie', async () => {
    const f = await upload('pratica.pdf', TESTO);
    assert.equal(f.name, 'pratica.pdf');
    assert.equal(f.data.subarray(0, 5).toString('latin1'), '%PDF-');
    const d = await describe(f.data);
    assert.ok(!d.err, d.err);
    assert.equal(d.pages, 2, 'impaginazione: stesse pagine');
    assert.match(d.text, /\[FULLNAME_\d+\]/, d.text);
    assert.match(d.text, /\[CF_\d+\]/, d.text);
    assert.match(d.text, /Seconda pagina senza dati personali/);
    assert.ok(!/Mario Rossi|Rossi/.test(d.text), d.text);
    // Nessun valore nei byte del file (metadati, XMP, commenti, modulo, segnalibri, allegato)
    assert.ok(!raw(f.data).includes('Mario Rossi'), 'nessun «Mario Rossi» nei byte del PDF');
    assert.ok(!raw(f.data).includes('RSSMRA80A01H501U'), 'nessun codice fiscale nei byte del PDF');
    assert.ok(!raw(f.data).includes('dati.txt'), 'allegato incorporato rimosso');
    const log = (await msg({ type: 'pg:localLog' })).data;
    const e = log.filter((x) => x.action === 'pseudonymize_file' && x.format === 'pdf').pop();
    assert.ok(e && e.counts && e.counts.FULLNAME >= 1, JSON.stringify(e));
    assert.ok(!JSON.stringify(log).includes('Rossi'));
  });

  await t.test('immagini nei PDF, scelta «OCR» (predefinita): dati coperti nelle immagini e nella pagina scansionata', async () => {
    const orig = await describe(IMMAGINI, 'ocr');
    assert.ok(orig.images >= 2, 'il PDF di prova contiene immagini');
    const f = await upload('verbale.pdf', IMMAGINI);
    const d = await describe(f.data, 'ocr');
    assert.ok(!d.err, d.err);
    assert.ok(d.images >= 1, 'le immagini restano');
    assert.ok(!/Rossi|Bianchi/.test(d.text + d.ocr), d.text + ' | ' + d.ocr);
    assert.match(d.text + d.ocr, /Torino|Verbale|Firmato/, 'il resto resta leggibile');
  });

  await t.test('immagini nei PDF, scelta «Togli le immagini»', async () => {
    await page.evaluate(() => 0);
    await ext.evaluate(() => chrome.storage.local.set({ pdfImagePolicy: 'remove' }));
    await waitFor(async () => (await h.state()).config.pdfImagePolicy === 'remove', 5000);
    const f = await upload('verbale2.pdf', IMMAGINI);
    const d = await describe(f.data);
    assert.ok(!d.err, d.err);
    assert.equal(d.images, 0, 'nessuna immagine nel PDF inviato');
  });

  await t.test('immagini nei PDF, scelta «Lascia le immagini»', async () => {
    await ext.evaluate(() => chrome.storage.local.set({ pdfImagePolicy: 'keep' }));
    await waitFor(async () => (await h.state()).config.pdfImagePolicy === 'keep', 5000);
    const orig = await describe(IMMAGINI);
    const f = await upload('verbale3.pdf', IMMAGINI);
    const d = await describe(f.data, 'ocr');
    assert.equal(d.images, orig.images, 'immagini intatte');
    assert.ok(!/Rossi/.test(d.text), 'il testo della pagina è comunque pseudonimizzato');
    await ext.evaluate(() => chrome.storage.local.remove('pdfImagePolicy'));
    await waitFor(async () => (await h.state()).config.pdfImagePolicy === 'ocr', 5000);
  });

  await t.test('ripristino del PDF scaricato con l\'impaginazione (senza /restore/pdf di Rizzo-PII)', async () => {
    const scope = { type: 'conversation', id: 'prova-pdf-ripristino' };
    const p = await msg({ type: 'pg:pseudonymizeFile', scope, kind: 'attachment', name: 'pratica.pdf', mime: 'application/pdf', b64: TESTO.toString('base64') });
    assert.ok(p.ok && !p.data.blocked, JSON.stringify(p).slice(0, 300));
    const pseudo = Buffer.from(p.data.contentB64, 'base64');
    const r = await msg({ type: 'pg:reidentifyFile', scope, name: 'risposta.pdf', mime: 'application/pdf', b64: p.data.contentB64 });
    assert.ok(r.ok, JSON.stringify(r).slice(0, 300));
    const out = Buffer.from(r.data.contentB64, 'base64');
    assert.equal(r.data.mime, 'application/pdf');
    assert.ok(!r.data.notice, 'nessun ripiego in solo testo: ' + r.data.notice);
    const d = await describe(out);
    const dp = await describe(pseudo);
    assert.equal(d.pages, dp.pages, 'stesse pagine');
    assert.match(d.text, /Mario Rossi/, d.text);
    assert.match(d.text, /RSSMRA80A01H501U/, d.text);
    assert.ok(!/\[CF_\d+\]/.test(d.text), d.text);
    // Le righe del testo di pagina sono ripristinate; un segnaposto può restare solo nel testo di
    // un commento (annotazione), che il ripristino come nel Python non tocca.
    assert.ok((d.text.match(/\[FULLNAME_\d+\]/g) || []).length <= 1, d.text);
  });
});
