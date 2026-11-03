// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 gli autori di Pseudomania
//
// Service worker. Due edizioni, stessa interfaccia di messaggi verso gli script di contenuto:
//  - Enterprise edition: parla con il server Pseudomania dell'ente; cifra/decifra il dizionario
//    nel browser (keys.js); token OIDC.
//  - Personal edition: estensione autonoma con Rizzo-PII desktop (local.js); nessun server.
// Dizionari decifrati in chrome.storage.session (memoria, solo contesti fidati), record di ispezione idem.

/* global importScripts */
importScripts(
  '../shared/strings.js',
  '../shared/config.js',
  '../shared/scope.js',
  '../shared/tags.js',
  '../shared/policy-data.js',
  '../shared/policy.js',
  '../shared/rizzo.js',
  '../shared/zip.js',
  '../shared/ooxml.js',
  '../shared/textfile.js',
  'idb.js',
  'auth.js',
  'api.js',
  'keys.js',
  'local.js'
);

const PG = globalThis.PG;
const SITE_URLS = ['https://claude.ai/*'];
const isPersonal = (cfg) => cfg.mode !== 'ente';

// --- Configurazione ------------------------------------------------------------------------------
async function readManaged() {
  let managed = {};
  try {
    managed = await chrome.storage.managed.get(null);
  } catch (_) {
    managed = {};
  }
  let dev = false;
  if (!managed || !Object.keys(managed).length) {
    // Solo per installazioni «decompresse» di sviluppo: permette di provare l'Enterprise edition
    // senza policy. Ignorato nelle installazioni gestite o dal Web Store.
    try {
      const self = await chrome.management.getSelf();
      if (self.installType === 'development') {
        const r = await chrome.storage.local.get('pgDevManaged');
        if (r.pgDevManaged) {
          managed = r.pgDevManaged;
          dev = true;
        }
      }
    } catch (_) { /* ignora */ }
  }
  return { managed: managed || {}, dev };
}

async function getConfig() {
  const { managed, dev } = await readManaged();
  const local = await chrome.storage.local.get(['rizzoUrl', 'enabled', 'pgServerConfig']);
  const pre = PG.config.resolveConfig({ managed, local });
  const sc = local.pgServerConfig && local.pgServerConfig.url === pre.serverUrl ? local.pgServerConfig : null;
  const cfg = PG.config.resolveConfig({ managed, local, server: sc ? sc.data : null, serverTs: sc ? sc.ts : null });
  if (dev && typeof managed.devStaticToken === 'string' && cfg.mode === 'ente') {
    cfg.devStaticToken = managed.devStaticToken;
    cfg.configured = Boolean(cfg.serverUrl);
  }
  return cfg;
}

async function refreshServerConfig(cfg, interactive) {
  const r = await PG.api.config(cfg, interactive);
  if (r.ok && r.data) {
    await chrome.storage.local.set({ pgServerConfig: { url: cfg.serverUrl, data: r.data, ts: Date.now() } });
  }
  return r;
}

// --- Stato e icona -------------------------------------------------------------------------------
let lastHealth = { ok: false, detector: 'unknown', checked: 0 };

async function checkHealth(cfg) {
  if (isPersonal(cfg)) {
    lastHealth = await PG.local.health(cfg);
    return lastHealth;
  }
  const r = await PG.api.health(cfg);
  lastHealth = {
    ok: Boolean(r.ok && r.data && r.data.status === 'ok'),
    detector: r.ok && r.data ? r.data.detector : 'down',
    keys: r.ok && r.data ? r.data.keys || 'ok' : 'down',
    version: r.ok && r.data ? r.data.version : null,
    checked: Date.now(),
  };
  return lastHealth;
}

// Le pubblicazioni dello stato sono serializzate: una pubblicazione lenta e vecchia non deve
// sovrascrivere una più recente.
let publishChain = Promise.resolve();
function publishState(opts) {
  const run = publishChain.then(() => publishStateNow(opts));
  publishChain = run.catch(() => {});
  return run;
}

async function publishStateNow(opts) {
  opts = opts || {};
  let cfg = await getConfig();
  let keyInfo = null;
  if (opts.health !== false) {
    await checkHealth(cfg);
    if (!isPersonal(cfg) && lastHealth.ok && (opts.serverConfig || !cfg.policyVersion)) {
      await refreshServerConfig(cfg, false);
      cfg = await getConfig();
    }
  }
  if (!isPersonal(cfg) && lastHealth.ok && cfg.escrowPublicKey && opts.health !== false) {
    keyInfo = await keyMaintenance(cfg);
  } else if (!isPersonal(cfg)) {
    keyInfo = await PG.keys.status().catch(() => null);
  }
  const auth = await PG.auth.status(cfg);
  const state = { config: PG.config.toPlain(cfg), health: lastHealth, auth, keys: keyInfo, ts: Date.now() };
  await chrome.storage.local.set({ pgState: state });
  await updateIcon(cfg, auth);
  return state;
}

/** Enterprise: chiave al primo avvio, rotazione periodica o forzata, chiavi recuperate. */
async function keyMaintenance(cfg) {
  try {
    const before = await PG.keys.activeKey();
    await PG.keys.ensureKey(cfg);
    const after = await PG.keys.activeKey();
    if (before && after && before.keyId !== after.keyId) await refreshServerConfig(cfg, false); // rotateKey torna false
    const st = await PG.keys.status();
    if (st.deviceKeyId) {
      const imp = await PG.keys.importRecovered(cfg).catch(() => ({ imported: 0 }));
      if (imp.imported) await clearDictCache();
    }
    return await PG.keys.status();
  } catch (e) {
    console.warn('[Pseudomania] gestione delle chiavi non riuscita:', e && e.message);
    return PG.keys.status().catch(() => null);
  }
}

// --- Personal edition: badge e icona per scheda (stato della conversazione aperta) ---------------
const ICON_ON = { 16: '/icons/icon16.png', 32: '/icons/icon32.png', 48: '/icons/icon48.png', 128: '/icons/icon128.png' };
const ICON_OFF = { 16: '/icons/off16.png', 32: '/icons/off32.png', 48: '/icons/off48.png', 128: '/icons/off128.png' };
let tabStates = null; // tabId -> 'on' | 'off' | 'ask'

async function loadTabStates() {
  if (!tabStates) {
    const r = await chrome.storage.session.get('pgTabStates');
    tabStates = r.pgTabStates || {};
  }
  return tabStates;
}

async function applyTabBadge(tabId, state) {
  const bad = !lastHealth.ok;
  let text = 'ON';
  let color = '#2e7d32';
  if (state === 'off') {
    text = 'OFF';
    color = '#c62828';
  } else if (state === 'ask') {
    text = '?';
    color = '#ef6c00';
  } else if (bad) {
    text = '!';
    color = '#c62828';
  }
  const title = bad && state !== 'off' ? PG.strings.statoServizio('personale', lastHealth) : PG.strings['badgeTitolo_' + state] || '';
  try {
    await chrome.action.setBadgeText({ tabId, text });
    await chrome.action.setBadgeBackgroundColor({ tabId, color });
    await chrome.action.setTitle({ tabId, title: `${PG.strings.nome} – ${title}` });
    await chrome.action.setIcon({ tabId, path: state === 'off' ? ICON_OFF : ICON_ON });
  } catch (_) { /* scheda chiusa */ }
}

async function setTabState(tabId, state) {
  const ts = await loadTabStates();
  ts[tabId] = state;
  await chrome.storage.session.set({ pgTabStates: ts });
  await applyTabBadge(tabId, state);
}

async function refreshTabBadges() {
  const ts = await loadTabStates();
  for (const [id, st] of Object.entries(ts)) await applyTabBadge(Number(id), st);
}

/** Pulsante della barra degli strumenti e scorciatoia: attiva/disattiva la conversazione della scheda. */
async function toggleForTab(tab, trigger) {
  if (!tab || tab.id == null) [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return { ok: false };
  try {
    const r = await chrome.tabs.sendMessage(tab.id, { type: 'pg:toggleProtection', trigger: trigger || 'toolbar' });
    if (r) return r;
  } catch (_) { /* nessuno script di contenuto: scheda non di claude.ai */ }
  const cfg = await getConfig();
  if (isPersonal(cfg)) chrome.runtime.openOptionsPage();
  return { ok: false, error: 'no_site' };
}
globalThis.pgToggleForTab = toggleForTab; // usato anche dai test end-to-end

async function updateIcon(cfg, auth) {
  // Personal: niente popup, il clic sul pulsante attiva/disattiva la conversazione della scheda.
  // Enterprise: il popup spiega che la protezione è gestita dall'ente.
  await chrome.action.setPopup({ popup: isPersonal(cfg) ? '' : 'src/popup/popup.html' });
  if (isPersonal(cfg)) {
    const bad = !lastHealth.ok;
    await chrome.action.setBadgeText({ text: bad ? '!' : '' });
    await chrome.action.setBadgeBackgroundColor({ color: '#c62828' });
    await chrome.action.setTitle({ title: `${PG.strings.nome} – ${bad ? PG.strings.statoServizio(cfg.mode, lastHealth) : PG.strings.edizionePersonal}` });
    await refreshTabBadges();
    return;
  }
  let text = 'ON';
  let color = '#2e7d32';
  let title = PG.strings.attiva;
  if (!cfg.enabled) {
    text = 'OFF';
    color = '#c62828';
    title = PG.strings.disattiva;
  } else if (!lastHealth.ok) {
    text = '!';
    color = '#c62828';
    title = PG.strings.statoServizio(cfg.mode, lastHealth);
  } else if (auth && auth.needed) {
    text = '…';
    color = '#ef6c00';
    title = PG.strings.accessoNecessario;
  }
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color });
  if (chrome.action.setBadgeTextColor) await chrome.action.setBadgeTextColor({ color: '#ffffff' });
  await chrome.action.setTitle({ title: `${PG.strings.nome} – ${title}` });
}

function noteResult(r) {
  const down = !r.ok && (r.error === 'unreachable' || r.error === 'detector_down' || r.error === 'cors');
  if (down && lastHealth.ok) publishState();
  if (r.ok && !lastHealth.ok) publishState();
}

// --- Eventi (Enterprise: al server, con coda; Personal: registro locale cifrato) -------------
async function sendEvent(cfg, body) {
  if (isPersonal(cfg)) return PG.local.event(body);
  const r = await PG.api.event(cfg, body);
  if (r.ok) {
    flushEvents(cfg);
    return r;
  }
  if (r.error === 'unreachable' || r.error === 'detector_down' || r.error === 'auth') {
    const q = (await chrome.storage.session.get('pgEventQueue')).pgEventQueue || [];
    q.push(Object.assign({ queuedAt: new Date().toISOString() }, body));
    await chrome.storage.session.set({ pgEventQueue: q.slice(-200) });
  }
  return r;
}

let flushing = false;
async function flushEvents(cfg) {
  if (flushing || isPersonal(cfg)) return;
  flushing = true;
  try {
    const q = (await chrome.storage.session.get('pgEventQueue')).pgEventQueue || [];
    if (!q.length) return;
    await chrome.storage.session.set({ pgEventQueue: [] });
    const rest = [];
    for (const ev of q) {
      const { queuedAt, ...body } = ev;
      body.details = Object.assign({}, body.details, { queuedAt });
      const r = await PG.api.event(cfg, body);
      if (!r.ok) rest.push(ev);
    }
    if (rest.length) {
      const cur = (await chrome.storage.session.get('pgEventQueue')).pgEventQueue || [];
      await chrome.storage.session.set({ pgEventQueue: rest.concat(cur).slice(-200) });
    }
  } finally {
    flushing = false;
  }
}

// --- Dizionario (cache decifrata in chrome.storage.session) --------------------------------------
const dictKey = (scope) => 'dict:' + PG.scope.scopeKey(scope);

async function clearDictCache() {
  const all = await chrome.storage.session.get(null);
  const ks = Object.keys(all).filter((k) => k.startsWith('dict:'));
  if (ks.length) await chrome.storage.session.remove(ks);
}

async function getDictionary(cfg, scope, force) {
  const k = dictKey(scope);
  const cached = (await chrome.storage.session.get(k))[k];
  if (!force && cached && Date.now() - cached.fetchedAt < 10 * 60 * 1000) return { ok: true, data: cached };
  let r;
  if (isPersonal(cfg)) r = await PG.local.dictionary(scope);
  else {
    r = await PG.api.dictionary(cfg, scope);
    noteResult(r);
    if (r.ok) {
      const dec = await PG.keys.decryptEntries(scope, (r.data && r.data.entries) || {});
      r = { ok: true, data: { entries: dec.values, unrecoverable: dec.unrecoverable, expiresAt: r.data.expiresAt || null, confirmBy: r.data.confirmBy || null } };
    }
  }
  if (!r.ok) {
    if (cached) return { ok: true, data: cached, stale: true };
    if (r.status === 404) return { ok: true, data: { entries: {}, unrecoverable: [], expiresAt: null, confirmBy: null } };
    return r;
  }
  // Valori noti in questa sessione ma non (ancora) caricati restano ripristinabili.
  const local = cached ? cached.localOnly || {} : {};
  const entries = Object.assign({}, local, r.data.entries);
  const unrecoverable = (r.data.unrecoverable || []).filter((t) => !(t in entries));
  const merged = { entries, unrecoverable, localOnly: local, expiresAt: r.data.expiresAt, confirmBy: r.data.confirmBy, fetchedAt: Date.now() };
  await chrome.storage.session.set({ [k]: merged });
  return { ok: true, data: merged };
}

async function mergeDictionary(scope, values) {
  const k = dictKey(scope);
  const cur = (await chrome.storage.session.get(k))[k] || { entries: {}, unrecoverable: [], localOnly: {}, expiresAt: null, confirmBy: null, fetchedAt: 0 };
  cur.localOnly = cur.localOnly || {};
  for (const [tag, v] of Object.entries(values)) {
    cur.entries[tag] = v;
    cur.localOnly[tag] = v;
  }
  cur.unrecoverable = (cur.unrecoverable || []).filter((t) => !(t in values));
  await chrome.storage.session.set({ [k]: cur });
}

/** Enterprise: cifra le voci nuove e le carica (POST /v1/dictionary/entries). */
async function uploadNewEntries(cfg, scope, newEntries) {
  if (!newEntries || !newEntries.length) return null;
  try {
    const entries = await PG.keys.encryptEntries(cfg, scope, newEntries);
    const r = await PG.api.uploadEntries(cfg, scope, entries);
    if (r.ok && r.data && r.data.rejected && r.data.rejected.length) {
      console.warn('[Pseudomania] voci rifiutate dal server:', r.data.rejected.map((x) => x.reason).join(', '));
    }
    return r;
  } catch (e) {
    // Senza chiave/escrow le voci restano «in attesa» sul server e scadono (accettato da DECISIONI).
    console.warn('[Pseudomania] caricamento delle voci cifrate non riuscito:', e && e.message);
    return { ok: false, error: 'internal', message: String(e && e.message) };
  }
}

// --- Record di ispezione -------------------------------------------------------------------------
const recKey = (convKey) => 'rec:' + convKey;

async function saveRecord(rec) {
  const k = recKey(rec.convKey);
  const list = (await chrome.storage.session.get(k))[k] || [];
  list.push(rec);
  await chrome.storage.session.set({ [k]: list.slice(-200) });
}

async function getRecords(convKey) {
  const k = recKey(convKey);
  return (await chrome.storage.session.get(k))[k] || [];
}

async function moveRecords(from, to) {
  const a = await getRecords(from);
  if (!a.length) return;
  const b = await getRecords(to);
  const moved = a.map((r) => Object.assign({}, r, { convKey: to }));
  await chrome.storage.session.set({ [recKey(to)]: b.concat(moved).slice(-200) });
  await chrome.storage.session.remove(recKey(from));
}

// --- Messaggi -------------------------------------------------------------------------------------
const handlers = {
  async 'pg:getState'() {
    const st = (await chrome.storage.local.get('pgState')).pgState;
    if (st && Date.now() - st.ts < 60000) return { ok: true, data: st };
    return { ok: true, data: await publishState() };
  },

  async 'pg:pseudonymize'(msg, cfg) {
    const r = isPersonal(cfg) ? await PG.local.pseudonymize(cfg, msg) : await PG.api.pseudonymize(cfg, msg.scope, msg.kind, msg.text);
    noteResult(r);
    if (r.ok && !r.data.blocked) {
      const values = {};
      for (const e of r.data.entities || []) {
        if (typeof e.start === 'number' && e.end > e.start) values[e.tag] = msg.text.slice(e.start, e.end);
      }
      for (const e of r.data.newEntries || []) values[e.tag] = e.value;
      await mergeDictionary(msg.scope, values);
      if (!isPersonal(cfg)) await uploadNewEntries(cfg, msg.scope, r.data.newEntries);
      // I valori in chiaro non tornano allo script di contenuto oltre il necessario.
      if (r.data.newEntries) r.data.newEntries = r.data.newEntries.map((e) => ({ tag: e.tag }));
    }
    return r;
  },

  async 'pg:pseudonymizeFile'(msg, cfg) {
    const r = isPersonal(cfg)
      ? await PG.local.pseudonymizeFile(cfg, msg)
      : await PG.api.pseudonymizeFile(cfg, msg.scope, msg.kind, { b64: msg.b64, mime: msg.mime, name: msg.name });
    noteResult(r);
    if (r.ok && !r.data.blocked && r.data.newEntries && r.data.newEntries.length) {
      const values = {};
      for (const e of r.data.newEntries) values[e.tag] = e.value;
      await mergeDictionary(msg.scope, values);
      await uploadNewEntries(cfg, msg.scope, r.data.newEntries);
      r.data.newEntries = r.data.newEntries.map((e) => ({ tag: e.tag }));
    }
    return r;
  },

  async 'pg:dictionary'(msg, cfg) {
    return getDictionary(cfg, msg.scope, msg.force);
  },

  async 'pg:reidentifyFile'(msg, cfg) {
    if (isPersonal(cfg)) return PG.local.reidentifyFile(cfg, msg);
    const d = await getDictionary(cfg, msg.scope, false);
    const entries = d.ok ? d.data.entries : {};
    const r = await PG.api.reidentifyFile(cfg, msg.scope, { b64: msg.b64, mime: msg.mime, name: msg.name }, entries);
    noteResult(r);
    return r;
  },

  async 'pg:rebind'(msg, cfg) {
    const r = isPersonal(cfg) ? await PG.local.rebind(msg) : await PG.api.rebind(cfg, msg.from, msg.to);
    if (!isPersonal(cfg)) noteResult(r);
    if (!r.ok) return r; // 409: la cache resta sullo scope pending
    const fk = dictKey(msg.from);
    const tk = dictKey(msg.to);
    const got = await chrome.storage.session.get([fk, tk]);
    if (got[fk]) {
      const prev = got[tk] || { entries: {}, localOnly: {} };
      const merged = {
        entries: Object.assign({}, prev.entries, got[fk].entries),
        localOnly: Object.assign({}, prev.localOnly || {}, got[fk].localOnly || {}),
        unrecoverable: [], expiresAt: got[fk].expiresAt, confirmBy: null, fetchedAt: 0,
      };
      await chrome.storage.session.set({ [tk]: merged });
      await chrome.storage.session.remove(fk);
    }
    return r;
  },

  async 'pg:event'(msg, cfg) {
    return sendEvent(cfg, { traceId: msg.traceId || null, scope: msg.scope || null, event: msg.event, details: msg.details || {} });
  },

  async 'pg:tabState'(msg, cfg, sender) {
    if (!isPersonal(cfg) || !sender.tab || sender.tab.id == null) return { ok: true };
    if (!['on', 'off', 'ask'].includes(msg.state)) return { ok: false, error: 'bad_state' };
    await setTabState(sender.tab.id, msg.state);
    return { ok: true };
  },

  async 'pg:saveBlock'(msg) {
    await chrome.storage.session.set({ pgLastBlock: msg.block });
    return { ok: true };
  },

  async 'pg:saveRecord'(msg) {
    await saveRecord(msg.record);
    return { ok: true };
  },

  async 'pg:getRecords'(msg) {
    return { ok: true, data: await getRecords(msg.convKey) };
  },

  async 'pg:moveRecords'(msg) {
    await moveRecords(msg.from, msg.to);
    return { ok: true };
  },

  async 'pg:deleteScope'(msg, cfg) {
    const r = isPersonal(cfg) ? await PG.local.deleteScope(msg) : await PG.api.deleteScope(cfg, msg.scope);
    if (r.ok || r.status === 404) {
      await chrome.storage.session.remove(dictKey(msg.scope));
      const tabs = await chrome.tabs.query({ url: SITE_URLS });
      for (const t of tabs) chrome.tabs.sendMessage(t.id, { type: 'pg:refresh' }).catch(() => {});
      return { ok: true };
    }
    return r;
  },

  async 'pg:confirmScope'(msg, cfg) {
    if (isPersonal(cfg)) return { ok: false, error: 'not_available' };
    const r = await PG.api.confirmScope(cfg, msg.scope);
    if (r.ok) await chrome.storage.session.remove(dictKey(msg.scope));
    return r;
  },

  async 'pg:prepareRecovery'(msg, cfg) {
    if (isPersonal(cfg)) return { ok: false, error: 'not_available' };
    try {
      return { ok: true, data: await PG.keys.prepareRecovery(cfg) };
    } catch (e) {
      return { ok: false, error: 'internal', message: String(e && e.message) };
    }
  },

  async 'pg:importRecovered'(msg, cfg) {
    if (isPersonal(cfg)) return { ok: false, error: 'not_available' };
    try {
      const res = await PG.keys.importRecovered(cfg);
      if (res.imported) {
        await clearDictCache();
        const tabs = await chrome.tabs.query({ url: SITE_URLS });
        for (const t of tabs) chrome.tabs.sendMessage(t.id, { type: 'pg:refresh' }).catch(() => {});
      }
      return { ok: true, data: res };
    } catch (e) {
      return { ok: false, error: 'internal', message: String(e && e.message) };
    }
  },

  async 'pg:keyStatus'(msg, cfg) {
    if (isPersonal(cfg)) return { ok: true, data: null };
    return { ok: true, data: await PG.keys.status() };
  },

  async 'pg:localLog'(msg, cfg) {
    if (!isPersonal(cfg)) return { ok: false, error: 'not_available' };
    return { ok: true, data: await PG.local.readLog() };
  },

  async 'pg:setEnabled'(msg, cfg) {
    if (!cfg.allowDisable) return { ok: false, error: 'not_allowed' };
    const enabled = Boolean(msg.enabled);
    await chrome.storage.local.set({ enabled });
    const ncfg = await getConfig();
    await sendEvent(ncfg, { traceId: null, scope: null, event: enabled ? 'extension_enabled' : 'extension_disabled', details: { mode: ncfg.mode } });
    return { ok: true, data: await publishState({ health: false }) };
  },

  async 'pg:login'(msg, cfg) {
    const token = await PG.auth.getToken(cfg, { interactive: true, forceRefresh: true });
    const st = await publishState({ serverConfig: true });
    return { ok: Boolean(token), data: st };
  },

  async 'pg:logout'() {
    await PG.auth.logout();
    return { ok: true, data: await publishState({ health: false }) };
  },

  async 'pg:refreshState'() {
    return { ok: true, data: await publishState({ serverConfig: true }) };
  },

  async 'pg:source'(msg, cfg) {
    // GET /v1/source (senza autenticazione): link al codice sorgente, clausola di rete AGPL.
    if (isPersonal(cfg)) return { ok: true, data: null };
    return PG.api.source(cfg);
  },

  async 'pg:testRizzo'(msg) {
    const c = new PG.rizzo.RizzoClient(msg.rizzoUrl || PG.config.DEFAULT_RIZZO_URL);
    return { ok: true, data: { state: await c.health() } };
  },
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.type !== 'string') return false;

  // L'apertura del pannello laterale deve avvenire subito, nel contesto del gesto dell'utente.
  if (msg.type === 'pg:openInspection') {
    const tabId = sender.tab && sender.tab.id;
    if (tabId != null) chrome.sidePanel.open({ tabId }).catch(() => {});
    chrome.storage.session
      .set({ pgInspect: { tabId, recordId: msg.recordId, convKey: msg.convKey, scope: msg.scope, ts: Date.now() } })
      .then(() => sendResponse({ ok: true }));
    return true;
  }

  const h = handlers[msg.type];
  if (!h) return false;
  (async () => {
    try {
      const cfg = await getConfig();
      return await h(msg, cfg, sender);
    } catch (e) {
      return { ok: false, error: 'internal', message: String(e && e.message) };
    }
  })().then(sendResponse);
  return true;
});

chrome.action.onClicked.addListener((tab) => toggleForTab(tab, 'toolbar'));
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'toggle-protection') toggleForTab(tab, 'shortcut');
});
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const ts = await loadTabStates();
  if (ts[tabId]) {
    delete ts[tabId];
    chrome.storage.session.set({ pgTabStates: ts });
  }
});
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'pg-panel' && tab) chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
  if (info.menuItemId === 'pg-options') chrome.runtime.openOptionsPage();
});

// --- Ciclo di vita ------------------------------------------------------------------------------
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'pg-panel', title: PG.strings.menuPannello, contexts: ['action'] });
    chrome.contextMenus.create({ id: 'pg-options', title: PG.strings.menuImpostazioni, contexts: ['action'] });
  });
  chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }).catch(() => {});
  chrome.alarms.create('pg-health', { periodInMinutes: 1 });
  publishState({ serverConfig: true });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create('pg-health', { periodInMinutes: 1 });
  publishState({ serverConfig: true });
});

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name !== 'pg-health') return;
  publishState({ serverConfig: Date.now() % (10 * 60000) < 60000 }).then(async (st) => {
    const cfg = await getConfig();
    if (isPersonal(cfg)) PG.local.cleanup().catch(() => {});
    else if (st.health.ok) flushEvents(cfg);
  });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'managed' || (area === 'local' && (changes.rizzoUrl || changes.pgDevManaged))) {
    publishState({ serverConfig: true });
  }
});
