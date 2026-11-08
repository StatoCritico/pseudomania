// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 gli autori di Pseudomania
//
// Risoluzione della configurazione effettiva (codice puro).
//
// Precedenza, dalla più forte (SPEC.md, «Estensione: configurazione»):
//   1. chrome.storage.managed  (policy dell'ente: prevale sempre)
//   2. GET /v1/config del server (Server edition: tagInstruction, allowlist, maxFileMB, chiave di custodia,
//      rotazione; failClosed/allowDisable valgono SOLO dalla policy)
//   3. chrome.storage.local    (Personal edition: indirizzo di Rizzo-PII, scelte su immagini, tipi da
//                               non mascherare `keepTypes`)
//   4. valori predefiniti della modalità
// Se managed.mode è assente: Personal edition (estensione autonoma con Rizzo-PII desktop).

(function (root) {
  'use strict';
  const PG = (root.PG = root.PG || {});

  const DEFAULT_TAG_INSTRUCTION =
    'I testi contengono segnaposto tra parentesi quadre come [FULLNAME_n] o [CF_n] (n = numero). Riportali esattamente ' +
    'come sono, senza modificarli, tradurli, declinarli o spiegarli, e non crearne di nuovi.';

  const DEFAULT_RIZZO_URL = 'http://127.0.0.1:5005';

  const MODE_DEFAULTS = {
    ente: { failClosed: true, allowDisable: false },
    personale: { failClosed: false, allowDisable: true },
  };

  const MANAGED_TYPES = {
    mode: 'string', serverUrl: 'string', oidcIssuer: 'string', oidcClientId: 'string',
    oidcScopes: 'string', oidcTokenType: 'string', failClosed: 'boolean', allowDisable: 'boolean',
    sites: 'array', imagePolicy: 'string',
  };

  // Immagini (screenshot, foto):
  //   'block'   bloccate (predefinito della Server edition)
  //   'confirm' inviate così come sono, dopo una conferma esplicita per ogni immagine
  //   'ocr'     il testo viene letto sul PC (OCR locale) e i dati personali sono coperti da riquadri neri;
  //             l'utente conferma l'anteprima oscurata (predefinito della Personal). Solo Personal edition:
  //             in Server edition vale come 'block'.
  const IMAGE_POLICIES = ['block', 'confirm', 'ocr'];
  const ACTIVATION_MODES = ['off', 'on', 'ask'];
  // Immagini nei PDF (solo Personal edition; in Server edition i PDF li tratta il server):
  //   'ocr'    (predefinito) il testo delle immagini e delle pagine scansionate viene letto sul PC e i dati
  //            trovati vengono coperti
  //   'remove' tutte le immagini tolte dal PDF inviato
  //   'keep'   immagini lasciate come sono (nelle impostazioni richiede una seconda conferma)
  const PDF_IMAGE_POLICIES = ['ocr', 'remove', 'keep'];
  // Tipi di dato che l'utente della Personal edition può scegliere di NON mascherare (keepTypes): solo
  // quelli a basso rischio di identificazione, utili per non peggiorare le risposte (date, importi, enti).
  // Nomi, codici fiscali, IBAN, email, telefoni, indirizzi, documenti, targhe… restano sempre mascherati.
  const KEEPABLE_TYPES = ['DATE', 'TIME', 'AMOUNT', 'AGE', 'GENDER', 'ORG'];

  /** Solo i tipi ammessi, in maiuscolo, senza doppioni, nell'ordine di KEEPABLE_TYPES. */
  function sanitizeKeepTypes(v) {
    if (!Array.isArray(v)) return [];
    const set = new Set(v.filter((x) => typeof x === 'string').map((x) => x.trim().toUpperCase()));
    return KEEPABLE_TYPES.filter((t) => set.has(t));
  }

  /** Tiene solo le chiavi note e con il tipo atteso (una policy malformata non deve rompere nulla). */
  function sanitizeManaged(managed) {
    const out = {};
    if (!managed || typeof managed !== 'object') return out;
    for (const [k, t] of Object.entries(MANAGED_TYPES)) {
      const v = managed[k];
      if (v === undefined || v === null) continue;
      if (t === 'array' ? Array.isArray(v) : typeof v === t) out[k] = v;
    }
    if (out.mode && out.mode !== 'ente' && out.mode !== 'personale') delete out.mode;
    if (out.imagePolicy && !IMAGE_POLICIES.includes(out.imagePolicy)) delete out.imagePolicy;
    return out;
  }

  function pick(...values) {
    for (const v of values) if (v !== undefined && v !== null && v !== '') return v;
    return undefined;
  }

  function stripSlash(url) {
    return typeof url === 'string' ? url.replace(/\/+$/, '') : url;
  }

  /**
   * @param {{managed?:object, server?:object|null, local?:object}} src
   * @returns {object} configurazione effettiva
   */
  function resolveConfig(src) {
    const managed = sanitizeManaged(src && src.managed);
    const server = (src && src.server) || {};
    const local = (src && src.local) || {};
    const mode = managed.mode || 'personale';
    const d = MODE_DEFAULTS[mode];
    const isEnte = mode === 'ente';

    // Server edition: server dell'ente. Personal edition: nessun server, solo Rizzo-PII locale.
    const serverUrl = isEnte ? stripSlash(pick(managed.serverUrl)) || '' : '';
    const rizzoUrl = isEnte ? '' : stripSlash(pick(local.rizzoUrl, DEFAULT_RIZZO_URL));
    // In modalità ente failClosed e allowDisable vengono SOLO dalla policy (SPEC/DECISIONI): /v1/config
    // non può indebolirli.
    const failClosed = Boolean(pick(managed.failClosed, d.failClosed));
    const allowDisable = Boolean(pick(managed.allowDisable, d.allowDisable));
    // Personal edition: nessun interruttore globale, lo stato è per conversazione (activation.js).
    const enabled = isEnte && allowDisable ? local.enabled !== false : true;

    const oidc = {
      issuer: stripSlash(managed.oidcIssuer || ''),
      clientId: managed.oidcClientId || '',
      scopes: managed.oidcScopes || 'openid profile',
      tokenType: managed.oidcTokenType === 'id_token' ? 'id_token' : 'access_token',
    };
    const authMethod = isEnte ? 'oidc' : 'none';
    const configured = isEnte ? Boolean(serverUrl && oidc.issuer && oidc.clientId) : true;
    const imagePolicy = isEnte
      ? managed.imagePolicy || 'block'
      : IMAGE_POLICIES.includes(local.imagePolicy) ? local.imagePolicy : 'ocr';
    const pdfImagePolicy = isEnte ? null : PDF_IMAGE_POLICIES.includes(local.pdfImagePolicy) ? local.pdfImagePolicy : 'ocr';
    // Server edition: l'impostazione non esiste (decide il server dell'ente).
    const keepTypes = isEnte ? null : sanitizeKeepTypes(local.keepTypes);
    const activationMode = !isEnte && ACTIVATION_MODES.includes(local.activationMode) ? local.activationMode : 'off';

    return {
      mode,
      edition: isEnte ? 'server' : 'personal',
      managedKeys: Object.keys(managed),
      isManaged: (key) => Object.prototype.hasOwnProperty.call(managed, key),
      serverUrl,
      rizzoUrl,
      failClosed,
      allowDisable,
      enabled,
      imagePolicy,
      // L'OCR locale esiste solo nella Personal edition: in Server edition 'ocr' vale come 'block'.
      imagePolicyEffective: imagePolicy === 'ocr' && isEnte ? 'block' : imagePolicy,
      pdfImagePolicy,
      keepTypes,
      activationMode,
      sites: managed.sites && managed.sites.length ? managed.sites : ['claude.ai'],
      oidc,
      authMethod,
      localToken: '',
      configured,
      tagInstruction: typeof server.tagInstruction === 'string' && server.tagInstruction ? server.tagInstruction : DEFAULT_TAG_INSTRUCTION,
      allowlist: Array.isArray(server.allowlist) ? server.allowlist : [],
      maxFileMB: Number.isFinite(server.maxFileMB) ? server.maxFileMB : 20,
      policyVersion: server.policyVersion || null,
      serverMode: server.mode || null,
      // Cifratura lato client (solo Server edition)
      escrowPublicKey: typeof server.escrowPublicKey === 'string' ? server.escrowPublicKey : '',
      escrowKeyId: typeof server.escrowKeyId === 'string' ? server.escrowKeyId : '',
      rotateKey: server.rotateKey === true,
      keyRotationDays: Number.isFinite(server.keyRotationDays) ? server.keyRotationDays : 90,
      pendingEntryMinutes: Number.isFinite(server.pendingEntryMinutes) ? server.pendingEntryMinutes : 10,
      serverConfigTs: Number.isFinite(src && src.serverTs) ? src.serverTs : null,
    };
  }

  /** Versione serializzabile (senza funzioni) da passare a content script e pagine. */
  function toPlain(cfg) {
    const { isManaged, ...rest } = cfg;
    return rest;
  }

  const api = { resolveConfig, sanitizeManaged, toPlain, DEFAULT_TAG_INSTRUCTION, DEFAULT_RIZZO_URL, MODE_DEFAULTS, IMAGE_POLICIES, PDF_IMAGE_POLICIES, ACTIVATION_MODES, KEEPABLE_TYPES, sanitizeKeepTypes };
  PG.config = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
