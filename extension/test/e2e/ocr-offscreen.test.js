// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Prova end-to-end del documento offscreen dell'OCR (OCR-CONTRATTO.md, sezione 2): Tesseract.js
// caricato davvero dall'estensione in Chromium (i PDF sono provati in pdf-offscreen.test.js).
// Il documento è aperto in una scheda
// (chrome-extension://<id>/src/offscreen/ocr.html) e interrogato con PGOffscreen.handle(...).
// Fixture in test/fixtures/ocr/: testo.png (testo nero su bianco).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { chromium } = require('playwright');

const EXT = path.join(__dirname, '..', '..');
const FIX = path.join(EXT, 'test', 'fixtures', 'ocr');
const b64 = (name) => fs.readFileSync(path.join(FIX, name)).toString('base64');

/** Chromium di Playwright se installato, altrimenti Chrome di sistema. */
function executablePath() {
  try {
    const p = chromium.executablePath();
    if (p && fs.existsSync(p)) return undefined;
  } catch (_) { /* ripiego */ }
  return fs.existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined;
}

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

test('documento offscreen OCR (Tesseract.js)', { timeout: 240000 }, async (t) => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-ocr-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    executablePath: executablePath(),
    args: ['--headless=new', `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  t.after(async () => {
    await context.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
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

  let imgRes;
  await t.test('ocr:image: parole e bbox sensati (primo avvio del worker)', async () => {
    let t0 = Date.now();
    imgRes = await call({ type: 'ocr:image', b64: b64('testo.png'), mime: 'image/png' });
    times.primaOcrImmagine = Date.now() - t0;
    assert.equal(imgRes.ok, true, JSON.stringify(imgRes));
    const { width, height, lines } = imgRes.data;
    assert.equal(width, 1100);
    assert.equal(height, 188);
    assert.equal(lines.length, 2, JSON.stringify(lines.map((l) => l.words.map((w) => w.text))));
    const words = lines.flatMap((l) => l.words);
    const joined = norm(words.map((w) => w.text).join(' '));
    for (const s of ['Mario', 'Rossi', 'Roma', 'Milano', 'RSSMRA80A01F205X']) assert.ok(joined.includes(norm(s)), `manca ${s}: ${joined}`);
    for (const w of words) {
      const b = w.bbox;
      assert.ok(b.x0 >= 0 && b.y0 >= 0 && b.x1 <= width && b.y1 <= height && b.x1 > b.x0 && b.y1 > b.y0, JSON.stringify(w));
      assert.ok(w.conf >= 50 && w.conf <= 100, JSON.stringify(w));
    }
    // Prima riga sopra la seconda, parole da sinistra a destra.
    assert.ok(lines[0].words[0].bbox.y1 <= lines[1].words[0].bbox.y0 + 5);
    assert.ok(lines[0].words[0].bbox.x0 < lines[0].words[1].bbox.x0);
    assert.ok(Math.abs(lines[0].words[0].bbox.x0 - 40) < 10, 'il testo inizia a x≈40');
    // Seconda OCR: worker già pronto.
    t0 = Date.now();
    const again = await call({ type: 'ocr:image', b64: b64('testo.png'), mime: 'image/png' });
    times.ocrImmagineWorkerPronto = Date.now() - t0;
    assert.equal(again.ok, true);
  });

  await t.test('ocr:image: immagine non decodificabile → decode', async () => {
    const r = await call({ type: 'ocr:image', b64: Buffer.from('non è un\'immagine').toString('base64'), mime: 'image/png' });
    assert.equal(r.ok, false);
    assert.equal(r.error, 'decode');
  });

  await t.test('ocr:redact: riquadri neri nell\'immagine ri-codificata', async () => {
    const words = imgRes.data.lines.flatMap((l) => l.words);
    const cf = words.find((w) => /RSSMRA/i.test(w.text));
    const mario = words.find((w) => /mario/i.test(w.text));
    const boxes = [
      { ...cf.bbox, label: '[CF_1]' },
      { ...mario.bbox, label: '' },
    ];
    const t0 = Date.now();
    const r = await call({ type: 'ocr:redact', b64: b64('testo.png'), mime: 'image/png', boxes, outMime: 'image/png' });
    times.redact = Date.now() - t0;
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.data.mime, 'image/png');
    const stats = await page.evaluate(async ({ b64, boxes }) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const ctx = c.getContext('2d');
      ctx.drawImage(bmp, 0, 0);
      return boxes.map((b) => {
        const d = ctx.getImageData(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0).data;
        let black = 0; let white = 0;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i] < 40 && d[i + 1] < 40 && d[i + 2] < 40) black++;
          else if (d[i] > 215) white++;
        }
        return { black: black / (d.length / 4), white: white / (d.length / 4), w: bmp.width, h: bmp.height };
      });
    }, { b64: r.data.b64, boxes });
    assert.equal(stats[0].w, 1100);
    // Riquadro con etichetta: quasi tutto nero, un po' di bianco (il segnaposto).
    assert.ok(stats[0].black > 0.6, JSON.stringify(stats[0]));
    assert.ok(stats[0].white > 0.01, 'etichetta bianca disegnata: ' + JSON.stringify(stats[0]));
    // Riquadro senza etichetta: interamente nero.
    assert.ok(stats[1].black > 0.99, JSON.stringify(stats[1]));
    // JPEG in uscita.
    const j = await call({ type: 'ocr:redact', b64: b64('testo.png'), mime: 'image/png', boxes, outMime: 'image/jpeg' });
    assert.equal(j.ok, true);
    assert.equal(j.data.mime, 'image/jpeg');
    assert.equal(Buffer.from(j.data.b64, 'base64').subarray(0, 2).toString('hex'), 'ffd8');
  });

  await t.test('chrome.runtime.onMessage: risponde solo a target pg-offscreen', async () => {
    const r = await sw.evaluate((png) => chrome.runtime.sendMessage({ target: 'pg-offscreen', type: 'ocr:image', b64: png, mime: 'image/png' }), b64('testo.png'));
    assert.equal(r.ok, true);
    assert.equal(r.data.lines.length, 2);
    const other = await sw.evaluate(() => chrome.runtime.sendMessage({ target: 'altro', type: 'ocr:image' }).then((v) => ({ v }), (e) => ({ e: e.message })));
    assert.equal(other.v, undefined, JSON.stringify(other));
    const unk = await call({ type: 'boh' });
    assert.deepEqual([unk.ok, unk.error], [false, 'ocr']);
  });

  assert.deepEqual(errors, []);
  console.log('[tempi ms]', JSON.stringify(times));
});
