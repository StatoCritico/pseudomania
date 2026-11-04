// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 gli autori di Pseudomania
//
// Impostazioni e informazioni.
//  - Personal edition: indirizzo di Rizzo-PII desktop (solo locale) e verifica del servizio, compreso
//    il caso in cui Rizzo-PII risponde ma rifiuta le chiamate dell'estensione (CORS).
//  - Server edition: tutto è gestito dalla policy; si mostrano il server e le informazioni.

(function () {
  'use strict';
  const S = PG.strings;
  const $ = (id) => document.getElementById(id);

  $('title').textContent = S.impostazioniTitolo;
  $('lblRizzo').textContent = S.impRizzoUrl;
  $('helpRizzo').textContent = S.impRizzoAiuto;
  $('btnSave').textContent = S.impSalva;
  $('btnTest').textContent = S.impVerifica;

  function isLoopback(url) {
    try {
      const u = new URL(url);
      return u.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname);
    } catch (_) {
      return false;
    }
  }

  // Registro locale delle attività (solo Personal edition): ultime voci e download in JSON.
  async function showLog() {
    $('log').hidden = false;
    $('logTitle').textContent = S.registroTitolo;
    $('logHelp').textContent = S.registroAiuto;
    $('btnLog').textContent = S.registroScarica;
    let rows = [];
    try {
      const r = await chrome.runtime.sendMessage({ type: 'pg:localLog' });
      rows = (r && r.ok && r.data) || [];
    } catch (_) { /* estensione non pronta */ }
    rows.sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
    const tb = $('logTable');
    tb.textContent = '';
    if (!rows.length) {
      tb.insertRow().insertCell().textContent = S.registroVuoto;
    }
    for (const r of rows.slice(0, 300)) {
      const tr = tb.insertRow();
      const d = new Date(r.ts);
      const rest = Object.assign({}, r);
      delete rest.ts;
      delete rest.action;
      delete rest.traceId;
      [d.toLocaleString('it-IT'), r.action || r.event || '', JSON.stringify(rest)].forEach((v) => {
        const c = tr.insertCell();
        c.textContent = v;
        c.style.cssText = 'border-bottom:1px solid #ddd;padding:3px 6px;vertical-align:top;word-break:break-word';
      });
    }
    $('btnLog').onclick = () => {
      const blob = new Blob([JSON.stringify(rows, null, 1)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `pseudomania-registro-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 30000);
    };
  }

  async function init() {
    let managed = {};
    try {
      managed = await chrome.storage.managed.get(null);
    } catch (_) { /* nessuna policy */ }
    const st = (await chrome.storage.local.get('pgState')).pgState;
    const local = await chrome.storage.local.get(['rizzoUrl']);
    const cfg = st && st.config ? st.config : PG.config.resolveConfig({ managed, local });
    const ent = cfg.mode === 'ente';
    $('edition').textContent = ent ? S.modalitaEnte : S.modalitaPersonale;
    if (!ent) showLog();
    if (ent) {
      $('managed').hidden = false;
      $('managed').textContent = S.impGestite;
      $('serverInfo').hidden = false;
      $('serverInfo').textContent = `${S.impServerGestito} ${cfg.serverUrl || '—'}`;
    } else {
      $('form').hidden = false;
      $('rizzoUrl').value = local.rizzoUrl || cfg.rizzoUrl || PG.config.DEFAULT_RIZZO_URL;
    }
    about(ent);
  }

  async function test() {
    $('msg').className = '';
    $('msg').textContent = '…';
    const url = $('rizzoUrl').value.trim().replace(/\/+$/, '');
    const r = await chrome.runtime.sendMessage({ type: 'pg:testRizzo', rizzoUrl: url });
    const state = r && r.ok ? r.data.state : 'down';
    $('msg').className = state === 'ok' ? 'ok' : 'ko';
    $('msg').textContent = S.impRizzoStato(state);
    return state;
  }

  $('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = $('rizzoUrl').value.trim().replace(/\/+$/, '');
    if (!isLoopback(url)) {
      $('msg').className = 'ko';
      $('msg').textContent = S.impRizzoSoloLocale;
      return;
    }
    await chrome.storage.local.set({ rizzoUrl: url });
    const state = await test();
    $('msg').textContent = S.impSalvato + ' ' + S.impRizzoStato(state);
  });
  $('btnTest').addEventListener('click', test);

  // Informazioni: sito, versione, codice sorgente (AGPL-3.0, art. 13: GET /v1/source del server).
  async function about(ent) {
    $('aboutTitle').textContent = S.infoTitolo;
    $('aboutExt').textContent = S.infoVersione(chrome.runtime.getManifest().version) + ' ' + (ent ? S.edizioneServer : S.edizionePersonal) + '.';
    $('aboutSiteLbl').textContent = S.infoSito;
    $('aboutSite').href = S.sito;
    $('aboutSite').textContent = S.sito;
    $('aboutLic').textContent = S.infoLicenza;
    $('aboutSrcRow').hidden = !ent;
    if (!ent) return;
    $('aboutSrcLbl').textContent = S.infoSorgente;
    const link = $('aboutSrc');
    let r = null;
    try {
      r = await chrome.runtime.sendMessage({ type: 'pg:source' });
    } catch (_) { /* ignora */ }
    if (r && r.ok && r.data && (r.data.license || r.data.version)) {
      $('aboutLic').textContent = S.infoServer(r.data.license, r.data.version) + ' ' + S.infoLicenza;
    }
    const url = r && r.ok && r.data && r.data.source;
    if (url && /^https?:\/\//i.test(url)) {
      link.href = url;
      link.textContent = url;
    } else {
      link.removeAttribute('href');
      link.textContent = r && r.ok ? S.infoSorgenteAssente : S.infoSorgenteNonRaggiungibile;
    }
  }

  init();
})();
