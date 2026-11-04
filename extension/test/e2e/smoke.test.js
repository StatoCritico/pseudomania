// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Prova di fumo end-to-end dell'estensione sulla pagina che imita claude.ai.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { startHarness, waitFor } = require('./harness.js');

const CONV = '0f8fad5b-d9cb-469f-a165-70867728950e';
const COMPLETION = /\/chat_conversations\/[^/]+\/completion$/;

function completions(h) {
  return h.apiRequests.filter((r) => COMPLETION.test(r.path)).map((r) => JSON.parse(r.body));
}

async function typeAndSend(page, text, key) {
  await page.click('.ProseMirror');
  await page.keyboard.type(text);
  await page.keyboard.press(key || 'Enter');
}

test('flusso completo (Server edition)', { timeout: 120000 }, async (t) => {
  const h = await startHarness();
  t.after(() => h.close());
  const page = await h.context.newPage();
  if (process.env.PG_DEBUG) {
    page.on('console', (m) => console.log('[console]', m.type(), m.text()));
    page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  }
  await h.context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://claude.ai' });
  await page.goto('https://claude.ai/new');
  await page.waitForSelector('pg-ui[data-pg-ui="status"]', { state: 'attached', timeout: 10000 });

  await t.test('dettatura nascosta e microfono bloccato', async () => {
    assert.equal(await page.$eval('#mic', (e) => getComputedStyle(e).display), 'none');
    await page.evaluate(() => document.getElementById('mic').click());
    const blocked = await page.evaluate(() =>
      navigator.mediaDevices.getUserMedia({ audio: true }).then(() => false, (e) => e.name === 'NotAllowedError'));
    assert.equal(blocked, true);
  });

  await t.test('invio con Invio: testo pseudonimizzato + istruzione fissa, poi rebind', async () => {
    await typeAndSend(page, 'Gentile Mario Rossi, la contatto a mario.rossi@ente.it');
    await waitFor(() => completions(h).length === 1, 10000);
    const prompt = completions(h)[0].prompt;
    assert.ok(prompt.startsWith('I testi contengono segnaposto'), 'istruzione fissa in testa');
    assert.match(prompt, /Gentile \[FULLNAME_1\], la contatto a \[EMAIL_1\]/);
    assert.ok(!prompt.includes('Mario Rossi') && !prompt.includes('mario.rossi@'), 'nessun dato reale in uscita');
    assert.equal(new URL(page.url()).pathname, `/chat/${CONV}`);
    // Il server conserva solo voci cifrate; i «custodi» (chiave di custodia) le decifrano.
    const plain = await waitFor(async () => {
      const d = await h.mock('/dev/plain');
      return d[`conversation:${CONV}`] && d[`conversation:${CONV}`]['[FULLNAME_1]'] ? d : null;
    }, 5000);
    assert.equal(plain[`conversation:${CONV}`]['[FULLNAME_1]'], 'Mario Rossi');
    assert.ok(!Object.keys(plain).some((k) => k.includes('pending:')), 'scope pending ricollegato');
    const dict = await h.mock('/dev/dictionary');
    assert.ok(dict[`conversation:${CONV}`]['[FULLNAME_1]'].aadScope.id.startsWith('pending:'), 'AAD originale conservato dopo il rebind');
    const calls = (await h.mock('/dev/calls')).filter((c) => c.endpoint === 'pseudonymize');
    assert.equal(calls[0].kind, 'message');
    assert.ok(calls[0].scope.id.startsWith('pending:'));
  });

  await t.test('ripristino nella risposta in streaming e nel messaggio utente', async () => {
    await page.waitForFunction(() => document.querySelector('[data-is-streaming="false"] .font-claude-response'), null, { timeout: 10000 });
    await page.waitForFunction(
      () => document.querySelector('.font-claude-response').textContent.includes('Mario Rossi'), null, { timeout: 5000 });
    const resp = await page.$eval('.font-claude-response', (e) => e.textContent);
    assert.equal(resp, 'Risposta per Mario Rossi e mario.rossi@ente.it. Contatto ignoto: [EMAIL_99].');
    const user = await page.$eval('[data-testid="user-message"] p', (e) => e.textContent);
    assert.ok(user.includes('Gentile Mario Rossi, la contatto a mario.rossi@ente.it'));
    assert.ok(user.includes('[FULLNAME_n] o [CF_n]'), 'l\'istruzione fissa resta invariata');
    const hl = await page.evaluate(() => ({ r: CSS.highlights.get('pg-restored').size, u: CSS.highlights.get('pg-unknown').size }));
    assert.ok(hl.r >= 2, 'valori ripristinati evidenziati');
    assert.ok(hl.u >= 1, 'segnaposto sconosciuto evidenziato');
  });

  await t.test('evento response_received con testo pseudonimizzato e segnaposto sconosciuti', async () => {
    const ev = await waitFor(async () => (await h.mock('/dev/events')).find((e) => e.event === 'response_received'), 8000);
    assert.equal(ev.details.textPseudonymized, 'Risposta per [FULLNAME_1] e [EMAIL_1]. Contatto ignoto: [EMAIL_99].');
    assert.deepEqual(ev.details.unknownTags, ['[EMAIL_99]']);
    assert.ok(ev.traceId);
    assert.deepEqual(ev.scope, { type: 'conversation', id: CONV });
  });

  await t.test('contrassegno «dati protetti» sul messaggio inviato', async () => {
    await page.waitForSelector('[data-testid="user-message"] pg-ui[data-pg-ui="badge"]', { state: 'attached', timeout: 5000 });
  });

  await t.test('il pulsante Copia del sito copia il testo ripristinato', async () => {
    await page.click('.copy-btn');
    const clip = await waitFor(async () => {
      const c = await page.evaluate(() => navigator.clipboard.readText());
      return c.includes('Mario Rossi') ? c : null;
    }, 3000);
    assert.equal(clip, 'Risposta per Mario Rossi e mario.rossi@ente.it. Contatto ignoto: [EMAIL_99].');
  });

  await t.test('download di un file generato: ripristino tramite /v1/reidentify/file', async () => {
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), page.click('.dl-btn')]);
    const content = fs.readFileSync(await dl.path(), 'utf8');
    assert.equal(dl.suggestedFilename(), 'report.md');
    assert.ok(content.includes('Mario Rossi') && content.includes('mario.rossi@ente.it'), content);
  });

  await t.test('allegato da selettore di file: contenuto pseudonimizzato prima del sito', async () => {
    await page.setInputFiles('#file', { name: 'nota.txt', mimeType: 'text/plain', buffer: Buffer.from('Pratica di Luigi Verdi, tel 333 123 4567') });
    await page.waitForSelector('.chip', { timeout: 10000 });
    const content = await page.$eval('.chip', (e) => e.dataset.content);
    assert.equal(content, 'Pratica di [FULLNAME_2], tel [TELEPHONENUM_1]');
    const up = h.apiRequests.find((r) => r.path.endsWith('/upload'));
    assert.ok(up, 'caricamento multipart avvenuto');
    const raw = up.buffer.toString('utf8');
    assert.ok(raw.includes('[FULLNAME_2]') && !raw.includes('Luigi Verdi'), 'il file caricato è pseudonimizzato');
    const calls = await h.mock('/dev/calls');
    assert.ok(calls.some((c) => c.endpoint === 'pseudonymize/file' && c.kind === 'attachment'));
    // invio con il solo allegato già pseudonimizzato: nessun nuovo passaggio dal server per il file
    await page.click('#send');
    await waitFor(() => completions(h).length === 2, 8000);
    const body = completions(h)[1];
    assert.equal(body.attachments[0].extracted_content, 'Pratica di [FULLNAME_2], tel [TELEPHONENUM_1]');
  });

  await t.test('rete di sicurezza: richiesta che salta lo strato DOM viene pseudonimizzata', async () => {
    const before = completions(h).length;
    await page.evaluate(() => document.getElementById('rawsend').click());
    await waitFor(() => completions(h).length === before + 1, 8000);
    const p = completions(h)[before].prompt;
    assert.ok(!p.includes('Paola Neri') && !p.includes('paola.neri@'), p);
    assert.match(p, /\[FULLNAME_3\], \[EMAIL_2\]/);
  });

  await t.test('modifica e reinvio di un messaggio', async () => {
    const before = completions(h).length;
    await page.click('.edit-btn');
    await page.fill('form textarea', 'Correggo: Anna Gialli');
    await page.click('form button[type="submit"]');
    await waitFor(() => completions(h).length === before + 1, 8000);
    assert.equal(completions(h)[before].prompt, 'Correggo: [FULLNAME_4]');
    const calls = await h.mock('/dev/calls');
    assert.ok(calls.some((c) => c.kind === 'edit'));
  });

  await t.test('categoria particolare: invio bloccato, nessuna richiesta a Claude', async () => {
    const before = completions(h).length;
    await typeAndSend(page, 'Il dipendente Marco Bruni è sieropositivo');
    const ev = await waitFor(async () => (await h.mock('/dev/events')).find((e) => e.event === 'blocked'), 5000);
    assert.ok(ev);
    await page.waitForTimeout(500);
    assert.equal(completions(h).length, before);
    const left = await page.$eval('.ProseMirror', (e) => e.innerText);
    assert.ok(left.includes('sieropositivo'), 'il testo resta nella casella');
    await page.evaluate(() => (document.querySelector('.ProseMirror').innerHTML = '<p><br></p>'));
  });

  await t.test('anteprima con Ctrl+Maiusc+Invio: annullando non parte nulla', async () => {
    const before = completions(h).length;
    await typeAndSend(page, 'Anteprima per Giulia Bianchi', 'Control+Shift+Enter');
    await page.waitForSelector('pg-ui[data-pg-ui="modal"]', { state: 'attached', timeout: 5000 });
    await page.keyboard.press('Escape');
    await page.waitForSelector('pg-ui[data-pg-ui="modal"]', { state: 'detached', timeout: 5000 });
    await page.waitForTimeout(300);
    assert.equal(completions(h).length, before);
    await page.evaluate(() => (document.querySelector('.ProseMirror').innerHTML = '<p><br></p>'));
  });

  await t.test('pannello di ispezione: originale/inviato, risposte grezze, segnalazione, cancellazione', async () => {
    const tabId = await h.sw.evaluate(async () => (await chrome.tabs.query({ url: 'https://claude.ai/*' }))[0].id);
    await page.evaluate(() => {}); // il contrassegno apre il pannello; qui si apre la pagina in una scheda
    const panel = await h.context.newPage();
    panel.on('dialog', (d) => d.accept());
    await panel.goto(`chrome-extension://${h.extensionId}/src/sidepanel/sidepanel.html?tabId=${tabId}`);
    await panel.waitForSelector('#detail:not([hidden])', { timeout: 5000 });
    await panel.selectOption('#records', { index: 0 });
    assert.ok((await panel.textContent('#orig')).includes('Mario Rossi'));
    assert.ok((await panel.textContent('#sent')).includes('[FULLNAME_1]'));
    await panel.check('#showRaw');
    await panel.waitForSelector('#raw .txt', { timeout: 5000 });
    assert.ok((await panel.textContent('#raw')).includes('[FULLNAME_1]'));
    await panel.click('#btnFN');
    await panel.fill('#note', 'Non ha mascherato il cognome di Mario Rossi');
    await panel.click('#btnSend');
    const ev = await waitFor(async () => (await h.mock('/dev/events')).find((e) => e.event === 'report_false_negative'), 5000);
    assert.equal(ev.details.note, 'Non ha mascherato il cognome di [FULLNAME_1]');
    assert.ok((await h.mock('/dev/events')).some((e) => e.event === 'inspection_opened'));
    // ultimo invio bloccato: segnalazione «blocco errato» senza testo e senza messaggio inviato
    await panel.waitForSelector('#blockBox:not([hidden])', { timeout: 5000 });
    await panel.click('#btnBlockFP');
    const fp = await waitFor(async () => (await h.mock('/dev/events')).find((e) => e.event === 'report_false_positive' && e.details.kind === 'blocked'), 5000);
    assert.deepEqual(Object.keys(fp.details).sort(), ['category', 'kind']);
    assert.ok(fp.traceId, 'traceId del blocco: il server ricava la categoria dal proprio registro');
    await panel.click('#btnDelete');
    await waitFor(async () => !(await h.mock('/dev/dictionary'))[`conversation:${CONV}`], 5000);
  });

});

test('fail-closed: server non disponibile → invio bloccato', { timeout: 60000 }, async (t) => {
  const h = await startHarness();
  t.after(() => h.close());
  const page = await h.context.newPage();
  await page.goto('https://claude.ai/new');
  await page.waitForSelector('pg-ui[data-pg-ui="status"]', { state: 'attached', timeout: 10000 });
  await h.mock('/dev/detector', 'POST', { down: true });
  await typeAndSend(page, 'Pratica di Mario Rossi');
  const ev = await waitFor(async () => (await h.mock('/dev/events')).find((e) => e.event === 'server_unreachable'), 5000);
  assert.ok(ev);
  await page.waitForTimeout(500);
  assert.equal(completions(h).length, 0, 'nessuna richiesta a Claude');
  assert.equal(await page.$('pg-ui[data-pg-ui="modal"]'), null, 'nessuna richiesta di conferma in fail-closed');
  // anche la rete di sicurezza blocca
  await page.evaluate(() => document.getElementById('rawsend').click());
  await page.waitForTimeout(800);
  assert.equal(completions(h).length, 0);
});

test('progetto: istruzioni, conoscenze, trascinamento e chat nello scope del progetto', { timeout: 60000 }, async (t) => {
  const PROJ = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
  const h = await startHarness();
  t.after(() => h.close());
  const page = await h.context.newPage();
  await page.goto(`https://claude.ai/project/${PROJ}`);
  await page.waitForSelector('pg-ui[data-pg-ui="status"]', { state: 'attached', timeout: 10000 });

  await t.test('istruzioni di progetto: istruzione fissa aggiunta e testo pseudonimizzato', async () => {
    await page.click('#editInstr');
    await page.fill('#instr', "Assisti l'ufficio di Mario Rossi");
    await page.click('#saveInstr');
    const req = await waitFor(() => h.apiRequests.find((r) => r.method === 'PUT' && r.path.endsWith(`/projects/${PROJ}`)), 5000);
    const body = JSON.parse(req.body);
    assert.ok(body.prompt_template.startsWith('I testi contengono segnaposto'));
    assert.ok(body.prompt_template.endsWith("Assisti l'ufficio di [FULLNAME_1]"));
    const calls = (await h.mock('/dev/calls')).filter((c) => c.endpoint === 'pseudonymize');
    assert.deepEqual(calls.map((c) => [c.kind, c.scope.type, c.scope.id]), [['project_instructions', 'project', PROJ]]);
  });

  await t.test('conoscenze di progetto caricate pseudonimizzate (kind project_knowledge)', async () => {
    await page.setInputFiles('#kfile', { name: 'contratto.txt', mimeType: 'text/plain', buffer: Buffer.from('Contraente: Luigi Verdi') });
    await page.waitForSelector('#docs li', { timeout: 10000 });
    assert.equal(await page.$eval('#docs li', (e) => e.dataset.content), 'Contraente: [FULLNAME_2]');
    const up = h.apiRequests.find((r) => r.path.endsWith(`/projects/${PROJ}/upload`));
    assert.ok(up && !up.buffer.toString('utf8').includes('Luigi Verdi'));
    const calls = await h.mock('/dev/calls');
    assert.ok(calls.some((c) => c.kind === 'project_knowledge' && c.scope.id === PROJ));
  });

  await t.test('file trascinato sulla casella: pseudonimizzato come allegato', async () => {
    await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.items.add(new File(['Telefono di Anna Gialli: 333 765 4321'], 'tel.txt', { type: 'text/plain' }));
      document.getElementById('fs').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    });
    await page.waitForSelector('.chip.dropped', { timeout: 10000 });
    assert.equal(await page.$eval('.chip.dropped', (e) => e.dataset.content), 'Telefono di [FULLNAME_3]: [TELEPHONENUM_1]');
    const calls = await h.mock('/dev/calls');
    assert.ok(calls.some((c) => c.kind === 'attachment' && c.scope.id === PROJ));
  });

  await t.test('chat avviata dal progetto: resta nello scope del progetto', async () => {
    await page.click('.ProseMirror');
    await page.keyboard.type('Scrivi a Mario Rossi');
    await page.keyboard.press('Enter');
    await waitFor(() => completions(h).length === 1, 8000);
    const body = completions(h)[0];
    assert.match(body.prompt, /Scrivi a \[FULLNAME_1\]$/);
    assert.equal(body.attachments[0].extracted_content, 'Telefono di [FULLNAME_3]: [TELEPHONENUM_1]');
    await page.waitForFunction(() => document.querySelector('.font-claude-response') &&
      document.querySelector('.font-claude-response').textContent.includes('Mario Rossi'), null, { timeout: 8000 });
    const dict = await h.mock('/dev/dictionary');
    assert.deepEqual(Object.keys(dict), [`project:${PROJ}`]);
    const ev = await waitFor(async () => (await h.mock('/dev/events')).find((e) => e.event === 'response_received'), 8000);
    assert.deepEqual(ev.scope, { type: 'project', id: PROJ });
  });
});

test('rebind rifiutato (409) e link al codice sorgente', { timeout: 60000 }, async (t) => {
  const h = await startHarness();
  t.after(() => h.close());
  // La conversazione di destinazione ha già [FULLNAME_1] con un altro valore → conflitto.
  await fetch(h.serverUrl + '/v1/pseudonymize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer dev-token' },
    body: JSON.stringify({ scope: { type: 'conversation', id: CONV }, site: 'claude.ai', kind: 'message', text: 'Mario Bianchi' }),
  });
  const page = await h.context.newPage();
  await page.goto('https://claude.ai/new');
  await page.waitForSelector('pg-ui[data-pg-ui="status"]', { state: 'attached', timeout: 10000 });
  await typeAndSend(page, 'Gentile Mario Rossi');
  const ev = await waitFor(async () => (await h.mock('/dev/events')).find((e) => e.event === 'page_unrecognized' && e.details.reason === 'scope_rebind_conflict'), 8000);
  assert.ok(ev);
  await page.waitForFunction(() => document.querySelector('[data-is-streaming="false"] .font-claude-response'), null, { timeout: 8000 });
  await page.waitForFunction(() => document.querySelector('.font-claude-response').textContent.includes('Mario'), null, { timeout: 5000 });
  assert.ok((await page.$eval('.font-claude-response', (e) => e.textContent)).includes('Mario Rossi'), 'resta il dizionario pending');
  const resp = await waitFor(async () => (await h.mock('/dev/events')).find((e) => e.event === 'response_received'), 8000);
  assert.ok(resp.scope.id.startsWith('pending:'));
  const dict = await h.mock('/dev/dictionary');
  assert.equal(dict[`conversation:${CONV}`]['[FULLNAME_1]'].hasCiphertext, false, 'la destinazione non è stata toccata');
  assert.ok(Object.keys(dict).some((k) => k.startsWith('conversation:pending:')));

  const opt = await h.context.newPage();
  await opt.goto(`chrome-extension://${h.extensionId}/src/options/options.html`);
  await opt.waitForFunction(() => document.getElementById('aboutSrc').getAttribute('href'), null, { timeout: 5000 });
  assert.equal(await opt.getAttribute('#aboutSrc', 'href'), 'https://example.org/pseudomania');
});
