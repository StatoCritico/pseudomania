// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Test DOM del motore di ripristino. Al posto di jsdom (non installabile nell'ambiente di sviluppo)
// si usa Chromium headless via Playwright: è il motore reale su cui gira l'estensione.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..', '..');
const SCRIPTS = ['src/shared/strings.js', 'src/shared/tags.js', 'src/sites/claude.js', 'src/content/restore.js'];

let browser;
let page;

test.before(async () => {
  browser = await chromium.launch();
  page = await browser.newPage();
});
test.after(async () => browser && browser.close());

async function setup(html) {
  await page.setContent(`<html><body>${html}</body></html>`);
  for (const s of SCRIPTS) await page.addScriptTag({ path: path.join(ROOT, s) });
  await page.evaluate(() => {
    window.completed = [];
    window.engine = new PG.RestoreEngine({
      adapter: PG.sites.claude,
      doc: document,
      excludeTexts: () => ['ISTRUZIONE [FULLNAME_1]'],
      onResponseComplete: (i) => window.completed.push(i),
    });
    window.engine.entries = { '[FULLNAME_1]': 'Mario Rossi', '[EMAIL_1]': 'm.rossi@ente.it' };
    window.engine.start();
  });
}

const settle = () => page.evaluate(() => new Promise((r) => setTimeout(r, 50)));

test('ripristino su nodi di testo separati da markup inline', async () => {
  await setup('<div class="font-claude-response"><p id="p">Gentile <b>[FULL</b>NAME_1], scriva a [EMAIL_1].</p></div>');
  await settle();
  const text = await page.$eval('#p', (e) => e.textContent);
  assert.equal(text, 'Gentile Mario Rossi, scriva a m.rossi@ente.it.');
  const raw = await page.evaluate(() => engine.rawTextOf(document.getElementById('p')));
  assert.equal(raw, 'Gentile [FULLNAME_1], scriva a [EMAIL_1].');
});

test('streaming: testo aggiunto a pezzi, segnaposto spezzato fra nodi', async () => {
  await setup('<div data-is-streaming="true"><div class="font-claude-response"><p id="p"></p></div></div>');
  const chunks = ['Buongiorno [FU', 'LLNA', 'ME_1', '], la contatto', ' a [EMA', 'IL_1].'];
  for (const c of chunks) {
    await page.evaluate((c) => document.getElementById('p').appendChild(document.createTextNode(c)), c);
    await settle();
  }
  assert.equal(await page.$eval('#p', (e) => e.textContent), 'Buongiorno Mario Rossi, la contatto a m.rossi@ente.it.');
});

test('streaming: il sito riscrive il nodo esistente (stile React) senza duplicazioni', async () => {
  await setup('<div class="font-claude-response"><p id="p">Ciao [FULLNAME_1]</p></div>');
  await settle();
  assert.equal(await page.$eval('#p', (e) => e.textContent), 'Ciao Mario Rossi');
  // React aggiorna lo stesso nodo con il testo completo (grezzo) più lungo
  await page.evaluate(() => (document.getElementById('p').firstChild.data = 'Ciao [FULLNAME_1], come sta [FULLNAME_1]?'));
  await settle();
  assert.equal(await page.$eval('#p', (e) => e.textContent), 'Ciao Mario Rossi, come sta Mario Rossi?');
});

test('segnaposto sconosciuto: evidenziato e segnalato, testo invariato', async () => {
  await setup('<div class="font-claude-response"><p id="p">Valore [CF_7] ignoto</p></div>');
  await settle();
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));
  assert.equal(await page.$eval('#p', (e) => e.textContent), 'Valore [CF_7] ignoto');
  const hl = await page.evaluate(() => ({ unknown: CSS.highlights.get('pg-unknown').size }));
  assert.equal(hl.unknown, 1);
});

test('evidenziazione dei valori ripristinati con CSS Custom Highlight', async () => {
  await setup('<div class="font-claude-response"><p>[FULLNAME_1] e [EMAIL_1]</p></div>');
  await settle();
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));
  const n = await page.evaluate(() => CSS.highlights.get('pg-restored').size);
  assert.equal(n, 2);
});

test('campi modificabili e istruzione fissa non vengono toccati', async () => {
  await setup(
    '<div contenteditable="true" id="ed"><p>[FULLNAME_1]</p></div><textarea id="ta">[FULLNAME_1]</textarea>' +
      '<div data-testid="user-message"><p id="u">ISTRUZIONE [FULLNAME_1]\n\nPer [FULLNAME_1]</p></div>'
  );
  await settle();
  assert.equal(await page.$eval('#ed', (e) => e.textContent), '[FULLNAME_1]');
  assert.equal(await page.$eval('#ta', (e) => e.value), '[FULLNAME_1]');
  assert.equal(await page.$eval('#u', (e) => e.textContent), 'ISTRUZIONE [FULLNAME_1]\n\nPer Mario Rossi');
});

test('aggiornamento del dizionario e disattivazione (ritorno ai segnaposto)', async () => {
  await setup('<div class="font-claude-response"><p id="p">Pratica di [FULLNAME_2]</p></div>');
  await settle();
  assert.equal(await page.$eval('#p', (e) => e.textContent), 'Pratica di [FULLNAME_2]');
  await page.evaluate(() => engine.setEntries({ '[FULLNAME_2]': 'Giulia Bianchi' }));
  assert.equal(await page.$eval('#p', (e) => e.textContent), 'Pratica di Giulia Bianchi');
  await page.evaluate(() => engine.setEnabled(false));
  assert.equal(await page.$eval('#p', (e) => e.textContent), 'Pratica di [FULLNAME_2]');
});

test('fine della risposta: response_received con testo grezzo e sconosciuti', async () => {
  await setup('<div data-is-streaming="true" id="turn"><div class="font-claude-response"><p id="p">Esito per [FULLNAME_1] e [EMAIL_4]</p></div></div>');
  await settle();
  await page.evaluate(() => document.getElementById('turn').setAttribute('data-is-streaming', 'false'));
  await page.waitForFunction(() => window.completed.length > 0, null, { timeout: 4000 });
  const c = await page.evaluate(() => window.completed.map((x) => ({ raw: x.raw, unknown: x.unknown })));
  assert.deepEqual(c, [{ raw: 'Esito per [FULLNAME_1] e [EMAIL_4]', unknown: ['[EMAIL_4]'] }]);
});
