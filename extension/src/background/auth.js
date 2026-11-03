// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 gli autori di Pseudomania
//
// Autenticazione verso il server Pseudomania.
//  - modalità ente: OIDC authorization code + PKCE (S256) con chrome.identity.launchWebAuthFlow;
//    token in chrome.storage.session (memoria, cancellati alla chiusura del browser), rinnovo con
//    refresh_token. URI di reindirizzamento: chrome.identity.getRedirectURL('oidc'), cioè
//    https://<id-estensione>.chromiumapp.org/oidc (da registrare sul provider di identità).
//  - Personal edition: nessun server, nessuna autenticazione.
//  - Sviluppo/test: `devStaticToken` da pgDevManaged (solo installazioni decompresse).

(function (root) {
  'use strict';
  const PG = (root.PG = root.PG || {});

  const KEY = 'pgOidcTokens';
  let inflight = null;
  let discoveryCache = null;

  function b64url(bytes) {
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function randomString(n) {
    const a = new Uint8Array(n);
    crypto.getRandomValues(a);
    return b64url(a);
  }

  async function pkcePair() {
    const verifier = randomString(48);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    return { verifier, challenge: b64url(new Uint8Array(digest)) };
  }

  async function discovery(issuer) {
    if (discoveryCache && discoveryCache.issuer === issuer) return discoveryCache.doc;
    const r = await fetch(`${issuer}/.well-known/openid-configuration`);
    if (!r.ok) throw new Error('discovery ' + r.status);
    const doc = await r.json();
    discoveryCache = { issuer, doc };
    return doc;
  }

  async function saveTokens(tok) {
    const now = Date.now();
    const stored = {
      access_token: tok.access_token,
      id_token: tok.id_token || null,
      refresh_token: tok.refresh_token || null,
      expires_at: now + (Number(tok.expires_in) || 300) * 1000,
    };
    await chrome.storage.session.set({ [KEY]: stored });
    return stored;
  }

  async function loadTokens() {
    const r = await chrome.storage.session.get(KEY);
    return r[KEY] || null;
  }

  function pickToken(cfg, t) {
    return cfg.oidc.tokenType === 'id_token' ? t.id_token || t.access_token : t.access_token;
  }

  async function tokenRequest(endpoint, params) {
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
    });
    if (!r.ok) throw new Error('token ' + r.status);
    return r.json();
  }

  async function login(cfg, interactive) {
    const d = await discovery(cfg.oidc.issuer);
    const { verifier, challenge } = await pkcePair();
    const state = randomString(16);
    const nonce = randomString(16);
    const redirectUri = chrome.identity.getRedirectURL('oidc');
    const url = new URL(d.authorization_endpoint);
    url.search = new URLSearchParams({
      response_type: 'code',
      client_id: cfg.oidc.clientId,
      redirect_uri: redirectUri,
      scope: cfg.oidc.scopes.includes('openid') ? cfg.oidc.scopes : 'openid ' + cfg.oidc.scopes,
      state,
      nonce,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      ...(interactive ? {} : { prompt: 'none' }),
    }).toString();
    const resp = await chrome.identity.launchWebAuthFlow({ url: url.toString(), interactive: Boolean(interactive) });
    const back = new URL(resp);
    const params = back.searchParams.has('code') ? back.searchParams : new URLSearchParams(back.hash.slice(1));
    if (params.get('state') !== state) throw new Error('state non valido');
    if (params.get('error')) throw new Error(params.get('error'));
    const tok = await tokenRequest(d.token_endpoint, {
      grant_type: 'authorization_code',
      code: params.get('code'),
      redirect_uri: redirectUri,
      client_id: cfg.oidc.clientId,
      code_verifier: verifier,
    });
    return saveTokens(tok);
  }

  async function refresh(cfg, t) {
    const d = await discovery(cfg.oidc.issuer);
    const tok = await tokenRequest(d.token_endpoint, {
      grant_type: 'refresh_token',
      refresh_token: t.refresh_token,
      client_id: cfg.oidc.clientId,
    });
    if (!tok.refresh_token) tok.refresh_token = t.refresh_token;
    return saveTokens(tok);
  }

  /**
   * @returns {Promise<string|null>} token Bearer, oppure null se non disponibile
   */
  async function getToken(cfg, opts) {
    opts = opts || {};
    if (cfg.devStaticToken) return cfg.devStaticToken; // solo installazioni decompresse di sviluppo
    if (cfg.authMethod !== 'oidc') return null;
    if (!cfg.oidc.issuer || !cfg.oidc.clientId) return null;
    let t = await loadTokens();
    if (t && !opts.forceRefresh && t.expires_at - 60000 > Date.now()) return pickToken(cfg, t);
    if (inflight) return inflight;
    inflight = (async () => {
      try {
        if (t && t.refresh_token) {
          try {
            t = await refresh(cfg, t);
            return pickToken(cfg, t);
          } catch (_) { /* si prova il login */ }
        }
        try {
          t = await login(cfg, false);
          return pickToken(cfg, t);
        } catch (_) {
          if (!opts.interactive) return null;
        }
        t = await login(cfg, true);
        return pickToken(cfg, t);
      } catch (_) {
        return null;
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  }

  async function status(cfg) {
    if (cfg.devStaticToken) return { needed: false, loggedIn: true };
    if (cfg.authMethod !== 'oidc') return { needed: false, loggedIn: false };
    const t = await loadTokens();
    const loggedIn = Boolean(t && (t.expires_at > Date.now() || t.refresh_token));
    return { needed: !loggedIn, loggedIn };
  }

  async function logout() {
    await chrome.storage.session.remove(KEY);
  }

  PG.auth = { getToken, login, logout, status };
})(typeof globalThis !== 'undefined' ? globalThis : this);
