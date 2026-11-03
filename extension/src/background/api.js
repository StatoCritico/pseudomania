// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 gli autori di Pseudomania
//
// Client delle API del server Pseudomania (SPEC.md, «API»). Restituisce sempre un oggetto
// {ok:true, status, data} oppure {ok:false, error, status, message} con error in:
//   not_configured | unreachable | auth | conflict | too_large | detector_down | http

(function (root) {
  'use strict';
  const PG = (root.PG = root.PG || {});

  function b64ToBlob(b64, mime) {
    const s = atob(b64);
    const a = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
    return new Blob([a], { type: mime || 'application/octet-stream' });
  }

  async function request(cfg, path, opts) {
    opts = opts || {};
    if (!cfg.serverUrl) return { ok: false, error: 'not_configured' };
    const headers = {};
    if (opts.auth !== false) {
      const token = await PG.auth.getToken(cfg, { interactive: opts.interactive !== false, forceRefresh: opts.forceRefresh });
      if (!token) return { ok: false, error: 'auth' };
      headers.Authorization = `Bearer ${token}`;
    }
    let body;
    if (opts.json !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(opts.json);
    } else if (opts.form) {
      body = new FormData();
      for (const [k, v] of Object.entries(opts.form)) {
        if (v && typeof v === 'object' && v.b64 !== undefined) body.append(k, b64ToBlob(v.b64, v.mime), v.name);
        else body.append(k, String(v));
      }
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeout || 30000);
    let r;
    try {
      r = await fetch(cfg.serverUrl + path, { method: opts.method || 'GET', headers, body, signal: ctrl.signal, credentials: 'omit' });
    } catch (e) {
      return { ok: false, error: 'unreachable', message: String(e && e.message) };
    } finally {
      clearTimeout(timer);
    }
    if (r.status === 401 && opts.auth !== false && cfg.authMethod === 'oidc' && !opts.forceRefresh) {
      return request(cfg, path, Object.assign({}, opts, { forceRefresh: true }));
    }
    let data = null;
    if (r.status !== 204) {
      try {
        data = await r.json();
      } catch (_) {
        data = null;
      }
    }
    if (r.ok) return { ok: true, status: r.status, data };
    const message = (data && data.message) || r.statusText;
    if (r.status === 401) return { ok: false, error: 'auth', status: 401, message };
    if (r.status === 409) return { ok: false, error: 'conflict', status: 409, message };
    if (r.status === 413) return { ok: false, error: 'too_large', status: 413, message };
    if (r.status === 503) return { ok: false, error: 'detector_down', status: 503, message };
    if (r.status >= 500 || r.status === 502 || r.status === 504) return { ok: false, error: 'unreachable', status: r.status, message };
    return { ok: false, error: 'http', status: r.status, message, code: data && data.error };
  }

  const api = {
    health: (cfg) => request(cfg, '/v1/health', { auth: false, timeout: 5000 }),
    config: (cfg, interactive) => request(cfg, '/v1/config', { interactive }),
    pseudonymize: (cfg, scope, kind, text) =>
      request(cfg, '/v1/pseudonymize', { method: 'POST', json: { scope, site: 'claude.ai', kind, text } }),
    pseudonymizeFile: (cfg, scope, kind, file) =>
      request(cfg, '/v1/pseudonymize/file', {
        method: 'POST', timeout: 180000,
        form: { scope_type: scope.type, scope_id: scope.id, site: 'claude.ai', kind, file },
      }),
    dictionary: (cfg, scope) =>
      request(cfg, `/v1/dictionary?scope_type=${encodeURIComponent(scope.type)}&scope_id=${encodeURIComponent(scope.id)}`),
    // entries = {tag: valore} già decifrato nel browser (DECISIONI, deviazione 4)
    reidentifyFile: (cfg, scope, file, entries) =>
      request(cfg, '/v1/reidentify/file', {
        method: 'POST', timeout: 180000,
        form: { scope_type: scope.type, scope_id: scope.id, entries: JSON.stringify(entries || {}), file },
      }),
    uploadEntries: (cfg, scope, entries) => request(cfg, '/v1/dictionary/entries', { method: 'POST', json: { scope, entries } }),
    rekeyGet: (cfg, keyId, after, limit) =>
      request(cfg, `/v1/dictionary/rekey?key_id=${encodeURIComponent(keyId)}&after=${encodeURIComponent(after || 0)}&limit=${limit || 500}`),
    rekeyPut: (cfg, body) => request(cfg, '/v1/dictionary/rekey', { method: 'PUT', json: body, timeout: 120000 }),
    escrow: (cfg, body) => request(cfg, '/v1/keys/escrow', { method: 'POST', json: body }),
    deviceKey: (cfg, publicKey) => request(cfg, '/v1/keys/device', { method: 'POST', json: { publicKey } }),
    recoveredKeys: (cfg) => request(cfg, '/v1/keys/recovered'),
    confirmScope: (cfg, scope) =>
      request(cfg, `/v1/scopes/${encodeURIComponent(scope.type)}/${encodeURIComponent(scope.id)}/confirm`, { method: 'POST' }),
    rebind: (cfg, from, to) => request(cfg, '/v1/scopes/rebind', { method: 'POST', json: { from, to } }),
    deleteScope: (cfg, scope) =>
      request(cfg, `/v1/scopes/${encodeURIComponent(scope.type)}/${encodeURIComponent(scope.id)}`, { method: 'DELETE' }),
    source: (cfg) => request(cfg, '/v1/source', { auth: false, timeout: 5000 }),
    event: (cfg, body) => request(cfg, '/v1/events', { method: 'POST', json: body, interactive: false }),
  };

  PG.api = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
