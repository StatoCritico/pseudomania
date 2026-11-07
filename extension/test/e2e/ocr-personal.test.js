// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Personal edition end-to-end con OCR reale (Tesseract.js nel documento offscreen) e Rizzo-PII finto:
// immagine caricata, incollata e trascinata → testo letto sul PC → dati coperti con i segnaposto →
// anteprima oscurata → invio dell'immagine oscurata; PDF scansionato → PDF con i dati coperti.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { startHarness, waitFor } = require('./harness.js');

const FIX = path.join(__dirname, '..', 'fixtures', 'ocr');
const PNG = fs.readFileSync(path.join(FIX, 'testo.png')); // «Mario Rossi via Roma 12 Milano» / «codice fiscale RSSMRA80A01F205X»
const SCAN = fs.readFileSync(path.join(FIX, 'scansionato.pdf')); // Giulia Bianchi, BNCGLI85M41L219K
const MODAL = 'pg-ui[data-pg-ui="modal"]';

function multipartFile(buf) {
  const s = buf.toString('latin1');
  const name = /filename="([^"]*)"/.exec(s)[1];
  const type = (/Content-Type: ([^\r\n]+)/i.exec(s.slice(s.indexOf('filename='))) || [])[1];
  const start = s.indexOf('\r\n\r\n', s.indexOf('filename=')) + 4;
  const end = s.lastIndexOf('\r\n--');
  return { name, type, data: buf.subarray(start, end) };
}

test('Personal edition: OCR di immagini e PDF scansionati', { timeout: 240000 }, async (t) => {
  const h = await startHarness({ edition: 'personal' });
  t.after(() => h.close());
  const ext = await h.context.newPage();
  await ext.goto(`chrome-extension://${h.extensionId}/src/popup/popup.html`);
  const msg = (m) => ext.evaluate((x) => chrome.runtime.sendMessage(x), m);
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

  /** Rilegge con l'OCR dell'estensione l'immagine arrivata «a Claude». */
  async function ocrText(bytes, mime) {
    const p = await h.context.newPage();
    try {
      await p.goto(`chrome-extension://${h.extensionId}/src/offscreen/ocr.html`);
      await p.waitForFunction(() => globalThis.PGOffscreen && globalThis.PG && globalThis.PG.ocrMap, null, { timeout: 10000 });
      const r = await p.evaluate(async ({ b64, mime }) => {
        const res = await globalThis.PGOffscreen.handle({ target: 'pg-offscreen', type: 'ocr:image', b64, mime });
        return res.ok ? globalThis.PG.ocrMap.buildText(res.data.lines).text : 'ERRORE ' + res.error;
      }, { b64: Buffer.from(bytes).toString('base64'), mime });
      return r;
    } finally {
      await p.close();
    }
  }

  async function confirmAndGetUpload(before) {
    await page.waitForSelector(MODAL, { state: 'attached', timeout: 60000 });
    await page.keyboard.press('Tab'); // da «Annulla» a «Invia l'immagine oscurata»
    await page.keyboard.press('Enter');
    return waitFor(() => (uploads().length > before ? uploads()[uploads().length - 1] : null), 10000);
  }

  async function checkRedacted(up) {
    const f = multipartFile(up.buffer);
    assert.match(f.name, /^immagine-\d{14}\.png$/);
    assert.ok(!f.data.equals(PNG), 'l\'immagine inviata non è l\'originale');
    if (process.env.PG_DUMP) fs.writeFileSync(process.env.PG_DUMP + '/' + f.name, f.data);
    const text = await ocrText(f.data, 'image/png');
    assert.ok(!/Rossi/.test(text), 'nome coperto: ' + text);
    assert.ok(!/RSSMRA/.test(text), 'codice fiscale coperto: ' + text);
    assert.match(text, /Milano|Roma/, 'il resto del testo resta leggibile: ' + text);
    return text;
  }

  await t.test('predefinito Personal: oscuramento automatico', async () => {
    const st = await h.state();
    assert.equal(st.config.imagePolicy, 'ocr');
    assert.equal(st.config.imagePolicyEffective, 'ocr');
  });

  await t.test('immagine caricata: Annulla = nessun invio', async () => {
    const before = uploads().length;
    await page.setInputFiles('#file', { name: 'Screenshot_Mario_Rossi.png', mimeType: 'image/png', buffer: PNG });
    await page.waitForSelector(MODAL, { state: 'attached', timeout: 60000 });
    await page.keyboard.press('Enter'); // focus su «Annulla»
    await page.waitForTimeout(800);
    assert.equal(uploads().length, before);
  });

  await t.test('immagine caricata: dati coperti con i segnaposto, nome generico', async () => {
    const before = uploads().length;
    await page.setInputFiles('#file', { name: 'Screenshot_Mario_Rossi.png', mimeType: 'image/png', buffer: PNG });
    const text = await checkRedacted(await confirmAndGetUpload(before));
    const log = (await msg({ type: 'pg:localLog' })).data;
    const e = log.find((x) => x.action === 'pseudonymize_image');
    assert.ok(e && e.counts && e.counts.FULLNAME >= 1 && e.counts.CF >= 1, JSON.stringify(e));
    assert.ok(!JSON.stringify(log).includes('Rossi'));
  });

  await t.test('immagine incollata nella casella', async () => {
    // Come su claude.ai: il campo file della casella di scrittura ha data-testid="file-upload";
    // l'immagine oscurata viene consegnata lì.
    await page.evaluate(() => document.getElementById('file').setAttribute('data-testid', 'file-upload'));
    const before = uploads().length;
    await page.evaluate((b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], 'image.png', { type: 'image/png' }));
      document.querySelector('.ProseMirror').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    }, PNG.toString('base64'));
    await checkRedacted(await confirmAndGetUpload(before));
  });

  await t.test('immagine trascinata', async () => {
    const before = uploads().length;
    await page.evaluate((b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], 'foto.png', { type: 'image/png' }));
      document.getElementById('fs').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, PNG.toString('base64'));
    await checkRedacted(await confirmAndGetUpload(before));
  });

  await t.test('JPEG resta JPEG (metadati rimossi)', async () => {
    const jpeg = Buffer.from(await ext.evaluate(async (b64) => {
      const bmp = await createImageBitmap(new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: 'image/png' }));
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const x = c.getContext('2d');
      x.fillStyle = '#fff';
      x.fillRect(0, 0, c.width, c.height);
      x.drawImage(bmp, 0, 0);
      const b = await c.convertToBlob({ type: 'image/jpeg', quality: 0.95 });
      return btoa(String.fromCharCode(...new Uint8Array(await b.arrayBuffer())));
    }, PNG.toString('base64')), 'base64');
    const before = uploads().length;
    await page.setInputFiles('#file', { name: 'documento.jpg', mimeType: 'image/jpeg', buffer: jpeg });
    const up = await confirmAndGetUpload(before);
    const f = multipartFile(up.buffer);
    assert.match(f.name, /^immagine-\d{14}\.jpg$/);
    assert.equal(f.data[0], 0xff);
    assert.equal(f.data[1], 0xd8);
  });

  await t.test('PDF scansionato: inviato come PDF con i dati coperti (OCR)', async () => {
    const before = uploads().length;
    await page.setInputFiles('#file', { name: 'scansione.pdf', mimeType: 'application/pdf', buffer: SCAN });
    const up = await waitFor(() => (uploads().length > before ? uploads()[uploads().length - 1] : null), 60000);
    const f = multipartFile(up.buffer);
    assert.equal(f.name, 'scansione.pdf');
    assert.equal(f.data.subarray(0, 5).toString('latin1'), '%PDF-');
    // Rilettura con il motore dell'estensione: segnaposto nel testo della pagina, e l'OCR della
    // scansione oscurata non trova più nome e codice fiscale.
    const p = await h.context.newPage();
    try {
      await p.goto(`chrome-extension://${h.extensionId}/src/offscreen/ocr.html`);
      await p.waitForFunction(() => globalThis.PGOffscreen && globalThis.PG && globalThis.PG.ocrMap, null, { timeout: 10000 });
      const r = await p.evaluate(async (b64) => {
        const res = await globalThis.PGOffscreen.handle({ target: 'pg-offscreen', type: 'pdf:prepare', b64, imagePolicy: 'ocr' });
        if (!res.ok) return { err: res.error };
        return { text: res.data.pages.map((pg) => pg.text).join('\n'),
          ocr: res.data.pages.map((pg) => (pg.ocr ? globalThis.PG.ocrMap.buildText(pg.ocr).text : '')).join('\n') };
      }, f.data.toString('base64'));
      assert.ok(!r.err, r.err);
      assert.match(r.text, /\[FULLNAME_\d+\]/, r.text);
      assert.match(r.text, /\[CF_\d+\]/, r.text);
      assert.ok(!/Bianchi/.test(r.text + r.ocr), r.text + ' | ' + r.ocr);
      assert.ok(!/BNCGLI85M41L219K/.test(r.text + r.ocr), r.text + ' | ' + r.ocr);
      assert.match(r.ocr, /Torino/, 'il resto della scansione resta leggibile: ' + r.ocr);
    } finally {
      await p.close();
    }
  });

  await t.test('impostazione «Conferma»: immagine originale con conferma, senza OCR', async () => {
    await ext.evaluate(() => chrome.storage.local.set({ imagePolicy: 'confirm' }));
    await waitFor(async () => (await h.state()).config.imagePolicyEffective === 'confirm', 5000);
    const before = uploads().length;
    await page.setInputFiles('#file', { name: 'x.png', mimeType: 'image/png', buffer: PNG });
    await page.waitForSelector(MODAL, { state: 'attached', timeout: 5000 });
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    const up = await waitFor(() => (uploads().length > before ? uploads()[uploads().length - 1] : null), 8000);
    assert.ok(multipartFile(up.buffer).data.equals(PNG), 'con «Conferma» parte l\'originale');
    await ext.evaluate(() => chrome.storage.local.remove('imagePolicy'));
  });
});
