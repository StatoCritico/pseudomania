// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Enterprise edition: cifratura lato client del dizionario (DECISIONI.md) end-to-end:
// escrow, voci cifrate, rotazione forzata, cambio PC (voci non ripristinabili), recupero tramite
// chiave del dispositivo, conferma annuale dei progetti.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { startHarness, waitFor } = require('./harness.js');

const CONV = '0f8fad5b-d9cb-469f-a165-70867728950e';
const PROJ = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const SCOPE = { type: 'conversation', id: CONV };

async function typeAndSend(page, text) {
  await page.click('.ProseMirror');
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
}

test('cifratura lato client: escrow, rotazione, cambio PC e recupero', { timeout: 120000 }, async (t) => {
  const h = await startHarness();
  t.after(() => h.close());
  const ext = await h.context.newPage();
  await ext.goto(`chrome-extension://${h.extensionId}/src/popup/popup.html`);
  const msg = (m) => ext.evaluate((x) => chrome.runtime.sendMessage(x), m);
  const firstKey = (await h.state()).keys.keyId;

  await t.test('K_u generata al primo avvio con escrow RSA-OAEP-4096', async () => {
    assert.match(firstKey, /^[0-9a-f-]{36}$/);
    assert.deepEqual(await h.mock('/dev/escrows'), [firstKey]);
    // la chiave in IndexedDB non è estraibile
    const extractable = await ext.evaluate(() => new Promise((res) => {
      const r = indexedDB.open('pseudomania');
      r.onsuccess = () => {
        const tx = r.result.transaction('keys').objectStore('keys').getAll();
        tx.onsuccess = () => res(tx.result.map((k) => k.key.extractable));
      };
    }));
    assert.deepEqual(extractable, [false]);
  });

  const page = await h.context.newPage();
  await page.goto('https://claude.ai/new');
  await page.waitForSelector('pg-ui[data-pg-ui="status"]', { state: 'attached', timeout: 10000 });

  await t.test('newEntries cifrate nel browser e caricate; il server non ha valori in chiaro', async () => {
    await typeAndSend(page, 'Gentile Mario Rossi');
    const plain = await waitFor(async () => {
      const d = await h.mock('/dev/plain');
      return d[`conversation:${CONV}`] && d[`conversation:${CONV}`]['[FULLNAME_1]'] ? d : null;
    }, 8000);
    assert.equal(plain[`conversation:${CONV}`]['[FULLNAME_1]'], 'Mario Rossi');
    const dict = await h.mock('/dev/dictionary');
    assert.equal(dict[`conversation:${CONV}`]['[FULLNAME_1]'].keyId, firstKey);
    const r = await msg({ type: 'pg:dictionary', scope: SCOPE, force: true });
    assert.equal(r.data.entries['[FULLNAME_1]'], 'Mario Rossi');
    assert.deepEqual(r.data.unrecoverable, []);
  });

  let rotatedKey;
  await t.test('rotazione forzata (rotateKey): nuova chiave, voci ricifrate, escrow vecchio distrutto', async () => {
    await h.mock('/dev/rotate', 'POST');
    await msg({ type: 'pg:refreshState' });
    rotatedKey = await waitFor(async () => {
      const k = (await h.state()).keys.keyId;
      return k && k !== firstKey ? k : null;
    }, 15000);
    const escrows = await waitFor(async () => {
      const e = await h.mock('/dev/escrows');
      return e.length === 1 && e[0] === rotatedKey ? e : null;
    }, 8000);
    assert.deepEqual(escrows, [rotatedKey]);
    const dict = await h.mock('/dev/dictionary');
    assert.equal(dict[`conversation:${CONV}`]['[FULLNAME_1]'].keyId, rotatedKey);
    assert.equal(dict[`conversation:${CONV}`]['[FULLNAME_1]'].aadScope, null, 'AAD riportato allo scope attuale');
    assert.equal((await h.mock('/dev/plain'))[`conversation:${CONV}`]['[FULLNAME_1]'], 'Mario Rossi');
    const r = await msg({ type: 'pg:dictionary', scope: SCOPE, force: true });
    assert.equal(r.data.entries['[FULLNAME_1]'], 'Mario Rossi');
  });

  await t.test('cambio PC: chiave sconosciuta → segnaposto «non ripristinabile»', async () => {
    await ext.evaluate(() => Promise.all([
      chrome.storage.session.clear(),
      new Promise((res) => {
        const r = indexedDB.open('pseudomania');
        r.onsuccess = () => {
          const tx = r.result.transaction('keys', 'readwrite');
          tx.objectStore('keys').clear();
          tx.oncomplete = res;
        };
      }),
    ]));
    await msg({ type: 'pg:refreshState' }); // il «nuovo PC» genera una nuova chiave
    const newKey = await waitFor(async () => {
      const k = (await h.state()).keys.keyId;
      return k && k !== rotatedKey ? k : null;
    }, 15000);
    assert.ok(newKey);
    const r = await msg({ type: 'pg:dictionary', scope: SCOPE, force: true });
    assert.deepEqual(r.data.unrecoverable, ['[FULLNAME_1]']);
    assert.equal(r.data.entries['[FULLNAME_1]'], undefined);
    // nella pagina il segnaposto resta visibile ed evidenziato come non ripristinabile
    const chat = await h.context.newPage();
    await chat.goto(`https://claude.ai/chat/${CONV}`);
    await chat.waitForSelector('pg-ui[data-pg-ui="status"]', { state: 'attached', timeout: 10000 });
    await chat.evaluate(() => {
      const d = document.createElement('div');
      d.setAttribute('data-is-streaming', 'false');
      d.innerHTML = '<div class="font-claude-response"><p id="old">Vedi la pratica di [FULLNAME_1].</p></div>';
      document.getElementById('transcript').appendChild(d);
    });
    await chat.waitForFunction(() => CSS.highlights.get('pg-unrecoverable') && CSS.highlights.get('pg-unrecoverable').size === 1, null, { timeout: 5000 });
    assert.equal(await chat.$eval('#old', (e) => e.textContent), 'Vedi la pratica di [FULLNAME_1].');
    await chat.close();
  });

  await t.test('recupero: chiave del dispositivo, ricifratura dei custodi, importazione come legacy', async () => {
    const prep = await msg({ type: 'pg:prepareRecovery' });
    assert.ok(prep.ok, JSON.stringify(prep));
    assert.match(prep.data.deviceKeyId, /^[0-9a-f-]{36}$/);
    // i custodi (simulati dal server di prova) ricifrano la chiave vecchia per questo dispositivo
    await h.mock('/dev/recover', 'POST', { deviceKeyId: prep.data.deviceKeyId, keyId: rotatedKey });
    const imp = await msg({ type: 'pg:importRecovered' });
    assert.equal(imp.data.imported, 1);
    const r = await msg({ type: 'pg:dictionary', scope: SCOPE, force: true });
    assert.equal(r.data.entries['[FULLNAME_1]'], 'Mario Rossi');
    assert.deepEqual(r.data.unrecoverable, []);
    // le voci recuperate sono passate alla chiave attiva (che ha l'escrow)
    const active = (await h.state()).keys.keyId || (await msg({ type: 'pg:keyStatus' })).data.keyId;
    const dict = await h.mock('/dev/dictionary');
    assert.equal(dict[`conversation:${CONV}`]['[FULLNAME_1]'].keyId, active);
    assert.ok(!(await h.mock('/dev/escrows')).includes(rotatedKey), 'escrow della chiave recuperata distrutto dopo la ricifratura');
  });
});

test('conferma annuale del progetto dal pannello laterale', { timeout: 60000 }, async (t) => {
  const h = await startHarness();
  t.after(() => h.close());
  const page = await h.context.newPage();
  await page.goto(`https://claude.ai/project/${PROJ}`);
  await page.waitForSelector('pg-ui[data-pg-ui="status"]', { state: 'attached', timeout: 10000 });
  await typeAndSend(page, 'Pratica di Luigi Verdi');
  await waitFor(async () => {
    const d = await h.mock('/dev/plain');
    return d[`project:${PROJ}`] && d[`project:${PROJ}`]['[FULLNAME_1]'];
  }, 8000);
  const tabId = await h.sw.evaluate(async () => (await chrome.tabs.query({ url: 'https://claude.ai/*' }))[0].id);
  const panel = await h.context.newPage();
  await panel.goto(`chrome-extension://${h.extensionId}/src/sidepanel/sidepanel.html?tabId=${tabId}`);
  await panel.waitForSelector('#confirmBox:not([hidden])', { timeout: 8000 });
  assert.match(await panel.textContent('#confirmText'), /scade il/);
  assert.equal(await panel.isVisible('#recoveryBox'), true);
  await panel.click('#btnConfirm');
  await waitFor(async () => (await h.mock('/dev/calls')).some((c) => c.endpoint === 'confirm' && c.scope.id === PROJ), 5000);
});
