// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Selettori dell'adattatore claude.ai sul markup di riferimento di Privacy Guardrail (DFKI) e
// autoverifica. Ricordare: il markup è ricostruito, i selettori restano DA VERIFICARE sul sito reale.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..', '..');
const DFKI = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'dfki-claude.html'), 'utf8');
let browser;
let page;

test.before(async () => {
  browser = await chromium.launch();
  page = await browser.newPage();
});
test.after(async () => browser && browser.close());

async function load(html) {
  await page.setContent(`<html><body>${html}</body></html>`);
  await page.addScriptTag({ path: path.join(ROOT, 'src/sites/claude.js') });
}

test('markup DFKI: casella, pulsante di invio, messaggi', async () => {
  await load(DFKI);
  const r = await page.evaluate(() => {
    const a = PG.sites.claude;
    const c = a.findComposer(document);
    return {
      composer: c && c.getAttribute('aria-label'),
      send: a.findSendButton(document, c).getAttribute('aria-label'),
      isSend: a.isSendButton(document.querySelector('button[aria-label="Send message"]')),
      users: a.getUserMessages(document).length,
      assistant: a.getAssistantMessages(document).length,
      check: a.selfCheck(document, { page: 'chat', conversationId: 'x' }),
    };
  });
  assert.equal(r.composer, 'Write your prompt to Claude');
  assert.equal(r.send, 'Send message');
  assert.equal(r.isSend, true);
  assert.equal(r.users, 1);
  assert.equal(r.assistant, 1);
  assert.deepEqual(r.check, { ok: true, missing: [], applicable: true });
});

test('autoverifica: pagina senza casella di scrittura → non riconosciuta', async () => {
  await load('<main><div class="altro">pagina cambiata</div></main>');
  const r = await page.evaluate(() => PG.sites.claude.selfCheck(document, { page: 'new' }));
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing, ['composer']);
});

test('pulsante del microfono e progetto nell\'intestazione', async () => {
  await load('<header data-testid="chat-header"><a href="/project/7c9e6679-7425-40de-944b-e07fc1f90ae7">Prog</a></header>' +
    '<fieldset><div contenteditable="true" role="textbox"></div><button aria-label="Start dictation">m</button></fieldset>');
  const r = await page.evaluate(() => ({
    mic: PG.sites.claude.isMicButton(document.querySelector('button')),
    info: PG.sites.claude.pageInfo(document, 'https://claude.ai/chat/0f8fad5b-d9cb-469f-a165-70867728950e'),
  }));
  assert.equal(r.mic, true);
  assert.equal(r.info.projectId, '7c9e6679-7425-40de-944b-e07fc1f90ae7');
});
