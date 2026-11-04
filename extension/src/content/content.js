// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 gli autori di Pseudomania
//
// Script di contenuto (mondo isolato): coordina intercettazione degli invii, file, ripristino,
// ispezione e indicatore di stato. Non contiene nulla di specifico di claude.ai: tutto passa
// dall'adattatore del sito (src/sites/*.js).

(function () {
  'use strict';
  const PG = globalThis.PG;
  if (!PG || PG.__contentStarted) return;
  PG.__contentStarted = true;

  const adapter = PG.sites.forHost(location.hostname);
  if (!adapter) return;

  const S = PG.strings;
  const { tick } = PG.domInput;
  const norm = PG.tags.normalizeForCompare;

  // --- Stato -----------------------------------------------------------------------------------
  let cfg = null; // configurazione effettiva (dal service worker)
  let health = null; // {ok, detector}
  let auth = null; // {needed, loggedIn}
  let projectMap = {}; // conversationId -> projectId
  let instrSent = {}; // convKey -> timestamp
  let scopeAlias = {}; // conversationId -> 'pending:<uuid4>' (rebind rifiutato con 409)
  // Personal edition: attivazione per conversazione (DECISIONI.md). Server edition: sempre attiva.
  let activation = new PG.activation.Activation();
  let actState = 'on'; // 'on' | 'off' | 'ask' per la conversazione corrente
  let actKey = null; // convKey a cui si riferisce actState
  let askBanner = null;
  let domStarted = false;
  let dict = {};
  let records = [];
  let pageRecognized = true;
  let unrecognizedSince = null;
  let unrecognizedReported = false;
  let busy = false;
  let bypass = { el: null, until: 0 };
  let awaiting = null; // {traceId, scope}
  let lastDictRefresh = 0;
  const approved = new Set();
  const visibleTags = new Set();
  const bypassEvents = new WeakSet();
  const badges = new WeakMap();

  const tracker = new PG.scope.ScopeTracker({
    projectOf: (cid) => projectMap[cid] || null,
    aliasOf: (cid) => scopeAlias[cid] || null,
  });
  const status = new PG.ui.StatusArea();
  const engine = new PG.RestoreEngine({
    adapter,
    doc: document,
    excludeTexts: () => (cfg && cfg.tagInstruction ? [cfg.tagInstruction] : []),
    onUnknown: () => refreshDict(false),
    onResponseComplete: (info) => onResponseComplete(info),
    onProcessed: (restored) => {
      for (const t of restored) visibleTags.add(t);
      scheduleBadges();
    },
  });

  const scope = () => tracker.current.scope;
  const convKey = () => tracker.current.convKey;
  const isPersonal = () => Boolean(cfg && cfg.mode !== 'ente');
  // Protezione IN USCITA (pseudonimizzazione di messaggi e allegati). Il ripristino in entrata
  // non dipende da questo stato: è sempre attivo.
  const protectionActive = () => Boolean(cfg && cfg.enabled && (!isPersonal() || actState !== 'off'));
  const failClosed = () => !cfg || cfg.failClosed;

  // --- Comunicazione -----------------------------------------------------------------------------
  // Dopo un aggiornamento o una ricarica dell'estensione questo script resta nella pagina ma perde
  // il collegamento con l'estensione («Extension context invalidated»): si avvisa una volta sola e
  // si chiede di ricaricare la pagina. Gli invii restano bloccati (nessun dato parte in chiaro).
  let orphanNotified = false;
  function contextAlive() {
    try {
      return Boolean(chrome.runtime && chrome.runtime.id);
    } catch (_) {
      return false;
    }
  }
  function notifyOrphan() {
    if (orphanNotified) return;
    orphanNotified = true;
    try {
      status.banner('error', S.estensioneAggiornataTitolo, S.estensioneAggiornataTesto, { replace: true });
    } catch (_) { /* interfaccia non ancora pronta */ }
  }
  function storageSet(obj) {
    if (!contextAlive()) return notifyOrphan();
    try {
      chrome.storage.local.set(obj).catch(() => notifyOrphan());
    } catch (_) {
      notifyOrphan();
    }
  }
  window.addEventListener('unhandledrejection', (ev) => {
    const m = String((ev.reason && ev.reason.message) || ev.reason || '');
    if (/Extension context invalidated/i.test(m)) {
      ev.preventDefault();
      notifyOrphan();
    }
  });

  async function bg(type, payload) {
    if (!contextAlive()) {
      notifyOrphan();
      return { ok: false, error: 'extension', message: 'context invalidated' };
    }
    try {
      const r = await chrome.runtime.sendMessage(Object.assign({ type }, payload || {}));
      return r || { ok: false, error: 'extension' };
    } catch (e) {
      return { ok: false, error: 'extension', message: String(e && e.message) };
    }
  }

  function event(name, details, traceId) {
    bg('pg:event', { event: name, details: details || {}, traceId: traceId || null, scope: scope() });
  }

  function toPage(op, data) {
    window.postMessage(Object.assign({ source: 'pseudogate-content', op }, data || {}), '*');
  }

  function postStateToPage() {
    toPage('state', { state: { enabled: protectionActive(), inbound: true, rules: adapter.NETWORK_RULES } });
  }

  function approveText(text) {
    approved.add(norm(text));
    toPage('approve', { text });
  }

  async function sha256Hex(buf) {
    const d = await crypto.subtle.digest('SHA-256', buf);
    return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  function b64FromBuffer(buf) {
    const bytes = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }

  function bufferFromB64(b64) {
    const s = atob(b64);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out.buffer;
  }

  // --- Configurazione e stato ------------------------------------------------------------------
  function applyState(st) {
    if (!st) return;
    const wasActive = protectionActive();
    cfg = st.config || cfg;
    health = st.health || health;
    auth = st.auth || auth;
    postStateToPage();
    updateMicBlock();
    updateStatus();
    if (isPersonal() && actKey !== null) bg('pg:tabState', { state: actState });
    if (wasActive !== protectionActive()) scheduleBadges();
  }

  function updateStatus() {
    if (!cfg) return;
    status.el.setAttribute('data-pg-activation', isPersonal() ? actState : 'locked');
    if (!protectionActive()) status.setState('off', isPersonal() ? S.statoDisattivatoConv : S.statoDisattivato);
    else if (isPersonal() && actState === 'ask') status.setState('warn', S.statoInAttesa);
    else if (!cfg.configured) status.setState('warn', S.statoServerGiu);
    else if (health && !health.ok) status.setState('warn', S.statoServizio(cfg.mode, health));
    else if (auth && auth.needed) status.setState('warn', S.statoAccesso);
    else if (!pageRecognized) status.setState('warn', S.statoNonRiconosciuto);
    else status.setState('on', S.statoAttivo);
  }

  let micStyle = null;
  function updateMicBlock() {
    const on = protectionActive();
    if (on && !micStyle) {
      micStyle = document.createElement('style');
      micStyle.setAttribute('data-pg-ui', 'mic');
      micStyle.textContent = `${adapter.micSelector()} { display: none !important; }`;
      (document.head || document.documentElement).appendChild(micStyle);
    } else if (!on && micStyle) {
      micStyle.remove();
      micStyle = null;
    }
  }

  // --- Scope e dizionario ----------------------------------------------------------------------
  async function loadStoredMaps() {
    const r = await chrome.storage.local.get(['pgProjectMap', 'pgInstrSent', 'pgScopeAlias', 'pgActivation']);
    activation = new PG.activation.Activation(r.pgActivation);
    projectMap = r.pgProjectMap || {};
    instrSent = r.pgInstrSent || {};
    scopeAlias = r.pgScopeAlias || {};
  }

  function saveMaps() {
    // Solo identificativi, nessun dato personale.
    const keys = Object.keys(instrSent);
    if (keys.length > 2000) for (const k of keys.slice(0, keys.length - 2000)) delete instrSent[k];
    const ak = Object.keys(scopeAlias);
    if (ak.length > 2000) for (const k of ak.slice(0, ak.length - 2000)) delete scopeAlias[k];
    storageSet({ pgProjectMap: projectMap, pgInstrSent: instrSent, pgScopeAlias: scopeAlias });
  }

  async function refreshDict(force) {
    const sc = scope();
    if (!sc) {
      dict = {};
      engine.setEntries(dict);
      return;
    }
    if (!force && Date.now() - lastDictRefresh < 5000) return;
    lastDictRefresh = Date.now();
    const r = await bg('pg:dictionary', { scope: sc, force: Boolean(force) });
    if (r.ok && PG.scope.sameScope(sc, scope())) {
      dict = r.data.entries || {};
      const unrec = r.data.unrecoverable || [];
      engine.setEntries(dict, unrec);
      warnUnrecoverable(sc, unrec);
    }
  }

  // Server edition: voci cifrate con una chiave che questo browser non ha (cambio PC).
  const unrecWarned = new Set();
  function warnUnrecoverable(sc, unrec) {
    const key = PG.scope.scopeKey(sc);
    if (!unrec.length || unrecWarned.has(key)) return;
    unrecWarned.add(key);
    const project = sc.type === 'project';
    status.banner('info', null, S.nonRipristinabiliAvviso(unrec.length, project), {
      replace: false,
      link: project ? { href: S.urlRecupero, text: S.procedura } : null,
    });
  }

  async function loadRecords() {
    const k = convKey();
    const r = k ? await bg('pg:getRecords', { convKey: k }) : { ok: true, data: [] };
    records = r.ok ? r.data : [];
    scheduleBadges();
  }

  // --- Attivazione per conversazione (Personal edition) -----------------------------------------
  function saveActivation() {
    storageSet({ pgActivation: activation.toJSON() });
  }

  function hasProtectedData() {
    return records.some((r) => r.entities && r.entities.length) || Object.keys(dict).length > 0;
  }

  function clearAskBanner() {
    if (askBanner) askBanner.remove();
    askBanner = null;
  }

  /** Applica lo stato alla pagina: barra, rete di sicurezza, microfono, badge della scheda. */
  function applyActivation() {
    postStateToPage();
    updateMicBlock();
    updateStatus();
    if (isPersonal()) bg('pg:tabState', { state: actState });
    if (actState !== 'ask') clearAskBanner();
    else if (!askBanner || !askBanner.isConnected) {
      askBanner = status.banner('warn', S.chiediTitolo, S.chiediTesto, {
        replace: false,
        actions: [
          { text: S.chiediAttiva, primary: true, onClick: () => chooseState('on', 'banner') },
          { text: S.chiediContinua, onClick: () => chooseState('off', 'banner') },
        ],
      });
    }
  }

  /** Ingresso in una conversazione (cambio di chat, anche senza ricaricare la pagina). */
  function enterConversation(key) {
    actKey = key;
    actState = isPersonal() ? activation.enter(key) : 'on';
    if (isPersonal()) saveActivation();
    clearAskBanner();
    applyActivation();
  }

  /**
   * Scelta esplicita: pulsante della barra degli strumenti, scorciatoia o banner.
   * @returns {Promise<string>} stato risultante
   */
  async function chooseState(state, trigger) {
    if (!isPersonal()) return 'locked';
    const key = convKey();
    if (state === 'off' && actState !== 'off' && activation.needsOffWarning(key, hasProtectedData())) {
      const ok = await PG.ui.confirmOff();
      if (!ok) return actState;
      activation.markWarned(key);
    }
    activation.set(key, state);
    // Una nuova chat (pending) deve conservare la scelta quando riceve l'id definitivo.
    if (key && PG.scope.isPending(key)) tracker.markUsed();
    saveActivation();
    const prev = actState;
    actState = state;
    applyActivation();
    if (prev !== state || trigger === 'banner') {
      event(state === 'on' ? 'extension_enabled' : 'extension_disabled', { per: 'conversation', trigger, from: prev });
    }
    return actState;
  }

  async function toggleProtection(trigger) {
    if (!isPersonal()) {
      PG.ui.toast(S.gestitaDallEnte, 4000);
      return { ok: true, data: { locked: true, state: 'on' } };
    }
    const st = await chooseState(PG.activation.Activation.toggled(actState), trigger);
    PG.ui.toast(st === 'off' ? S.toastDisattivata : S.toastAttivata, 3000);
    return { ok: true, data: { state: st } };
  }

  let lastHref = null;
  let lastInfoKey = null;
  async function checkLocation() {
    const info = adapter.pageInfo(document, location.href);
    const key = `${location.href}|${info.projectId || ''}`;
    if (key === lastInfoKey) return;
    lastInfoKey = key;
    const hrefChanged = lastHref !== location.href;
    lastHref = location.href;
    const res = tracker.update(info);
    if (res.mapProject) {
      projectMap[res.mapProject.conversationId] = res.mapProject.projectId;
      saveMaps();
    }
    if (res.moveConvKey) {
      activation.move(res.moveConvKey.from, res.moveConvKey.to);
      if (actKey === res.moveConvKey.from) actKey = res.moveConvKey.to;
      saveActivation();
      if (instrSent[res.moveConvKey.from]) {
        instrSent[res.moveConvKey.to] = instrSent[res.moveConvKey.from];
        delete instrSent[res.moveConvKey.from];
        saveMaps();
      }
      await bg('pg:moveRecords', { from: res.moveConvKey.from, to: res.moveConvKey.to });
    }
    if (res.rebind) {
      const r = await bg('pg:rebind', { from: res.rebind.from, to: res.rebind.to });
      if (!r.ok && r.status === 409) {
        // Conflitto di tag nella destinazione: la conversazione resta sullo scope pending, così i
        // segnaposto già inviati continuano a essere ripristinati correttamente.
        scopeAlias[res.rebind.to.id] = res.rebind.from.id;
        saveMaps();
        tracker.overrideScope(res.rebind.from);
        event('page_unrecognized', { reason: 'scope_rebind_conflict', site: adapter.id });
        status.banner('warn', null, S.rebindConflitto, { replace: false });
      } else if (!r.ok) {
        event('server_unreachable', { op: 'rebind', error: r.error });
      }
    }
    if (hrefChanged) {
      pageRecognized = true;
      unrecognizedSince = null;
      unrecognizedReported = false;
      updateStatus();
    }
    if (res.changed || res.rebind) {
      await refreshDict(true);
      await loadRecords();
    }
    if (convKey() !== actKey) enterConversation(convKey());
  }

  function selfCheck() {
    const info = tracker.current.info;
    const r = adapter.selfCheck(document, info);
    if (!r.applicable || r.ok) {
      unrecognizedSince = null;
      if (!pageRecognized) {
        pageRecognized = true;
        updateStatus();
      }
      return;
    }
    if (!unrecognizedSince) unrecognizedSince = Date.now();
    if (Date.now() - unrecognizedSince > 8000 && pageRecognized) {
      pageRecognized = false;
      updateStatus();
      if (!unrecognizedReported) {
        unrecognizedReported = true;
        event('page_unrecognized', { site: adapter.id, page: info && info.page, missing: r.missing });
      }
    }
  }

  // --- Istruzione fissa ------------------------------------------------------------------------
  function instructionAlreadySent() {
    const k = convKey();
    if (k && instrSent[k]) return true;
    const head = (cfg.tagInstruction || '').slice(0, 60);
    if (!head) return true;
    return adapter.getUserMessages(document).some((m) => engine.rawTextOf(m).includes(head));
  }

  function markInstructionSent() {
    const k = convKey();
    if (k) {
      instrSent[k] = Date.now();
      saveMaps();
    }
  }

  // --- Pseudonimizzazione di testo -------------------------------------------------------------
  async function handleFailure(error, original) {
    event('server_unreachable', { error });
    if (error === 'auth' && cfg.mode === 'ente') {
      status.banner('error', S.bloccatoTitolo, S.bloccatoAuth);
      return { action: 'abort' };
    }
    if (failClosed()) {
      status.banner('error', S.bloccatoTitolo, error === 'detector_down' ? S.bloccatoDetectorGiu : S.bloccatoServerGiu);
      return { action: 'abort' };
    }
    const personal = cfg.mode !== 'ente';
    const ok = await PG.ui.confirmUnprotected(PG.detectorLite.summarize(original || ''), {
      title: personal ? S.confermaTitoloRizzo : S.confermaTitolo,
      extra: error === 'cors' ? S.confermaCors : personal ? S.statoServizio(cfg.mode, { detector: error === 'cors' ? 'cors' : 'down' }) : null,
    });
    return ok ? { action: 'sendOriginal' } : { action: 'abort' };
  }

  /**
   * @returns {Promise<{action:'send'|'sendOriginal'|'abort', finalText?, sentText?, entities?, traceId?, withInstruction?}>}
   */
  async function pseudonymizeText(original, kind, opts) {
    opts = opts || {};
    const sc = opts.scope || scope();
    if (!sc) return handleFailure('no_scope', original);
    if (!pageRecognized && failClosed() && kind !== 'project_instructions') {
      status.banner('error', S.bloccatoTitolo, S.bloccatoNonRiconosciuto);
      event('page_unrecognized', { site: adapter.id, during: kind });
      return { action: 'abort' };
    }
    const r = await bg('pg:pseudonymize', { scope: sc, kind, text: original });
    if (!r.ok) return handleFailure(r.error, original);
    const d = r.data;
    if (d.blocked) {
      showBlocked(d.blockReason, { kind, category: d.blockCategory, traceId: d.traceId });
      event('blocked', { kind }, d.traceId);
      return { action: 'abort' };
    }
    tracker.markUsed();
    const withInstruction = Boolean(opts.allowInstruction) && !instructionAlreadySent();
    const finalText = (withInstruction ? cfg.tagInstruction + '\n\n' : '') + d.text;
    return { action: 'send', finalText, sentText: d.text, entities: d.entities || [], traceId: d.traceId, withInstruction };
  }

  /** Blocco per categorie particolari: banner con «Segnala blocco errato» (evento senza testo). */
  function showBlocked(reason, info) {
    const block = { kind: info.kind, category: info.category || null, traceId: info.traceId || null, scope: scope(), ts: Date.now() };
    bg('pg:saveBlock', { block });
    status.banner('error', S.bloccatoTitolo, reason || S.bloccatoGenerico, {
      replace: info.replace,
      action: {
        text: S.segnalaBloccoErrato,
        onClick: async () => {
          const r = await bg('pg:event', { event: 'report_false_positive', traceId: block.traceId, scope: block.scope, details: { kind: 'blocked', category: block.category } });
          return r && r.ok ? S.bloccoSegnalato : S.segnalaBloccoErrato;
        },
      },
    });
  }

  async function saveRecord(kind, original, p) {
    const rec = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ts: new Date().toISOString(),
      convKey: convKey(),
      scope: scope(),
      kind,
      original,
      sent: p.sentText,
      withInstruction: p.withInstruction,
      entities: p.entities,
      traceId: p.traceId,
    };
    records.push(rec);
    await bg('pg:saveRecord', { record: rec });
    // Il dizionario locale si arricchisce dei nuovi segnaposto.
    for (const e of p.entities) {
      if (typeof e.start === 'number' && typeof e.end === 'number') dict[e.tag] = original.slice(e.start, e.end);
    }
    engine.setEntries(dict);
    return rec;
  }

  // Il re-invio programmato dopo la pseudonimizzazione non deve essere intercettato di nuovo:
  // l'eccezione vale solo per l'elemento indicato e per mezzo secondo.
  function armBypass(el) {
    bypass = { el: el || null, until: performance.now() + 500 };
  }
  function bypassActive(e) {
    if (!bypass.el || performance.now() > bypass.until) return false;
    const t = e && e.target;
    return Boolean(t && t.nodeType === 1 && (bypass.el === t || bypass.el.contains(t) || t.contains(bypass.el)));
  }

  async function triggerSend(composer) {
    await tick(60);
    let btn = null;
    for (let i = 0; i < 20; i++) {
      btn = adapter.findSendButton(document, composer);
      if (btn && !btn.disabled && btn.getAttribute('aria-disabled') !== 'true') break;
      await tick(50);
    }
    armBypass(btn && !btn.disabled ? btn : composer);
    if (btn && !btn.disabled) btn.click();
    else {
      const ev = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true });
      bypassEvents.add(ev);
      composer.dispatchEvent(ev);
    }
  }

  // --- Invio dalla casella principale ----------------------------------------------------------
  async function handleComposerSend(opts) {
    if (busy) return;
    busy = true;
    status.clearBanners();
    try {
      const composer = adapter.findComposer(document);
      if (!composer) {
        if (failClosed()) status.banner('error', S.bloccatoTitolo, S.bloccatoNonRiconosciuto);
        event('page_unrecognized', { site: adapter.id, missing: ['composer'] });
        return;
      }
      const original = adapter.getComposerText(composer);
      if (!original.trim()) {
        await triggerSend(composer);
        return;
      }
      const p = await pseudonymizeText(original, 'message', { allowInstruction: true });
      if (p.action === 'abort') return;
      if (p.action === 'sendOriginal') {
        approveText(original);
        await triggerSend(composer);
        return;
      }
      if (opts && opts.preview) {
        const ok = await PG.ui.preview(original, p.finalText, p.entities);
        if (!ok) return;
      }
      const ok = await PG.domInput.replaceAllText(composer, p.finalText, (el) => adapter.getComposerText(el));
      if (!ok) {
        event('page_unrecognized', { site: adapter.id, missing: ['composer-write'] });
        if (failClosed()) {
          await PG.domInput.replaceAllText(composer, original, (el) => adapter.getComposerText(el));
          status.banner('error', S.bloccatoTitolo, S.bloccatoVerifica);
          return;
        }
      }
      approveText(p.finalText);
      await saveRecord('message', original, p);
      if (p.withInstruction) markInstructionSent();
      awaiting = { traceId: p.traceId, scope: scope() };
      await triggerSend(composer);
    } finally {
      busy = false;
    }
  }

  // --- Modifica e reinvio ----------------------------------------------------------------------
  async function handleEditSend(field) {
    if (busy) return;
    busy = true;
    status.clearBanners();
    try {
      const original = field.value;
      const save = adapter.findEditSave(field);
      if (!original.trim()) {
        armBypass(save);
        if (save) save.click();
        return;
      }
      const p = await pseudonymizeText(original, 'edit');
      if (p.action === 'abort') return;
      if (p.action === 'send') {
        PG.domInput.setFormControlValue(field, p.finalText);
        approveText(p.finalText);
        await saveRecord('edit', original, p);
        awaiting = { traceId: p.traceId, scope: scope() };
      } else approveText(original);
      await tick(60);
      const btn = adapter.findEditSave(field) || save;
      armBypass(btn);
      if (btn) btn.click();
    } finally {
      busy = false;
    }
  }

  // --- Istruzioni di progetto ------------------------------------------------------------------
  async function handleInstructions(found) {
    if (busy) return;
    busy = true;
    status.clearBanners();
    try {
      const info = tracker.current.info;
      const sc = info && info.projectId ? { type: 'project', id: info.projectId } : scope();
      const instr = cfg.tagInstruction;
      let body = found.field.value;
      if (body.includes(instr)) body = body.replace(instr, '').replace(/^\s+/, '');
      let finalText = instr;
      if (body.trim()) {
        const p = await pseudonymizeText(body, 'project_instructions', { scope: sc });
        if (p.action === 'abort') return;
        const sentBody = p.action === 'send' ? p.sentText : body;
        finalText = instr + '\n\n' + sentBody;
      }
      PG.domInput.setFormControlValue(found.field, finalText);
      approveText(finalText);
      await tick(60);
      const again = adapter.findInstructionsDialog(document);
      const btn = (again && again.save) || found.save;
      armBypass(btn);
      btn.click();
    } finally {
      busy = false;
    }
  }

  // --- File (selettore, trascinamento, incolla) ------------------------------------------------
  async function processFiles(files, kind) {
    const out = [];
    const maxBytes = (cfg.maxFileMB || 20) * 1024 * 1024;
    for (const f of files) {
      if (f.size > maxBytes) {
        status.banner('error', S.bloccatoTitolo, S.fileBloccato(f.name, S.bloccatoFileGrande(cfg.maxFileMB)), { replace: false });
        event('blocked', { kind, reason: 'too_large' });
        continue;
      }
      const buf = await f.arrayBuffer();
      const r = await bg('pg:pseudonymizeFile', {
        scope: scope(), kind, name: f.name, mime: f.type || 'application/octet-stream', b64: b64FromBuffer(buf),
      });
      if (!r.ok) {
        if (r.error === 'too_large') {
          status.banner('error', S.bloccatoTitolo, S.fileBloccato(f.name, S.bloccatoFileGrande(cfg.maxFileMB)), { replace: false });
          continue;
        }
        const fb = await handleFailure(r.error, '');
        if (fb.action === 'sendOriginal') {
          toPage('approveFile', { hash: await sha256Hex(buf) });
          out.push(f);
        }
        continue;
      }
      if (r.data.blocked) {
        showBlocked(S.fileBloccato(f.name, r.data.blockReason || S.bloccatoGenerico), { kind, category: r.data.blockCategory, traceId: r.data.traceId, replace: false });
        event('blocked', { kind }, r.data.traceId);
        continue;
      }
      const bytes = bufferFromB64(r.data.contentB64);
      const nf = new File([bytes], r.data.filename || f.name, { type: r.data.mime || f.type, lastModified: Date.now() });
      toPage('approveFile', { hash: await sha256Hex(bytes) });
      // Il testo di un file testuale già pseudonimizzato può tornare nel corpo della richiesta
      // (es. attachments[].extracted_content): lo si approva per evitare un secondo passaggio.
      if (/^text\/|csv|markdown/.test(r.data.mime || f.type || '')) approveText(new TextDecoder().decode(bytes));
      tracker.markUsed();
      const n = (r.data.entities || []).length;
      PG.ui.toast(`«${nf.name}»: ${S.datiProtetti(n)}`);
      if (r.data.notice) status.banner('info', null, r.data.notice, { replace: false });
      out.push(nf);
    }
    if (out.length) refreshDict(true);
    return out;
  }

  function filesToDataTransfer(files) {
    const dt = new DataTransfer();
    for (const f of files) dt.items.add(f);
    return dt;
  }

  async function onFileInputChange(input) {
    const files = Array.from(input.files || []);
    const kind = adapter.uploadKind(input, tracker.current.info);
    const out = await processFiles(files, kind);
    input.files = filesToDataTransfer(out).files;
    if (!out.length) return;
    input.__pgBypass = true;
    try {
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } finally {
      input.__pgBypass = false;
    }
  }

  function hasFiles(dt) {
    return Boolean(dt && dt.files && dt.files.length);
  }

  async function onDropOrPaste(e, type) {
    const dt = type === 'drop' ? e.dataTransfer : e.clipboardData;
    const files = Array.from(dt.files);
    const kind = adapter.uploadKind(e.target, tracker.current.info);
    const target = e.target;
    const coords = { clientX: e.clientX, clientY: e.clientY };
    const out = await processFiles(files, kind);
    if (!out.length) return;
    const ndt = filesToDataTransfer(out);
    const ev =
      type === 'drop'
        ? new DragEvent('drop', Object.assign({ dataTransfer: ndt, bubbles: true, cancelable: true }, coords))
        : new ClipboardEvent('paste', { clipboardData: ndt, bubbles: true, cancelable: true });
    bypassEvents.add(ev);
    (target.isConnected ? target : document.body).dispatchEvent(ev);
  }

  // --- Ascoltatori (fase di cattura sulla finestra: prima del sito) ----------------------------
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Enter' || e.isComposing || bypassEvents.has(e) || bypassActive(e)) return;
      if (!protectionActive()) {
        // Invio in chiaro da una nuova chat: lo stato «disattivato» deve seguire la conversazione.
        if (cfg && adapter.isComposer(e.target)) tracker.markUsed();
        return;
      }
      const t = e.target;
      if (adapter.isComposer(t)) {
        const preview = (e.ctrlKey || e.metaKey) && e.shiftKey;
        if (e.shiftKey && !preview) return; // a capo
        e.preventDefault();
        e.stopImmediatePropagation();
        handleComposerSend({ preview });
      } else if (adapter.isEditField(t) && !e.shiftKey) {
        e.preventDefault();
        e.stopImmediatePropagation();
        handleEditSend(t);
      }
    },
    true
  );

  function onActivate(e) {
    if (bypassActive(e) || bypassEvents.has(e)) return;
    const t = e.target;
    if (!protectionActive()) {
      if (cfg && e.type === 'click' && adapter.isSendButton(t)) tracker.markUsed();
      return;
    }
    if (adapter.isMicButton(t)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.type === 'click') PG.ui.toast(S.dettaturaBloccata);
      return;
    }
    if (e.type !== 'click') return;
    if (adapter.isSendButton(t)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      handleComposerSend({});
      return;
    }
    const field = adapter.editFieldForButton(t);
    if (field) {
      e.preventDefault();
      e.stopImmediatePropagation();
      handleEditSend(field);
      return;
    }
    const instr = adapter.isInstructionsSave(t);
    if (instr) {
      e.preventDefault();
      e.stopImmediatePropagation();
      handleInstructions(instr);
      return;
    }
    if (adapter.isRetryButton(t)) {
      // Rigenera: Claude reinvia il messaggio già pseudonimizzato; la rete di sicurezza
      // controlla comunque il corpo della richiesta.
      const last = records[records.length - 1];
      awaiting = { traceId: last ? last.traceId : null, scope: scope() };
    }
  }
  window.addEventListener('click', onActivate, true);
  window.addEventListener('pointerdown', onActivate, true);
  window.addEventListener('mousedown', onActivate, true);

  window.addEventListener(
    'submit',
    (e) => {
      if (bypassActive(e) || !protectionActive()) return;
      const composer = adapter.findComposer(document);
      if (composer && e.target && e.target.contains && e.target.contains(composer)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        handleComposerSend({});
      }
    },
    true
  );

  for (const type of ['change', 'input']) {
    window.addEventListener(
      type,
      (e) => {
        const t = e.target;
        if (!t || t.tagName !== 'INPUT' || t.type !== 'file' || t.__pgBypass) return;
        if (!protectionActive() || !t.files || !t.files.length) return;
        e.stopImmediatePropagation();
        if (type === 'change') onFileInputChange(t);
      },
      true
    );
  }

  window.addEventListener(
    'drop',
    (e) => {
      if (bypassEvents.has(e) || !protectionActive() || !hasFiles(e.dataTransfer)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      onDropOrPaste(e, 'drop');
    },
    true
  );

  window.addEventListener(
    'paste',
    (e) => {
      if (bypassEvents.has(e) || !protectionActive() || !hasFiles(e.clipboardData)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      onDropOrPaste(e, 'paste');
    },
    true
  );

  // --- Ponte con il mondo MAIN (rete di sicurezza, appunti, download) --------------------------
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  async function guardText(p) {
    if (!protectionActive()) return { passthrough: true };
    if (approved.has(norm(p.text))) return { passthrough: true };
    if (p.kind === 'project_knowledge') {
      const sc = scope();
      const name = p.fileName || 'testo.txt';
      const r = await bg('pg:pseudonymizeFile', {
        scope: sc, kind: 'project_knowledge', name, mime: 'text/plain',
        b64: b64FromBuffer(new TextEncoder().encode(p.text).buffer),
      });
      if (!r.ok) {
        const fb = await handleFailure(r.error, p.text);
        return fb.action === 'sendOriginal' ? { passthrough: true } : { blocked: true, reason: r.error };
      }
      if (r.data.blocked) {
        showBlocked(r.data.blockReason, { kind: 'project_knowledge', category: r.data.blockCategory, traceId: r.data.traceId });
        event('blocked', { kind: 'project_knowledge' }, r.data.traceId);
        return { blocked: true, reason: 'blocked' };
      }
      tracker.markUsed();
      return { text: new TextDecoder().decode(bufferFromB64(r.data.contentB64)) };
    }
    const isPrompt = p.field === 'prompt' && p.kind === 'message';
    const res = await pseudonymizeText(p.text, p.kind, { allowInstruction: isPrompt });
    if (res.action === 'abort') return { blocked: true, reason: 'abort' };
    if (res.action === 'sendOriginal') return { passthrough: true };
    if (isPrompt) {
      await saveRecord('message', p.text, res);
      if (res.withInstruction) markInstructionSent();
      awaiting = { traceId: res.traceId, scope: scope() };
    }
    return { text: res.finalText };
  }

  async function guardFile(p) {
    if (!protectionActive()) return { passthrough: true };
    const kind = adapter.uploadKind(document.activeElement || document.body, tracker.current.info);
    const file = new File([p.bytes], p.name, { type: p.type });
    const out = await processFiles([file], kind);
    if (!out.length) return { blocked: true, reason: 'blocked' };
    if (out[0] === file) return { passthrough: true };
    return { bytes: await out[0].arrayBuffer(), name: out[0].name, type: out[0].type };
  }

  function restoreClipboard(p) {
    // Solo su gesto dell'utente e solo per segnaposto già mostrati in questa pagina.
    if (navigator.userActivation && !navigator.userActivation.isActive) return { text: p.text };
    const allowed = {};
    for (const t of visibleTags) if (Object.prototype.hasOwnProperty.call(dict, t)) allowed[t] = p.html ? escapeHtml(dict[t]) : dict[t];
    return { text: PG.tags.restoreText(p.text, allowed).text };
  }

  async function reidentifyFile(p) {
    // Ripristino in entrata: sempre attivo, anche con la protezione in uscita disattivata.
    if (!cfg || !scope()) return { handled: false };
    const r = await bg('pg:reidentifyFile', {
      scope: scope(), name: p.name, mime: p.type || 'application/octet-stream', b64: b64FromBuffer(p.bytes),
    });
    if (!r.ok || !r.data || !r.data.contentB64) {
      PG.ui.toast('Download senza ripristino dei dati reali: ' + ((r.data && r.data.blockReason) || r.message || r.error || 'formato non supportato'), 6000);
      return { handled: false };
    }
    const blob = new Blob([bufferFromB64(r.data.contentB64)], { type: r.data.mime || p.type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = r.data.filename || p.name;
    // Ancora non inserita nel documento (e marcata) così l'intercettazione nel mondo MAIN non la vede.
    a.setAttribute('data-pg-ui', 'download');
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return { handled: true };
  }

  window.addEventListener('message', async (ev) => {
    if (ev.source !== window) return;
    const d = ev.data;
    if (!d || d.source !== 'pseudogate-page') return;
    if (d.op === 'hello') return postStateToPage();
    if (d.op === 'nav') return void (domStarted && checkLocation());
    if (d.op === 'micBlocked') return PG.ui.toast(S.dettaturaBloccata);
    if (d.op === 'blockedNotice') {
      if (d.payload && d.payload.reason === 'not_ready') status.banner('error', S.bloccatoTitolo, S.bloccatoNonRiconosciuto);
      return;
    }
    let result;
    try {
      if (d.op === 'guardText') result = await guardText(d.payload);
      else if (d.op === 'guardFile') result = await guardFile(d.payload);
      else if (d.op === 'restoreClipboard') result = restoreClipboard(d.payload);
      else if (d.op === 'reidentifyFile') result = await reidentifyFile(d.payload);
      else return;
    } catch (e) {
      result = { error: String(e && e.message) };
    }
    toPage('reply', { id: d.id, result });
  });

  // --- Risposte complete -----------------------------------------------------------------------
  async function onResponseComplete(info) {
    if (!awaiting) return;
    let unknown = info.unknown;
    if (unknown.length) {
      await refreshDict(true);
      unknown = unknown.filter((t) => !Object.prototype.hasOwnProperty.call(dict, t));
    }
    event('response_received', { textPseudonymized: info.raw, unknownTags: unknown }, awaiting.traceId);
    awaiting = null;
    if (unknown.length) status.banner('warn', null, S.segnapostoSconosciutiAvviso(unknown.length), { replace: false });
  }

  // --- Contrassegni «dati protetti» ------------------------------------------------------------
  let badgeTimer = null;
  function scheduleBadges() {
    if (badgeTimer) return;
    badgeTimer = setTimeout(() => {
      badgeTimer = null;
      attachBadges();
    }, 300);
  }

  function findRecordFor(raw) {
    const n = norm(raw);
    for (let i = records.length - 1; i >= 0; i--) {
      const s = norm(records[i].sent);
      if (s && (n === s || n.endsWith(s) || n.includes(s))) return records[i];
    }
    return null;
  }

  function attachBadges() {
    for (const m of adapter.getUserMessages(document)) {
      const existing = badges.get(m);
      if (existing && existing.isConnected) continue;
      const rec = findRecordFor(engine.rawTextOf(m));
      if (!rec) continue;
      const count = new Set(rec.entities.map((e) => e.tag)).size;
      const el = PG.ui.badge(count, () => bg('pg:openInspection', { recordId: rec.id, convKey: rec.convKey, scope: rec.scope }));
      m.appendChild(el);
      badges.set(m, el);
    }
  }

  // --- Richieste dal pannello laterale ---------------------------------------------------------
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === 'pg:getRawResponses') {
      const responses = adapter.getAssistantMessages(document).map((m) => engine.rawTextOf(m));
      sendResponse({ ok: true, data: { responses, scope: scope(), convKey: convKey() } });
    } else if (msg && msg.type === 'pg:refresh') {
      Promise.all([refreshDict(true), loadRecords()]).then(() => sendResponse({ ok: true }));
      return true;
    } else if (msg && msg.type === 'pg:getPageScope') {
      sendResponse({ ok: true, data: { scope: scope(), convKey: convKey(), activation: actState } });
    } else if (msg && msg.type === 'pg:toggleProtection') {
      toggleProtection(msg.trigger || 'toolbar').then(sendResponse);
      return true;
    } else if (msg && msg.type === 'pg:getActivation') {
      sendResponse({ ok: true, data: { state: isPersonal() ? actState : 'locked', convKey: convKey() } });
    }
    return false;
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.pgState) applyState(changes.pgState.newValue);
    // Scelta fatta in un'altra scheda sulla stessa conversazione.
    if (area === 'local' && changes.pgActivation && changes.pgActivation.newValue) {
      activation = new PG.activation.Activation(changes.pgActivation.newValue);
      const st = activation.states[actKey];
      if (isPersonal() && actKey && st && st !== actState && !(actState === 'ask' && st === 'off')) {
        actState = st;
        applyActivation();
      }
    }
  });

  // --- Avvio -----------------------------------------------------------------------------------
  async function boot() {
    await loadStoredMaps();
    const st = await bg('pg:getState');
    if (st.ok) applyState(st.data);
    else {
      cfg = PG.config.toPlain(PG.config.resolveConfig({}));
      health = { ok: false };
      postStateToPage();
      updateStatus();
    }
    const startDom = async () => {
      domStarted = true;
      engine.start();
      await checkLocation();
      setInterval(() => {
        checkLocation();
        selfCheck();
        const composer = adapter.findComposer(document);
        if (composer) status.attach(adapter.composerAnchor(composer));
      }, 500);
    };
    if (document.body) startDom();
    else document.addEventListener('DOMContentLoaded', startDom, { once: true });
  }

  boot();
})();
