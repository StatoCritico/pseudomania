// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Personal edition: avviso all'invio con la protezione spenta (dati evidenti trovati da
// detector-lite) e pagina di benvenuto alla prima installazione.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { startHarness, waitFor } = require('./harness.js');

const C2 = '22222222-3333-4444-8555-666666666666';
const COMPLETION = /\/chat_conversations\/[^/]+\/completion$/;
const completions = (h) => h.apiRequests.filter((r) => COMPLETION.test(r.path)).map((r) => JSON.parse(r.body));
const STATUS = 'pg-ui[data-pg-ui="status"]';
const MODAL = 'pg-ui[data-pg-ui="modal"]';
const CF = 'RSSMRA85T10A562S'; // codice fiscale di esempio con carattere di controllo valido

async function typeAndSend(page, text) {
  await page.click('.ProseMirror');
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
}

async function waitActivation(page, value) {
  await page.waitForFunction(([sel, v]) => {
    const e = document.querySelector(sel);
    return e && e.getAttribute('data-pg-activation') === v;
  }, [STATUS, value], { timeout: 8000 });
}

test('Personal edition: avviso all\'invio con la protezione spenta', { timeout: 120000 }, async (t) => {
  const h = await startHarness({ edition: 'personal' });
  t.after(() => h.close());
  const ext = await h.context.newPage();
  await ext.goto(`chrome-extension://${h.extensionId}/src/options/options.html`);
  const msg = (m) => ext.evaluate((x) => chrome.runtime.sendMessage(x), m);

  const a = await h.context.newPage();
  await a.goto('https://claude.ai/new');
  await waitActivation(a, 'off');

  await t.test('codice fiscale con protezione OFF: finestra; Invio = attiva e invia pseudonimizzato', async () => {
    await typeAndSend(a, `Il mio codice fiscale è ${CF}`);
    await a.waitForSelector(MODAL, { state: 'attached', timeout: 5000 });
    await a.waitForTimeout(300);
    assert.equal(completions(h).length, 0, 'nulla parte finché non si sceglie');
    await a.keyboard.press('Enter'); // focus iniziale su «Attiva la protezione e invia»
    await waitFor(() => completions(h).length === 1, 10000);
    const prompt = completions(h)[0].prompt;
    assert.match(prompt, /Il mio codice fiscale è \[CF_1\]$/);
    assert.ok(!prompt.includes(CF));
    await waitActivation(a, 'on');
    assert.equal(await a.$(MODAL), null);
  });

  const b = await h.context.newPage();
  await b.goto('https://claude.ai/new');
  await waitActivation(b, 'off');
  await b.evaluate((id) => (window.__nextConv = id), C2);

  await t.test('«Invia senza protezione»: il messaggio parte in chiaro, la protezione resta spenta', async () => {
    const before = completions(h).length;
    const text = `Pratica ${CF}`;
    await typeAndSend(b, text);
    await b.waitForSelector(MODAL, { state: 'attached', timeout: 5000 });
    await b.keyboard.press('Shift+Tab'); // da «Attiva la protezione e invia» a «Invia senza protezione»
    await b.keyboard.press('Enter');
    await waitFor(() => completions(h).length === before + 1, 8000);
    assert.equal(completions(h)[before].prompt, text);
    await waitFor(() => b.url().endsWith(C2), 5000);
    await waitActivation(b, 'off');
  });

  await t.test('testo senza dati evidenti: parte subito, senza finestra', async () => {
    const before = completions(h).length;
    await typeAndSend(b, 'Ciao Luigi, come stai?');
    await waitFor(() => completions(h).length === before + 1, 8000);
    assert.equal(completions(h)[before].prompt, 'Ciao Luigi, come stai?');
    assert.equal(await b.$(MODAL), null);
  });

  await t.test('«Annulla» non invia; «Non chiedere più in questa conversazione» vale per la conversazione', async () => {
    let before = completions(h).length;
    await typeAndSend(b, 'mail a mario@example.com');
    await b.waitForSelector(MODAL, { state: 'attached', timeout: 5000 });
    await b.keyboard.press('Escape');
    await b.waitForSelector(MODAL, { state: 'detached', timeout: 3000 });
    await b.waitForTimeout(400);
    assert.equal(completions(h).length, before, 'annullato: nulla parte');
    // Il testo è ancora nella casella: nuovo invio, si spunta la casella e si invia in chiaro.
    await b.click('.ProseMirror');
    await b.keyboard.press('Enter');
    await b.waitForSelector(MODAL, { state: 'attached', timeout: 5000 });
    for (let i = 0; i < 3; i++) await b.keyboard.press('Shift+Tab'); // → casella «Non chiedere più»
    await b.keyboard.press('Space');
    await b.keyboard.press('Tab'); // → Annulla
    await b.keyboard.press('Tab'); // → Invia senza protezione
    await b.keyboard.press('Enter');
    await waitFor(() => completions(h).length === before + 1, 8000);
    assert.equal(completions(h)[before].prompt, 'mail a mario@example.com');
    before = completions(h).length;
    await typeAndSend(b, `Di nuovo ${CF}`);
    await waitFor(() => completions(h).length === before + 1, 8000);
    assert.equal(await b.$(MODAL), null, 'nessuna domanda in questa conversazione');
    // In un'altra conversazione spenta l'avviso torna.
    const c = await h.context.newPage();
    await c.goto('https://claude.ai/new');
    await waitActivation(c, 'off');
    await typeAndSend(c, `CF ${CF}`);
    await c.waitForSelector(MODAL, { state: 'attached', timeout: 5000 });
    await c.keyboard.press('Escape');
    await c.close();
  });

  await t.test('registro: solo conteggi per tipo e scelta, nessun testo', async () => {
    const log = (await msg({ type: 'pg:localLog' })).data;
    const w = log.filter((e) => e.event === 'unprotected_send_warning');
    assert.ok(w.some((e) => e.details.choice === 'protect' && e.details.counts.CF === 1));
    assert.ok(w.some((e) => e.details.choice === 'clear'));
    assert.ok(w.some((e) => e.details.choice === 'cancel' && e.details.counts.EMAIL === 1));
    const ser = JSON.stringify(w);
    assert.ok(!ser.includes(CF) && !ser.includes('mario@example.com') && !ser.includes('Pratica'));
  });
});

test('Personal edition: pagina di benvenuto all\'installazione', { timeout: 60000 }, async (t) => {
  const h = await startHarness({ edition: 'personal' });
  t.after(() => h.close());
  const url = `chrome-extension://${h.extensionId}/src/welcome/welcome.html`;
  const page = await waitFor(() => h.context.pages().find((p) => p.url() === url), 10000);
  await page.waitForLoadState('domcontentloaded');
  const status = () => page.$eval('#rizzoStatus', (e) => e.dataset.state);

  await t.test('Rizzo-PII finto acceso: stato verde', async () => {
    // L'indirizzo del Rizzo-PII finto viene salvato dopo l'installazione: la pagina lo segue.
    await page.click('#btnCheck');
    await waitFor(async () => (await status()) === 'ok', 10000);
    assert.match(await page.textContent('#rizzoMsg'), /Rizzo-PII risponde/);
    assert.equal(await page.isHidden('#rizzoHelp'), true);
    // Chromium di prova non sempre assegna la scorciatoia suggerita: si accettano entrambi i casi.
    assert.match(await page.textContent('#shortcut'), /Alt\+Maiusc\+P|nessuna scorciatoia/);
    assert.equal(await page.getAttribute('#guide', 'href'), 'https://pseudomania.statocritico.it/approfondimenti/personal-edition.html');
  });

  await t.test('Rizzo-PII assente: stato rosso con istruzioni e link per scaricarlo', async () => {
    await h.sw.evaluate(() => chrome.storage.local.set({ rizzoUrl: 'http://127.0.0.1:9' }));
    await waitFor(async () => (await status()) === 'ko', 10000);
    assert.match(await page.textContent('#rizzoMsg'), /non risponde/);
    assert.equal(await page.isVisible('#rizzoHelp'), true);
    assert.equal(await page.getAttribute('#rizzoDownload', 'href'), 'https://github.com/Rizzo-AI-Academy/rizzo-pii/releases');
  });
});
