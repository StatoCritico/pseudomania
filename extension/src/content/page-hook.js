// SPDX-License-Identifier: Apache-2.0 AND AGPL-3.0-or-later
//
// Eseguito nel mondo MAIN della pagina (manifest: "world": "MAIN", run_at document_start).
// La parte sugli appunti deriva da Privacy Guardrail, src/content/clipboard-interceptor-page.ts,
// Copyright 2026 DFKI GmbH (Apache-2.0). Modifiche Copyright (C) 2026 gli autori di Pseudomania
// (AGPL-3.0-or-later): riscritto in JS; la scrittura negli appunti viene sostituita con il testo
// ripristinato; aggiunti la rete di sicurezza su fetch/XMLHttpRequest e l'intercettazione dei download.
//
// RETE DI SICUREZZA: ogni richiesta verso gli endpoint elencati nelle regole dell'adattatore
// (NETWORK_RULES in src/sites/claude.js) viene esaminata prima di partire. Il testo/i file non
// già approvati dallo strato DOM vengono pseudonimizzati attraverso lo script di contenuto
// (che parla con il server); se ciò non è possibile la richiesta viene bloccata.
// Questo script NON riceve mai il dizionario; riceve valori reali solo per gli appunti, e solo
// per segnaposto già visibili nella pagina, su gesto dell'utente.

(function () {
  'use strict';
  if (window.__pseudogateHook) return;
  Object.defineProperty(window, '__pseudogateHook', { value: true });

  const SRC_PAGE = 'pseudogate-page';
  const SRC_CONTENT = 'pseudogate-content';
  const TAG_RE = /\[[A-Z]+(?:_[A-Z]+)*_\d+\]/;

  const origFetch = window.fetch;
  const origXhrOpen = XMLHttpRequest.prototype.open;
  const origXhrSend = XMLHttpRequest.prototype.send;
  const origAnchorClick = HTMLAnchorElement.prototype.click;
  const origCreateObjectURL = URL.createObjectURL;
  const origRevokeObjectURL = URL.revokeObjectURL;
  const origPostMessage = window.postMessage.bind(window);

  // enabled = protezione in uscita; inbound = ripristino (appunti, download), sempre attivo
  let state = { enabled: true, inbound: true, rules: [] };
  let readyResolve;
  const ready = new Promise((r) => (readyResolve = r));
  let isReady = false;
  const approvedTexts = new Set();
  const approvedFiles = new Set();
  const pendingCalls = new Map();
  let nextId = 1;

  // Stessa normalizzazione di PG.tags.normalizeForCompare (src/shared/tags.js): tenerle allineate.
  function norm(text) {
    return String(text || '').normalize('NFC').replace(/[\s*_`#>~\- ​]+/g, '').toLowerCase();
  }

  function cap(set, max) {
    if (set.size > max) set.delete(set.values().next().value);
  }

  // --- Ponte con lo script di contenuto ---------------------------------------------------------
  window.addEventListener('message', (ev) => {
    if (ev.source !== window) return;
    const d = ev.data;
    if (!d || d.source !== SRC_CONTENT) return;
    if (d.op === 'state') {
      state = d.state;
      if (!isReady) {
        isReady = true;
        readyResolve();
      }
    } else if (d.op === 'approve') {
      approvedTexts.add(norm(d.text));
      cap(approvedTexts, 300);
    } else if (d.op === 'approveFile') {
      approvedFiles.add(d.hash);
      cap(approvedFiles, 300);
    } else if (d.op === 'reply') {
      const p = pendingCalls.get(d.id);
      if (p) {
        pendingCalls.delete(d.id);
        p(d.result);
      }
    }
  });

  function call(op, payload, timeoutMs) {
    return new Promise((resolve) => {
      const id = `pg${Date.now()}_${nextId++}`;
      pendingCalls.set(id, resolve);
      const transfer = payload && payload.bytes instanceof ArrayBuffer ? [] : undefined;
      origPostMessage({ source: SRC_PAGE, id, op, payload }, '*', transfer);
      setTimeout(() => {
        if (pendingCalls.has(id)) {
          pendingCalls.delete(id);
          resolve({ error: 'timeout' });
        }
      }, timeoutMs || 120000);
    });
  }

  origPostMessage({ source: SRC_PAGE, op: 'hello' }, '*');

  async function waitReady() {
    if (isReady) return true;
    const t = new Promise((r) => setTimeout(() => r(false), 10000));
    return Promise.race([ready.then(() => true), t]);
  }

  // --- Regole -----------------------------------------------------------------------------------
  function matchRule(url, method) {
    let u;
    try {
      u = new URL(url, location.href);
    } catch (_) {
      return null;
    }
    if (u.origin !== location.origin) return null;
    method = (method || 'GET').toUpperCase();
    for (const r of state.rules || []) {
      if (!r.methods.includes(method)) continue;
      if (new RegExp(r.path).test(u.pathname)) return r;
    }
    return null;
  }

  function getPaths(obj, path) {
    // Restituisce [{get, set}] per un percorso tipo "attachments.*.extracted_content".
    const parts = path.split('.');
    let refs = [{ parent: null, key: null, value: obj }];
    for (const p of parts) {
      const next = [];
      for (const r of refs) {
        const v = r.value;
        if (v == null || typeof v !== 'object') continue;
        if (p === '*') {
          if (Array.isArray(v)) v.forEach((item, i) => next.push({ parent: v, key: i, value: item }));
        } else if (Object.prototype.hasOwnProperty.call(v, p)) {
          next.push({ parent: v, key: p, value: v[p] });
        }
      }
      refs = next;
    }
    return refs.filter((r) => typeof r.value === 'string');
  }

  class Blocked extends Error {}

  async function guardJson(rule, bodyText) {
    let obj;
    try {
      obj = JSON.parse(bodyText);
    } catch (_) {
      return bodyText; // non JSON: nessun campo noto
    }
    let changed = false;
    for (const f of rule.fields || []) {
      for (const ref of getPaths(obj, f)) {
        const text = ref.value;
        if (!text.trim() || approvedTexts.has(norm(text))) continue;
        const fileName = rule.fileNameField && typeof obj[rule.fileNameField] === 'string' ? obj[rule.fileNameField] : null;
        const res = await call('guardText', { kind: rule.kind, ruleId: rule.id, field: f, text, fileName });
        if (!res || res.blocked || res.error) throw new Blocked((res && (res.reason || res.error)) || 'blocked');
        if (res.passthrough) continue;
        ref.parent[ref.key] = res.text;
        approvedTexts.add(norm(res.text));
        changed = true;
      }
    }
    return changed ? JSON.stringify(obj) : bodyText;
  }

  async function sha256Hex(buf) {
    const d = await crypto.subtle.digest('SHA-256', buf);
    return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  async function guardForm(rule, form) {
    const out = new FormData();
    let changed = false;
    for (const [k, v] of form.entries()) {
      if (typeof v === 'string' || !(v instanceof Blob)) {
        out.append(k, v);
        continue;
      }
      const bytes = await v.arrayBuffer();
      const hash = await sha256Hex(bytes);
      if (approvedFiles.has(hash)) {
        out.append(k, v, v.name);
        continue;
      }
      const res = await call('guardFile', { name: v.name || 'file', type: v.type, bytes });
      if (!res || res.blocked || res.error) throw new Blocked((res && (res.reason || res.error)) || 'blocked');
      if (res.passthrough) {
        out.append(k, v, v.name);
        continue;
      }
      const f = new File([res.bytes], res.name || v.name, { type: res.type || v.type });
      approvedFiles.add(await sha256Hex(res.bytes));
      out.append(k, f, f.name);
      changed = true;
    }
    return changed ? out : form;
  }

  async function guardBody(rule, body) {
    if (body == null) return body;
    if (rule.formFiles) {
      if (body instanceof FormData) return guardForm(rule, body);
      if (body instanceof Blob && !(typeof body.type === 'string' && body.type.includes('json'))) {
        // Caricamento di un Blob grezzo: trattato come file.
        const fd = new FormData();
        fd.append('file', body, body.name || 'file');
        const g = await guardForm(rule, fd);
        return g === fd ? body : g.get('file');
      }
    }
    if (rule.fields) {
      if (typeof body === 'string') return guardJson(rule, body);
      if (body instanceof Blob) return guardJson(rule, await body.text());
    }
    return body;
  }

  function notifyBlocked(reason, ruleId) {
    origPostMessage({ source: SRC_PAGE, op: 'blockedNotice', payload: { reason, ruleId } }, '*');
  }

  // --- fetch ------------------------------------------------------------------------------------
  window.fetch = async function pseudogateFetch(input, init) {
    const url = typeof input === 'string' || input instanceof URL ? String(input) : input && input.url;
    const method = (init && init.method) || (input instanceof Request ? input.method : 'GET');
    // Le regole arrivano con lo stato: prima di allora qualunque POST/PUT/PATCH verso /api/ attende.
    const mutating = /^(POST|PUT|PATCH)$/i.test(method || '');
    if (!mutating) return origFetch.apply(this, arguments);
    let u;
    try {
      u = new URL(url, location.href);
    } catch (_) {
      return origFetch.apply(this, arguments);
    }
    if (u.origin !== location.origin || !u.pathname.startsWith('/api/')) return origFetch.apply(this, arguments);
    if (!(await waitReady())) {
      notifyBlocked('not_ready', null);
      throw new TypeError('Pseudomania: estensione non pronta, invio bloccato');
    }
    if (!state.enabled) return origFetch.apply(this, arguments);
    const rule = matchRule(url, method);
    if (!rule) return origFetch.apply(this, arguments);

    try {
      if (input instanceof Request && !(init && 'body' in init)) {
        const ct = input.headers.get('content-type') || '';
        let body;
        if (ct.includes('multipart/form-data')) body = await input.clone().formData();
        else body = await input.clone().text();
        const nb = await guardBody(rule, body);
        if (nb === body) return origFetch.call(this, input, init);
        const headers = new Headers(input.headers);
        if (nb instanceof FormData) headers.delete('content-type');
        return origFetch.call(this, new Request(input, { body: nb, headers }), init);
      }
      const body = init && init.body;
      const nb = await guardBody(rule, body);
      if (nb === body) return origFetch.call(this, input, init);
      const ninit = Object.assign({}, init, { body: nb });
      if (nb instanceof FormData && ninit.headers) {
        const hd = new Headers(ninit.headers);
        hd.delete('content-type');
        ninit.headers = hd;
      }
      return origFetch.call(this, input, ninit);
    } catch (e) {
      if (e instanceof Blocked) {
        notifyBlocked(e.message, rule.id);
        throw new TypeError('Pseudomania: invio bloccato');
      }
      throw e;
    }
  };

  // --- XMLHttpRequest (caricamenti con barra di avanzamento) -----------------------------------
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__pg = { method, url };
    return origXhrOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (body) {
    const info = this.__pg || {};
    const xhr = this;
    const mutating = /^(POST|PUT|PATCH)$/i.test(info.method || '');
    let u = null;
    try {
      u = new URL(info.url, location.href);
    } catch (_) { /* ignora */ }
    if (!mutating || !u || u.origin !== location.origin || !u.pathname.startsWith('/api/')) {
      return origXhrSend.apply(this, arguments);
    }
    const fail = (reason, ruleId) => {
      notifyBlocked(reason, ruleId);
      xhr.dispatchEvent(new ProgressEvent('error'));
      xhr.dispatchEvent(new ProgressEvent('loadend'));
    };
    (async () => {
      if (!(await waitReady())) return fail('not_ready', null);
      const rule = state.enabled ? matchRule(info.url, info.method) : null;
      if (!rule) return origXhrSend.call(xhr, body);
      try {
        const nb = await guardBody(rule, body);
        origXhrSend.call(xhr, nb);
      } catch (e) {
        if (e instanceof Blocked) fail(e.message, rule.id);
        else origXhrSend.call(xhr, body);
      }
    })();
  };

  // --- Appunti: i pulsanti «Copia» del sito copiano il testo con i segnaposto -----------------
  const clipboard = navigator.clipboard;
  if (clipboard && typeof clipboard.writeText === 'function') {
    const origWriteText = clipboard.writeText.bind(clipboard);
    const origWrite = typeof clipboard.write === 'function' ? clipboard.write.bind(clipboard) : null;
    const patchedWriteText = async function (text) {
      if (state.inbound !== false && typeof text === 'string' && TAG_RE.test(text)) {
        const res = await call('restoreClipboard', { text }, 3000);
        if (res && typeof res.text === 'string') return origWriteText(res.text);
      }
      return origWriteText(text);
    };
    const patchedWrite = async function (items) {
      if (state.inbound === false || !origWrite) return origWrite(items);
      try {
        const out = [];
        for (const item of items || []) {
          const parts = {};
          let touched = false;
          for (const type of item.types) {
            const blob = await item.getType(type);
            if (type === 'text/plain' || type === 'text/html') {
              const t = await blob.text();
              if (TAG_RE.test(t)) {
                const res = await call('restoreClipboard', { text: t, html: type === 'text/html' }, 3000);
                if (res && typeof res.text === 'string') {
                  parts[type] = new Blob([res.text], { type });
                  touched = true;
                  continue;
                }
              }
            }
            parts[type] = blob;
          }
          out.push(touched ? new ClipboardItem(parts) : item);
        }
        return origWrite(out);
      } catch (_) {
        return origWrite(items);
      }
    };
    for (const target of [clipboard, Object.getPrototypeOf(clipboard)]) {
      try {
        Object.defineProperty(target, 'writeText', { value: patchedWriteText, writable: true, configurable: true });
        if (origWrite) Object.defineProperty(target, 'write', { value: patchedWrite, writable: true, configurable: true });
      } catch (_) { /* proprietà bloccata */ }
    }
  }

  // --- Navigazione SPA: avvisa subito lo script di contenuto (cambio di chat senza ricaricare) ---
  for (const fn of ['pushState', 'replaceState']) {
    const orig = history[fn];
    history[fn] = function () {
      const r = orig.apply(this, arguments);
      origPostMessage({ source: SRC_PAGE, op: 'nav' }, '*');
      return r;
    };
  }
  window.addEventListener('popstate', () => origPostMessage({ source: SRC_PAGE, op: 'nav' }, '*'));

  // --- Microfono / dettatura: negati finché la protezione è attiva ------------------------------
  const md = navigator.mediaDevices;
  if (md && typeof md.getUserMedia === 'function') {
    const origGUM = md.getUserMedia.bind(md);
    const patchedGUM = function (constraints) {
      if (state.enabled && constraints && constraints.audio) {
        origPostMessage({ source: SRC_PAGE, op: 'micBlocked' }, '*');
        return Promise.reject(new DOMException('Microfono disattivato da Pseudomania', 'NotAllowedError'));
      }
      return origGUM(constraints);
    };
    try {
      Object.defineProperty(md, 'getUserMedia', { value: patchedGUM, writable: true, configurable: true });
    } catch (_) { /* ignora */ }
  }
  for (const name of ['SpeechRecognition', 'webkitSpeechRecognition']) {
    const SR = window[name];
    if (typeof SR !== 'function' || !SR.prototype) continue;
    const origStart = SR.prototype.start;
    SR.prototype.start = function () {
      if (state.enabled) {
        origPostMessage({ source: SRC_PAGE, op: 'micBlocked' }, '*');
        throw new DOMException('Dettatura disattivata da Pseudomania', 'NotAllowedError');
      }
      return origStart.apply(this, arguments);
    };
  }

  // --- Download di artifact e file generati -----------------------------------------------------
  const blobs = new Map(); // blob: URL -> Blob (tenuti 2 minuti)
  URL.createObjectURL = function (obj) {
    const url = origCreateObjectURL.call(URL, obj);
    if (obj instanceof Blob) {
      blobs.set(url, obj);
      setTimeout(() => blobs.delete(url), 120000);
    }
    return url;
  };
  URL.revokeObjectURL = function (url) {
    // Ritarda la revoca: il download intercettato legge il Blob in modo asincrono.
    setTimeout(() => origRevokeObjectURL.call(URL, url), 60000);
  };

  async function readHref(href) {
    if (blobs.has(href)) return blobs.get(href);
    const u = new URL(href, location.href);
    if (u.protocol === 'blob:' || u.protocol === 'data:' || u.origin === location.origin) {
      const r = await origFetch(href, { credentials: 'include' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.blob();
    }
    return null; // origine esterna: non gestito
  }

  async function interceptDownload(a) {
    try {
      const blob = await readHref(a.href);
      if (!blob) return false;
      const bytes = await blob.arrayBuffer();
      const name = a.getAttribute('download') || decodeURIComponent((a.pathname || '').split('/').pop() || 'file');
      const res = await call('reidentifyFile', { name, type: blob.type, bytes }, 120000);
      return Boolean(res && res.handled);
    } catch (_) {
      return false;
    }
  }

  function isDownloadAnchor(a) {
    return a && a.hasAttribute && a.hasAttribute('download') && !a.hasAttribute('data-pg-ui') && a.href;
  }

  HTMLAnchorElement.prototype.click = function () {
    if (state.inbound === false || !isDownloadAnchor(this) || this.__pgPass) return origAnchorClick.apply(this, arguments);
    const a = this;
    interceptDownload(a).then((handled) => {
      if (!handled) {
        a.__pgPass = true;
        origAnchorClick.call(a);
        a.__pgPass = false;
      }
    });
  };

  document.addEventListener(
    'click',
    (ev) => {
      if (state.inbound === false) return;
      const a = ev.target && ev.target.closest ? ev.target.closest('a[download]') : null;
      if (!a || a.__pgPass || !isDownloadAnchor(a)) return;
      ev.preventDefault();
      ev.stopImmediatePropagation();
      interceptDownload(a).then((handled) => {
        if (!handled) {
          a.__pgPass = true;
          origAnchorClick.call(a);
          a.__pgPass = false;
        }
      });
    },
    true
  );
})();
