// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Personal edition: categorie particolari (artt. 9-10 GDPR) bloccate di default; invio
// pseudonimizzato solo dopo una conferma esplicita (decisione dell'8/11/2026).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { startHarness, waitFor } = require('./harness.js');

const COMPLETION = /\/chat_conversations\/[^/]+\/completion$/;
const MODAL = 'pg-ui[data-pg-ui="modal"]';

function completions(h) {
  return h.apiRequests.filter((r) => COMPLETION.test(r.path)).map((r) => JSON.parse(r.body));
}

test('Personal edition: categoria particolare inviata pseudonimizzata solo dopo conferma', { timeout: 120000 }, async (t) => {
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

  const openModal = async () => {
    await page.waitForSelector(MODAL, { state: 'attached', timeout: 8000 });
  };
  const closedModal = () => page.waitForSelector(MODAL, { state: 'detached', timeout: 5000 });

  await t.test('testo con «querela»: finestra; Invio subito = Annulla, nulla parte', async () => {
    await page.click('.ProseMirror');
    await page.keyboard.type('Mario Rossi ha sporto querela contro il vicino');
    await page.keyboard.press('Enter');
    await openModal();
    await page.keyboard.press('Enter'); // il focus è su «Annulla»
    await closedModal();
    await page.waitForTimeout(400);
    assert.equal(completions(h).length, 0);
    const left = await page.$eval('.ProseMirror', (e) => e.innerText);
    assert.ok(left.includes('Mario Rossi'), 'il testo resta nella casella');
    // il blocco resta visibile con «Segnala blocco errato»
    const banner = await page.$eval('pg-ui[data-pg-ui="status"]', (e) => e.shadowRoot.textContent);
    assert.match(banner, /Segnala blocco errato/);
  });

  await t.test('senza spunta il pulsante «Invia pseudonimizzato» non è raggiungibile', async () => {
    await page.click('.ProseMirror');
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await openModal();
    await page.keyboard.press('Tab'); // casella
    await page.keyboard.press('Tab'); // di nuovo «Annulla»: il pulsante disabilitato viene saltato
    await page.keyboard.press('Enter');
    await closedModal();
    await page.waitForTimeout(400);
    assert.equal(completions(h).length, 0);
  });

  await t.test('spunta + «Invia pseudonimizzato»: parte con le parole sensibili ma senza nomi', async () => {
    await page.click('.ProseMirror');
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await openModal();
    await page.keyboard.press('Tab'); // casella
    await page.keyboard.press('Space'); // spunta
    await page.keyboard.press('Tab'); // Annulla
    await page.keyboard.press('Tab'); // Invia pseudonimizzato
    await page.keyboard.press('Enter');
    await waitFor(() => completions(h).length === 1, 10000);
    const prompt = completions(h)[0].prompt;
    assert.match(prompt, /\[FULLNAME_1\] ha sporto querela contro il vicino$/);
    assert.ok(!prompt.includes('Mario'), 'nessun nome in chiaro');
  });

  await t.test('registro: specialOverride con la sola categoria, nessun testo', async () => {
    const log = await waitFor(async () => {
      const l = (await msg({ type: 'pg:localLog' })).data;
      return l.some((e) => e.specialOverride) ? l : null;
    }, 5000);
    const ov = log.find((e) => e.action === 'pseudonymize' && e.specialOverride);
    assert.deepEqual(ov.specialOverride, { category: 'giudiziari' });
    assert.equal(ov.counts.FULLNAME, 1);
    assert.ok(log.some((e) => e.event === 'special_override_confirmed' && e.details.category === 'giudiziari'));
    assert.ok(log.some((e) => e.event === 'special_override_cancelled'));
    assert.ok(log.filter((e) => e.blocked && e.category === 'giudiziari').length >= 3);
    const ser = JSON.stringify(log);
    assert.ok(!ser.includes('Mario') && !ser.includes('querela') && !ser.includes('vicino'));
  });

  await t.test('file .txt con categoria: stessa finestra; Annulla = non allegato, conferma = pseudonimizzato', async () => {
    const file = { name: 'nota.txt', mimeType: 'text/plain', buffer: Buffer.from('Pratica di Luigi Verdi: diagnosi di diabete') };
    await page.setInputFiles('#file', file);
    await openModal();
    await page.keyboard.press('Enter');
    await closedModal();
    await page.waitForTimeout(400);
    assert.equal(await page.$('.chip'), null, 'Annulla: nessun allegato');
    await page.setInputFiles('#file', file);
    await openModal();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Space');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await page.waitForSelector('.chip', { timeout: 10000 });
    const content = await page.$eval('.chip', (e) => e.dataset.content);
    assert.match(content, /^Pratica di \[FULLNAME_\d\]: diagnosi di diabete$/);
    const log = (await msg({ type: 'pg:localLog' })).data;
    const f = log.find((e) => e.action === 'pseudonymize_file' && e.specialOverride);
    assert.deepEqual(f.specialOverride, { category: 'salute' });
    assert.ok(!JSON.stringify(log).includes('Verdi'));
  });

  await t.test('la conferma vale per un solo file: il successivo chiede di nuovo', async () => {
    await page.evaluate(() => (document.getElementById('chips').textContent = ''));
    await page.setInputFiles('#file', { name: 'altra.txt', mimeType: 'text/plain', buffer: Buffer.from('Certificato medico di Anna Gialli') });
    await openModal();
    await page.keyboard.press('Escape');
    await closedModal();
    await page.waitForTimeout(300);
    assert.equal(await page.$('.chip'), null);
  });
});
