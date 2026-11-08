// SPDX-License-Identifier: AGPL-3.0-or-later
//
// «Dati da non mascherare» (keepTypes, solo Personal edition): gruppo di caselle nelle impostazioni,
// salvataggio in chrome.storage.local e pubblicazione nello stato; nel flusso Personal date e importi
// scelti restano in chiaro mentre il nome resta mascherato. Server edition: il gruppo non compare.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { startHarness, waitFor } = require('./harness.js');

const COMPLETION = /\/chat_conversations\/[^/]+\/completion$/;
const stored = (h) => h.sw.evaluate(async () => (await chrome.storage.local.get('keepTypes')).keepTypes);
const checkedTypes = (page) => page.$$eval('input[name="keepTypes"]:checked', (l) => l.map((e) => e.value));

test('Personal edition: impostazione «Dati da non mascherare»', { timeout: 90000 }, async (t) => {
  const h = await startHarness({ edition: 'personal' });
  t.after(() => h.close());
  const page = await h.context.newPage();
  await page.goto(`chrome-extension://${h.extensionId}/src/options/options.html`);
  await page.waitForSelector('#keepTypes:not([hidden]) input[name="keepTypes"]');
  assert.equal(await page.textContent('#keepTitle'), 'Dati da non mascherare');
  const values = await page.$$eval('input[name="keepTypes"]', (l) => l.map((e) => e.value));
  assert.deepEqual(values, ['DATE', 'TIME', 'AMOUNT', 'AGE', 'GENDER', 'ORG'], 'solo i tipi a basso rischio');
  const labels = await page.$$eval('#keepOptions label .ttl', (l) => l.map((e) => e.textContent));
  assert.deepEqual(labels, ['Date', 'Orari', 'Importi', 'Età', 'Genere', 'Organizzazioni (enti, società, tribunali)']);
  assert.match(await page.textContent('#keepOptions'), /ditte individuali.*studi.*nome di una persona/s);
  assert.match(await page.textContent('#keepHelp'), /Nomi, codici fiscali, IBAN, email, telefoni, indirizzi/);
  assert.deepEqual(await checkedTypes(page), [], 'predefinito: tutto mascherato');
  assert.equal(await stored(h), undefined);
  assert.deepEqual((await h.state()).config.keepTypes, []);

  await page.check('input[name="keepTypes"][value="AMOUNT"]');
  await page.check('input[name="keepTypes"][value="DATE"]');
  await waitFor(async () => JSON.stringify(await stored(h)) === '["DATE","AMOUNT"]', 5000);
  await waitFor(async () => {
    const st = await h.state();
    return st && st.config && JSON.stringify(st.config.keepTypes) === '["DATE","AMOUNT"]';
  }, 8000);
  await page.uncheck('input[name="keepTypes"][value="AMOUNT"]');
  await waitFor(async () => JSON.stringify(await stored(h)) === '["DATE"]', 5000);

  // Un valore non ammesso scritto a mano nello storage viene scartato dalla configurazione.
  await h.sw.evaluate(() => chrome.storage.local.set({ keepTypes: ['DATE', 'FULLNAME', 'CF'] }));
  await waitFor(async () => JSON.stringify((await h.state()).config.keepTypes) === '["DATE"]', 8000);
  await page.reload();
  await page.waitForSelector('#keepTypes:not([hidden]) input[name="keepTypes"]');
  assert.deepEqual(await checkedTypes(page), ['DATE']);
});

test('Server edition: nessun gruppo «Dati da non mascherare», keepTypes null', { timeout: 90000 }, async (t) => {
  const h = await startHarness({ edition: 'server' });
  t.after(() => h.close());
  const page = await h.context.newPage();
  await page.goto(`chrome-extension://${h.extensionId}/src/options/options.html`);
  await page.waitForSelector('#images:not([hidden])');
  assert.equal(await page.$eval('#keepTypes', (e) => e.hidden), true);
  assert.equal((await h.state()).config.keepTypes, null);
});

/** Rizzo-PII finto che riconosce anche DATE e AMOUNT; registra exclude_tags e NON lo applica (si verifica il filtro dell'estensione). */
function rizzoWithDates(seen) {
  const RULES = [
    ['FULLNAME', /\bMario Rossi\b/g],
    ['DATE', /\b\d{2}\/\d{2}\/\d{4}\b/g],
    ['AMOUNT', /€ ?\d{1,3}(?:\.\d{3})*,\d{2}/g],
  ];
  return http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
      if (req.url === '/health') return send(200, { status: 'ok' });
      if (req.url !== '/analyze') return send(404, {});
      const j = JSON.parse(Buffer.concat(chunks).toString() || '{}');
      seen.push(j.exclude_tags);
      const s = String(j.text || '').trim();
      const found = [];
      for (const [label, rx] of RULES) {
        rx.lastIndex = 0;
        let m;
        while ((m = rx.exec(s)) !== null) found.push({ label, start: m.index, end: m.index + m[0].length });
      }
      found.sort((a, b) => a.start - b.start);
      const segs = [];
      let pos = 0;
      for (const f of found) {
        if (f.start < pos) continue;
        if (f.start > pos) segs.push({ t: s.slice(pos, f.start) });
        segs.push({ label: f.label, ph: `[${f.label}_1]`, t: s.slice(f.start, f.end) });
        pos = f.end;
      }
      if (pos < s.length) segs.push({ t: s.slice(pos) });
      send(200, { segments: segs });
    });
  });
}

test('Personal edition: con keepTypes DATE/AMOUNT data e importo restano in chiaro, il nome no', { timeout: 120000 }, async (t) => {
  const h = await startHarness({ edition: 'personal' });
  const seen = [];
  const rz = rizzoWithDates(seen);
  await new Promise((r) => rz.listen(0, '127.0.0.1', r));
  t.after(async () => { await h.close(); rz.close(); });
  const url = `http://127.0.0.1:${rz.address().port}`;
  await h.sw.evaluate((u) => chrome.storage.local.set({ rizzoUrl: u }), url);
  await waitFor(async () => { const st = await h.state(); return st && st.config.rizzoUrl === url && st.health.detector === 'ok'; }, 10000);

  const page = await h.context.newPage();
  await page.goto('https://claude.ai/new');
  await page.waitForSelector('pg-ui[data-pg-ui="status"]', { state: 'attached', timeout: 10000 });
  const tabId = await h.sw.evaluate(async () => (await chrome.tabs.query({ url: 'https://claude.ai/*' }))[0].id);
  await h.sw.evaluate((id) => globalThis.pgToggleForTab({ id }, 'toolbar'), tabId);
  await page.waitForFunction(() => {
    const e = document.querySelector('pg-ui[data-pg-ui="status"]');
    return e && e.getAttribute('data-pg-activation') === 'on';
  }, null, { timeout: 8000 });
  const prompts = () => h.apiRequests.filter((r) => COMPLETION.test(r.path)).map((r) => JSON.parse(r.body).prompt);

  // Predefinito: tutto mascherato.
  await page.click('.ProseMirror');
  await page.keyboard.type('Il 12/03/2024 Mario Rossi ha pagato € 1.250,00.');
  await page.keyboard.press('Enter');
  await waitFor(() => prompts().length === 1, 10000);
  assert.match(prompts()[0], /Il \[DATE_1\] \[FULLNAME_1\] ha pagato \[AMOUNT_1\]\.$/);

  // Con DATE e AMOUNT da non mascherare.
  await h.sw.evaluate(() => chrome.storage.local.set({ keepTypes: ['DATE', 'AMOUNT'] }));
  await waitFor(async () => JSON.stringify((await h.state()).config.keepTypes) === '["DATE","AMOUNT"]', 8000);
  await page.waitForFunction(() => {
    const r = document.querySelector('[data-is-streaming="false"] .font-claude-response');
    return Boolean(r);
  }, null, { timeout: 10000 });
  await page.click('.ProseMirror');
  await page.keyboard.type('Il 15/04/2024 Mario Rossi ha pagato € 300,00.');
  await page.keyboard.press('Enter');
  await waitFor(() => prompts().length === 2, 10000);
  const p = prompts()[1];
  assert.match(p, /Il 15\/04\/2024 \[FULLNAME_1\] ha pagato € 300,00\.$/);
  assert.doesNotMatch(p, /Mario Rossi/);
  assert.ok(seen.some((x) => Array.isArray(x) && x.join() === 'DATE,AMOUNT'), 'exclude_tags passato a Rizzo-PII');

  // Registro: solo il conteggio dei dati lasciati in chiaro.
  const log = await h.sw.evaluate(() => PG.local.readLog());
  const last = log.filter((e) => e.action === 'pseudonymize').pop();
  assert.equal(last.kept, 2);
  assert.doesNotMatch(JSON.stringify(log), /15\/04|300,00|Rossi/);
});
