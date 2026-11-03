// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Ambiente end-to-end: Chromium con l'estensione caricata (headless "new"), claude.ai servito dalla
// pagina di prova dev/fixture/claude-like.html tramite context.route.
//  - Enterprise edition: server di prova (dev/mock-server) + pgDevManaged con devStaticToken.
//  - Personal edition: Rizzo-PII finto (dev/mock-rizzo), nessun server.
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { chromium } = require('playwright');
const { createServer } = require('../../dev/mock-server/server.js');
const { createRizzo } = require('../../dev/mock-rizzo/server.js');

const EXT = path.join(__dirname, '..', '..');
const FIXTURE = fs.readFileSync(path.join(EXT, 'dev', 'fixture', 'claude-like.html'), 'utf8');

/**
 * @param {{edition?:'enterprise'|'personal', devManaged?:object, rizzoHost?:string, waitReady?:boolean}} [opts]
 */
async function startHarness(opts) {
  opts = opts || {};
  const edition = opts.edition || 'enterprise';
  let server = null;
  let serverUrl = null;
  let rizzo = null;
  let rizzoUrl = null;
  if (edition === 'enterprise') {
    server = createServer({ quiet: true });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    serverUrl = `http://127.0.0.1:${server.address().port}`;
    // Lo stato del server di prova è globale al modulo: si riparte puliti a ogni avvio.
    await fetch(serverUrl + '/dev/reset', { method: 'POST' });
  } else {
    rizzo = createRizzo();
    const host = opts.rizzoHost || '127.0.0.1';
    await new Promise((r) => rizzo.listen(0, host, r));
    rizzoUrl = `http://${host}:${rizzo.address().port}`;
  }

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-e2e-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: ['--headless=new', `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
    acceptDownloads: true,
  });

  const apiRequests = [];
  await context.route('https://claude.ai/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.pathname.startsWith('/api/')) {
      const ct = req.headers()['content-type'] || '';
      apiRequests.push({ method: req.method(), path: url.pathname, contentType: ct, body: req.postData(), buffer: req.postDataBuffer() });
      // L'endpoint di completamento restituisce il corpo ricevuto: la pagina di prova risponde
      // usando i segnaposto effettivamente arrivati «a Claude».
      const body = ct.includes('json') ? req.postData() || '{}' : '{}';
      return route.fulfill({ status: 200, contentType: 'application/json', body });
    }
    return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: FIXTURE });
  });

  let sw = context.serviceWorkers()[0];
  if (!sw) sw = await context.waitForEvent('serviceworker');
  const extensionId = new URL(sw.url()).host;
  if (edition === 'enterprise') {
    const dev = Object.assign({ mode: 'ente', serverUrl, devStaticToken: 'dev-token' }, opts.devManaged || {});
    await sw.evaluate(async (dev) => chrome.storage.local.set({ pgDevManaged: dev }), dev);
  } else {
    await sw.evaluate(async (u) => chrome.storage.local.set({ rizzoUrl: u }), rizzoUrl);
  }

  let lastState = null;
  if (opts.waitReady !== false) {
    try {
      await waitFor(async () => {
        const st = (await sw.evaluate(() => chrome.storage.local.get('pgState'))).pgState;
        lastState = st;
        if (!st || !st.health || !st.health.ok) return false;
        if (edition === 'enterprise') return st.config.serverUrl === serverUrl && st.keys && st.keys.keyId;
        return st.config.rizzoUrl === rizzoUrl;
      }, 25000);
    } catch (e) {
      throw new Error('stato dell\'estensione non pronto: ' + JSON.stringify(lastState && { health: lastState.health, keys: lastState.keys, cfg: lastState.config && [lastState.config.mode, lastState.config.serverUrl, lastState.config.rizzoUrl] }));
    }
  }

  const mock = async (p, method, body) => {
    const r = await fetch(serverUrl + p, {
      method: method || 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    return r.status === 204 ? null : r.json();
  };

  return {
    context, sw, extensionId, serverUrl, rizzoUrl, rizzo, apiRequests, mock, edition,
    state: async () => (await sw.evaluate(() => chrome.storage.local.get('pgState'))).pgState,
    async close() {
      await context.close();
      if (server) server.close();
      if (rizzo) rizzo.close();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    },
  };
}

async function waitFor(fn, timeout, interval) {
  const end = Date.now() + (timeout || 5000);
  let last;
  while (Date.now() < end) {
    try {
      last = await fn();
      if (last) return last;
    } catch (_) { /* riprova */ }
    await new Promise((r) => setTimeout(r, interval || 100));
  }
  throw new Error('timeout in attesa della condizione');
}

module.exports = { startHarness, waitFor };
