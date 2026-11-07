// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Impostazioni, «Immagini nei PDF» (Personal edition): la scelta «Lascia le immagini» richiede una seconda
// conferma in una finestra della pagina; annullando nulla viene salvato.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { startHarness, waitFor } = require('./harness.js');

const stored = (h) => h.sw.evaluate(async () => (await chrome.storage.local.get('pdfImagePolicy')).pdfImagePolicy);
const checked = (page) => page.$eval('input[name="pdfImagePolicy"]:checked', (e) => e.value);

test('Personal edition: immagini nei PDF, conferma per «Lascia le immagini»', { timeout: 90000 }, async (t) => {
  const h = await startHarness({ edition: 'personal' });
  t.after(() => h.close());
  const page = await h.context.newPage();
  await page.goto(`chrome-extension://${h.extensionId}/src/options/options.html`);
  await page.waitForSelector('#pdfImages:not([hidden]) input[name="pdfImagePolicy"]');
  assert.equal(await checked(page), 'ocr', 'predefinito: leggi e copri');
  assert.equal(await page.$$eval('input[name="pdfImagePolicy"]', (l) => l.length), 3);
  assert.equal(await stored(h), undefined);

  // Lascia → finestra → Annulla: torna a «ocr», nulla salvato.
  await page.click('input[name="pdfImagePolicy"][value="keep"]');
  await page.waitForSelector('#pdfKeepDlg[open]');
  assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.id), 'pdfKeepCancel',
    'focus iniziale su «Annulla»');
  assert.match(await page.textContent('#pdfKeepText'), /firme.*timbri.*fotografie.*scansionate/s);
  await page.click('#pdfKeepCancel');
  await page.waitForSelector('#pdfKeepDlg[open]', { state: 'detached' });
  await waitFor(async () => (await checked(page)) === 'ocr', 3000);
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(await stored(h), undefined, 'annullando nulla viene salvato');

  // Anche Esc annulla.
  await page.click('input[name="pdfImagePolicy"][value="keep"]');
  await page.waitForSelector('#pdfKeepDlg[open]');
  await page.keyboard.press('Escape');
  await page.waitForSelector('#pdfKeepDlg[open]', { state: 'detached' });
  await waitFor(async () => (await checked(page)) === 'ocr', 3000);
  assert.equal(await stored(h), undefined);

  // Lascia → conferma: salvato «keep» e pubblicato nello stato.
  await page.click('input[name="pdfImagePolicy"][value="keep"]');
  await page.waitForSelector('#pdfKeepDlg[open]');
  await page.click('#pdfKeepOk');
  await waitFor(async () => (await stored(h)) === 'keep', 5000);
  assert.equal(await checked(page), 'keep');
  await waitFor(async () => {
    const st = await h.state();
    return st && st.config && st.config.pdfImagePolicy === 'keep';
  }, 8000);

  // Togli: salvato senza finestra.
  await page.click('input[name="pdfImagePolicy"][value="remove"]');
  await waitFor(async () => (await stored(h)) === 'remove', 5000);
  assert.equal(await page.$eval('#pdfKeepDlg', (d) => d.open), false, 'nessuna finestra per «Togli»');

  // Dopo un ricaricamento la scelta resta.
  await page.reload();
  await page.waitForSelector('#pdfImages:not([hidden]) input[name="pdfImagePolicy"]');
  assert.equal(await checked(page), 'remove');
});

test('Server edition: nessun gruppo «Immagini nei PDF»', { timeout: 90000 }, async (t) => {
  const h = await startHarness({ edition: 'server' });
  t.after(() => h.close());
  const page = await h.context.newPage();
  await page.goto(`chrome-extension://${h.extensionId}/src/options/options.html`);
  await page.waitForSelector('#images:not([hidden])');
  assert.equal(await page.$eval('#pdfImages', (e) => e.hidden), true);
});
