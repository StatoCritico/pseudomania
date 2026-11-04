// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Attivazione per conversazione (DECISIONI.md, aggiornamento 1/11/2026).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { startHarness, waitFor } = require('./harness.js');

const C1 = '0f8fad5b-d9cb-469f-a165-70867728950e';
const C2 = '11111111-2222-4333-8444-555555555555';
const COMPLETION = /\/chat_conversations\/[^/]+\/completion$/;
const completions = (h) => h.apiRequests.filter((r) => COMPLETION.test(r.path)).map((r) => JSON.parse(r.body));
const STATUS = 'pg-ui[data-pg-ui="status"]';

async function typeAndSend(page, text) {
  await page.click('.ProseMirror');
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
}

const activation = (page) => page.$eval(STATUS, (e) => e.getAttribute('data-pg-activation'));
async function waitActivation(page, value) {
  await page.waitForFunction(([sel, v]) => {
    const e = document.querySelector(sel);
    return e && e.getAttribute('data-pg-activation') === v;
  }, [STATUS, value], { timeout: 8000 });
}

test('Personal edition: attivazione per conversazione', { timeout: 150000 }, async (t) => {
  const h = await startHarness({ edition: 'personal' });
  t.after(() => h.close());
  const ext = await h.context.newPage();
  await ext.goto(`chrome-extension://${h.extensionId}/src/options/options.html`);
  const msg = (m) => ext.evaluate((x) => chrome.runtime.sendMessage(x), m);
  const tabIdOf = (url) => h.sw.evaluate(async (u) => (await chrome.tabs.query({})).find((x) => x.url === u).id, url);
  const toggle = (tabId, trigger) => h.sw.evaluate(([id, tr]) => globalThis.pgToggleForTab({ id }, tr), [tabId, trigger]);
  const badge = (tabId) => h.sw.evaluate((id) => chrome.action.getBadgeText({ tabId: id }), tabId);

  const a = await h.context.newPage();
  await a.goto('https://claude.ai/new');
  await waitActivation(a, 'on');

  await t.test('prima chat: attiva da sola, messaggio pseudonimizzato', async () => {
    await typeAndSend(a, 'Gentile Mario Rossi');
    await waitFor(() => completions(h).length === 1, 10000);
    assert.match(completions(h)[0].prompt, /Gentile \[FULLNAME_1\]$/);
    await a.waitForFunction(() => document.querySelector('[data-is-streaming="false"] .font-claude-response'), null, { timeout: 10000 });
  });

  const tabA = await tabIdOf(`https://claude.ai/chat/${C1}`);

  await t.test('scorciatoia: spegnimento con avviso (la chat contiene dati protetti); OFF solo in uscita', async () => {
    const r = toggle(tabA, 'shortcut');
    await a.waitForSelector('pg-ui[data-pg-ui="modal"]', { state: 'attached', timeout: 5000 });
    await a.keyboard.press('Enter'); // pulsante «Disattiva», che ha il focus
    assert.deepEqual((await r).data, { state: 'off' });
    await waitActivation(a, 'off');
    assert.equal(await badge(tabA), 'OFF');
    const before = completions(h).length;
    await typeAndSend(a, 'In chiaro: Luigi Verdi');
    await waitFor(() => completions(h).length === before + 1, 8000);
    assert.equal(completions(h)[before].prompt, 'In chiaro: Luigi Verdi');
    // il ripristino in entrata resta attivo
    await a.evaluate(() => {
      const d = document.createElement('div');
      d.setAttribute('data-is-streaming', 'false');
      d.innerHTML = '<div class="font-claude-response"><p id="inb">Ricordo [FULLNAME_1].</p></div>';
      document.getElementById('transcript').appendChild(d);
    });
    await a.waitForFunction(() => document.getElementById('inb').textContent === 'Ricordo Mario Rossi.', null, { timeout: 5000 });
    // secondo spegnimento/accensione: nessun nuovo avviso
    await toggle(tabA, 'toolbar');
    await waitActivation(a, 'on');
    const r2 = await toggle(tabA, 'toolbar');
    assert.deepEqual(r2.data, { state: 'off' });
    assert.equal(await a.$('pg-ui[data-pg-ui="modal"]'), null);
  });

  const b = await h.context.newPage();
  await t.test('nuova chat dopo uno spegnimento: banner «Attiva» / «Continua senza protezione»; badge diversi per scheda', async () => {
    await b.goto('https://claude.ai/new');
    await waitActivation(b, 'ask');
    await b.getByRole('button', { name: 'Continua senza protezione' }).waitFor({ timeout: 5000 });
    const tabB = await tabIdOf('https://claude.ai/new');
    await waitFor(async () => (await badge(tabB)) === '?', 5000);
    assert.equal(await badge(tabA), 'OFF');
    await b.getByRole('button', { name: 'Attiva', exact: true }).click();
    await waitActivation(b, 'on');
    await waitFor(async () => (await badge(tabB)) === 'ON', 5000);
    assert.equal(await badge(tabA), 'OFF', 'la scheda A resta spenta');
    await b.evaluate((id) => (window.__nextConv = id), C2);
    const before = completions(h).length;
    await typeAndSend(b, 'Pratica di Anna Gialli');
    await waitFor(() => completions(h).length === before + 1, 8000);
    assert.match(completions(h)[before].prompt, /\[FULLNAME_\d+\]$/);
    await waitFor(() => b.url().endsWith(C2), 5000);
    await b.waitForTimeout(1500);
  });

  await t.test('navigazione tra chat nella stessa scheda: ripresa spenta → banner; ripresa attiva → da sola', async () => {
    // cambio di chat subito dopo il primo invio (prima del controllo periodico): la scelta della
    // nuova chat non deve finire sulla chat aperta dopo
    await b.evaluate((id) => history.pushState({}, '', '/chat/' + id), C1);
    await waitActivation(b, 'ask');
    await b.evaluate((id) => history.pushState({}, '', '/chat/' + id), C2);
    await waitActivation(b, 'on');
    assert.equal(await b.getByRole('button', { name: 'Continua senza protezione' }).count(), 0);
    // riapertura in una nuova scheda: stato persistito
    const c = await h.context.newPage();
    await c.goto(`https://claude.ai/chat/${C2}`);
    await waitActivation(c, 'on');
    await c.close();
  });

  await t.test('registro locale: cambi di stato senza testi', async () => {
    const log = (await msg({ type: 'pg:localLog' })).data;
    const changes = log.filter((e) => e.event === 'extension_disabled' || e.event === 'extension_enabled');
    assert.ok(changes.some((e) => e.event === 'extension_disabled' && e.details.trigger === 'shortcut'));
    assert.ok(changes.some((e) => e.event === 'extension_enabled' && e.details.trigger === 'banner'));
    assert.ok(!JSON.stringify(log).includes('Luigi'));
  });
});

test('Server edition: pulsante bloccato su acceso', { timeout: 60000 }, async (t) => {
  const h = await startHarness();
  t.after(() => h.close());
  const page = await h.context.newPage();
  await page.goto('https://claude.ai/new');
  await page.waitForSelector(STATUS, { state: 'attached', timeout: 10000 });
  assert.equal(await activation(page), 'locked');
  const tabId = await h.sw.evaluate(async () => (await chrome.tabs.query({ url: 'https://claude.ai/*' }))[0].id);
  const r = await h.sw.evaluate((id) => globalThis.pgToggleForTab({ id }, 'shortcut'), tabId);
  assert.deepEqual(r.data, { locked: true, state: 'on' });
  assert.equal(await h.sw.evaluate(() => chrome.action.getPopup({})), `chrome-extension://${h.extensionId}/src/popup/popup.html`);
  await typeAndSend(page, 'Gentile Mario Rossi');
  await waitFor(() => completions(h).length === 1, 10000);
  assert.match(completions(h)[0].prompt, /\[FULLNAME_1\]$/, 'sempre protetto');
  const popup = await h.context.newPage();
  await popup.goto(`chrome-extension://${h.extensionId}/src/popup/popup.html`);
  await popup.waitForFunction(() => /gestito dalla tua organizzazione/.test(document.getElementById('locked').textContent), null, { timeout: 5000 });
  assert.equal(await popup.isVisible('#switchRow'), false);
});
