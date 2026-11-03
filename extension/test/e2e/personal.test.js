// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Personal edition end-to-end: estensione autonoma + Rizzo-PII (finto), nessun server Pseudomania.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { startHarness, waitFor } = require('./harness.js');
const { writeZip, readZip } = require('../../src/shared/zip.js');

const CONV = '0f8fad5b-d9cb-469f-a165-70867728950e';
const COMPLETION = /\/chat_conversations\/[^/]+\/completion$/;
const enc = (s) => new TextEncoder().encode(s);

function completions(h) {
  return h.apiRequests.filter((r) => COMPLETION.test(r.path)).map((r) => JSON.parse(r.body));
}

async function typeAndSend(page, text) {
  await page.click('.ProseMirror');
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
}

/** Estrae il file e il suo nome da un corpo multipart (un solo file). */
function multipartFile(buf) {
  const s = buf.toString('latin1');
  const name = /filename="([^"]*)"/.exec(s)[1];
  const start = s.indexOf('\r\n\r\n', s.indexOf('filename=')) + 4;
  const end = s.lastIndexOf('\r\n--');
  return { name, data: buf.subarray(start, end) };
}

async function makeDocx() {
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  return Buffer.from(await writeZip([
    { name: '[Content_Types].xml', content: enc('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>') },
    { name: 'word/document.xml', content: enc(`<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="${W}"><w:body><w:p><w:r><w:t>Gentile Lu</w:t></w:r><w:r><w:t>igi Verdi, a presto.</w:t></w:r></w:p></w:body></w:document>`) },
  ]));
}

test('Personal edition: flusso completo senza server', { timeout: 120000 }, async (t) => {
  const h = await startHarness({ edition: 'personal' });
  t.after(() => h.close());
  const ext = await h.context.newPage();
  await ext.goto(`chrome-extension://${h.extensionId}/src/popup/popup.html`);
  const msg = (m) => ext.evaluate((x) => chrome.runtime.sendMessage(x), m);
  const page = await h.context.newPage();
  await page.goto('https://claude.ai/new');
  await page.waitForSelector('pg-ui[data-pg-ui="status"]', { state: 'attached', timeout: 10000 });

  await t.test('stato: Personal edition, Rizzo-PII raggiungibile, nessun server', async () => {
    const st = await h.state();
    assert.equal(st.config.edition, 'personal');
    assert.equal(st.config.serverUrl, '');
    assert.equal(st.health.detector, 'ok');
    assert.match(await ext.textContent('#mode'), /Personal edition/);
    assert.equal(await h.sw.evaluate(() => chrome.action.getPopup({})), '', 'nessun popup: il clic attiva/disattiva');
  });

  await t.test('messaggio pseudonimizzato da Rizzo-PII con tag stabili locali e ripristinato', async () => {
    await typeAndSend(page, 'Gentile Mario Rossi, scrivo a mario.rossi@ente.it');
    await waitFor(() => completions(h).length === 1, 10000);
    const prompt = completions(h)[0].prompt;
    assert.match(prompt, /Gentile \[FULLNAME_1\], scrivo a \[EMAIL_1\]$/);
    assert.ok(prompt.startsWith('I testi contengono segnaposto'));
    await page.waitForFunction(() => {
      const r = document.querySelector('[data-is-streaming="false"] .font-claude-response');
      return r && r.textContent.includes('Mario Rossi');
    }, null, { timeout: 10000 });
    assert.equal(await page.$eval('.font-claude-response', (e) => e.textContent), 'Risposta per Mario Rossi e mario.rossi@ente.it. Contatto ignoto: [EMAIL_99].');
  });

  await t.test('dizionario in IndexedDB cifrato, ricollegato alla conversazione; registro senza testi', async () => {
    const recs = await waitFor(async () => {
      const r = await ext.evaluate(() => new Promise((res) => {
        const o = indexedDB.open('pseudomania');
        o.onsuccess = () => {
          const q = o.result.transaction('pdict').objectStore('pdict').getAll();
          q.onsuccess = () => res(q.result);
        };
      }));
      return r.some((x) => x.scopeKey === `conversation:${CONV}`) ? r : null;
    }, 5000);
    assert.ok(!recs.some((x) => x.scopeKey.includes('pending:')), 'scope pending ricollegato');
    const ser = JSON.stringify(recs);
    assert.ok(!ser.includes('Mario') && !ser.includes('mario.rossi'), 'nessun valore in chiaro su disco');
    const d = await msg({ type: 'pg:dictionary', scope: { type: 'conversation', id: CONV }, force: true });
    assert.equal(d.data.entries['[FULLNAME_1]'], 'Mario Rossi');
    const log = await waitFor(async () => {
      const l = await msg({ type: 'pg:localLog' });
      return l.data.some((e) => e.event === 'response_received') ? l.data : null;
    }, 8000);
    assert.ok(log.some((e) => e.action === 'pseudonymize' && e.counts && e.counts.FULLNAME === 1));
    const rr = log.find((e) => e.event === 'response_received');
    assert.ok(rr.details.textSha256 && !('textPseudonymized' in rr.details));
    assert.ok(!JSON.stringify(log).includes('Mario'));
    const plog = await ext.evaluate(() => new Promise((res) => {
      const o = indexedDB.open('pseudomania');
      o.onsuccess = () => {
        const q = o.result.transaction('plog').objectStore('plog').getAll();
        q.onsuccess = () => res(JSON.stringify(q.result));
      };
    }));
    assert.ok(!plog.includes('pseudonymize'), 'registro cifrato su disco');
  });

  await t.test('allegato .txt pseudonimizzato localmente', async () => {
    await page.setInputFiles('#file', { name: 'nota.txt', mimeType: 'text/plain', buffer: Buffer.from('Pratica di Luigi Verdi, tel 333 123 4567') });
    await page.waitForSelector('.chip', { timeout: 10000 });
    assert.equal(await page.$eval('.chip', (e) => e.dataset.content), 'Pratica di [FULLNAME_2], tel [TELEPHONENUM_1]');
  });

  await t.test('nome del file pseudonimizzato (come nel server)', async () => {
    const before = h.apiRequests.filter((r) => r.path.endsWith('/upload')).length;
    await page.setInputFiles('#file', { name: 'Nota_Mario_Rossi.txt', mimeType: 'text/plain', buffer: Buffer.from('nessun dato') });
    const up = await waitFor(() => {
      const u = h.apiRequests.filter((r) => r.path.endsWith('/upload'));
      return u.length > before ? u[u.length - 1] : null;
    }, 10000);
    // ciò che arriva a claude.ai ha il segnaposto; nella pagina il nome viene poi ripristinato
    assert.equal(multipartFile(up.buffer).name, 'Nota_[FULLNAME_1].txt');
    await page.waitForFunction(() => [...document.querySelectorAll('.chip')].some((c) => c.textContent === 'Nota_Mario Rossi.txt'), null, { timeout: 5000 });
  });

  await t.test('allegato DOCX elaborato in JavaScript (anche il nome del file)', async () => {
    const before = h.apiRequests.filter((r) => r.path.endsWith('/upload')).length;
    await page.setInputFiles('#file', { name: 'Lettera_Luigi_Verdi.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: await makeDocx() });
    const up = await waitFor(() => {
      const u = h.apiRequests.filter((r) => r.path.endsWith('/upload'));
      return u.length > before ? u[u.length - 1] : null;
    }, 10000);
    const f = multipartFile(up.buffer);
    assert.equal(f.name, 'Lettera_[FULLNAME_2].docx');
    const z = readZip(new Uint8Array(f.data));
    const doc = new TextDecoder().decode(await z.entries.find((e) => e.name === 'word/document.xml').data());
    assert.ok(doc.includes('<w:t>Gentile [FULLNAME_2]</w:t>'), doc);
    assert.ok(!doc.includes('Verdi'));
  });

  await t.test('PDF inviato come testo pseudonimizzato (.txt)', async () => {
    const pdf = Buffer.from('%PDF-1.4\n%TEXT: Contratto di Anna Gialli\n%%EOF');
    await page.setInputFiles('#file', { name: 'contratto.pdf', mimeType: 'application/pdf', buffer: pdf });
    await page.waitForFunction(() => [...document.querySelectorAll('.chip')].some((c) => c.textContent === 'contratto.txt'), null, { timeout: 10000 });
    const content = await page.$$eval('.chip', (cs) => cs.find((c) => c.textContent === 'contratto.txt').dataset.content);
    assert.equal(content, 'Contratto di [FULLNAME_3]');
  });

  await t.test('categoria particolare bloccata con le regole incluse nell\'estensione', async () => {
    const before = completions(h).length;
    await page.evaluate(() => (document.getElementById('chips').textContent = ''));
    await typeAndSend(page, 'Il collega è in malattia da lunedì');
    await page.waitForTimeout(800);
    assert.equal(completions(h).length, before);
    const log = (await msg({ type: 'pg:localLog' })).data;
    assert.ok(log.some((e) => e.blocked && e.category === 'salute'));
    await page.evaluate(() => (document.querySelector('.ProseMirror').innerHTML = '<p><br></p>'));
    // «Segnala blocco errato» dal pannello laterale: evento con la categoria, senza testo
    const tabId = await h.sw.evaluate(async () => (await chrome.tabs.query({ url: 'https://claude.ai/*' }))[0].id);
    const panel = await h.context.newPage();
    await panel.goto(`chrome-extension://${h.extensionId}/src/sidepanel/sidepanel.html?tabId=${tabId}`);
    await panel.waitForSelector('#blockBox:not([hidden])', { timeout: 5000 });
    assert.match(await panel.textContent('#blockText'), /salute/);
    await panel.click('#btnBlockFP');
    const fp = await waitFor(async () => (await msg({ type: 'pg:localLog' })).data.find((e) => e.event === 'report_false_positive'), 5000);
    assert.deepEqual(fp.details, { kind: 'blocked', category: 'salute' });
    await panel.close();
  });

  await t.test('Rizzo-PII spento: avviso e richiesta di conferma (Annulla = nessun invio)', async () => {
    await new Promise((r) => h.rizzo.close(r));
    await page.waitForTimeout(300);
    const before = completions(h).length;
    await typeAndSend(page, 'Scrivo a paola.neri@ente.it');
    await page.waitForSelector('pg-ui[data-pg-ui="modal"]', { state: 'attached', timeout: 8000 });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    assert.equal(completions(h).length, before);
  });
});

test('Personal edition: Rizzo-PII che rifiuta CORS viene riconosciuto e segnalato', { timeout: 60000 }, async (t) => {
  // 127.0.0.2 non rientra nei permessi dell'estensione: Chrome applica CORS e il Rizzo-PII
  // (che non invia intestazioni CORS) risponde solo alle richieste «opache».
  const h = await startHarness({ edition: 'personal', rizzoHost: '127.0.0.2', waitReady: false });
  t.after(() => h.close());
  const ext = await h.context.newPage();
  await ext.goto(`chrome-extension://${h.extensionId}/src/popup/popup.html`);
  await ext.evaluate(() => chrome.runtime.sendMessage({ type: 'pg:refreshState' }));
  const st = await waitFor(async () => {
    const s = await h.state();
    return s && s.config.rizzoUrl === h.rizzoUrl && s.health.detector === 'cors' ? s : null;
  }, 15000);
  assert.equal(st.health.ok, false);
  await ext.reload();
  await ext.waitForFunction(() => document.getElementById('server').textContent.includes('CORS'), null, { timeout: 5000 });
  const r = await ext.evaluate((u) => chrome.runtime.sendMessage({ type: 'pg:testRizzo', rizzoUrl: u }), h.rizzoUrl);
  assert.equal(r.data.state, 'cors');
});
