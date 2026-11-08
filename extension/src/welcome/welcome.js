// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 gli autori di Pseudomania
//
// Pagina di benvenuto della Personal edition (aperta dal service worker alla prima installazione).
// Verifica che Rizzo-PII risponda (messaggio pg:testRizzo), spiega l'icona e la scorciatoia.
// In Server edition la pagina non viene aperta; se ci si arriva comunque mostra solo un avviso.

(function () {
  'use strict';
  const S = PG.strings;
  const $ = (id) => document.getElementById(id);
  const RETRY_MS = 5000;
  let timer = null;
  let checking = false;

  function texts() {
    $('title').textContent = S.benvenutoTitolo;
    $('edition').textContent = `${S.nome} – ${S.edizionePersonal}`;
    $('intro').textContent = S.benvenutoIntro;
    $('local').textContent = S.benvenutoLocale;
    $('stepsTitle').textContent = S.benvenutoPassi;
    $('s1Title').textContent = S.benvenutoP1Titolo;
    $('s1Text').textContent = S.benvenutoP1Testo;
    $('btnCheck').textContent = S.benvenutoVerifica;
    $('rizzoHow').textContent = S.benvenutoRizzoComeFare;
    const ol = $('rizzoSteps');
    ol.textContent = '';
    for (const t of S.benvenutoRizzoPassi) {
      const li = document.createElement('li');
      li.textContent = t;
      ol.append(li);
    }
    $('rizzoDownload').href = S.rizzoReleases;
    $('rizzoDownload').textContent = S.benvenutoRizzoScarica;
    $('s2Title').textContent = S.benvenutoP2Titolo;
    $('s2Text').textContent = S.benvenutoP2Testo;
    $('s3Title').textContent = S.benvenutoP3Titolo;
    $('s3Text').textContent = S.benvenutoP3Testo;
    $('s3Note').textContent = S.benvenutoP3Nota;
    $('moreTitle').textContent = S.benvenutoAltro;
    $('btnOptions').textContent = S.benvenutoImpostazioni;
    $('guide').href = S.guidaPersonal;
    $('guide').textContent = S.benvenutoGuida;
  }

  /** Scorciatoia effettivamente assegnata (l'utente può cambiarla), in italiano. */
  async function shortcut() {
    let key = '';
    try {
      const cmds = await chrome.commands.getAll();
      const c = cmds.find((x) => x.name === 'toggle-protection');
      key = (c && c.shortcut) || '';
    } catch (_) { /* ignora */ }
    $('shortcut').textContent = key ? key.replace(/Shift/g, 'Maiusc') : S.benvenutoScorciatoiaNessuna;
  }

  async function rizzoUrl() {
    const r = await chrome.storage.local.get('rizzoUrl');
    return r.rizzoUrl || PG.config.DEFAULT_RIZZO_URL;
  }

  function show(state, url) {
    const box = $('rizzoStatus');
    const ui = { ok: 'ok', loading: 'loading', checking: 'checking' }[state] || 'ko';
    box.dataset.state = ui;
    $('rizzoMsg').textContent = {
      ok: S.benvenutoRizzoOk,
      loading: S.benvenutoRizzoLoading,
      cors: S.benvenutoRizzoCors,
      checking: S.benvenutoVerificaInCorso,
    }[state] || S.benvenutoRizzoDown;
    $('rizzoHelp').hidden = ui !== 'ko';
    if (url) $('rizzoUrl').textContent = S.benvenutoRizzoIndirizzo(url);
  }

  async function check() {
    if (checking) return;
    checking = true;
    clearTimeout(timer);
    $('btnCheck').disabled = true;
    let state = 'down';
    let url = '';
    try {
      url = await rizzoUrl();
      if ($('rizzoStatus').dataset.state !== 'ok') show('checking', url);
      const r = await chrome.runtime.sendMessage({ type: 'pg:testRizzo', rizzoUrl: url });
      state = r && r.ok && r.data ? r.data.state : 'down';
    } catch (_) {
      state = 'down';
    } finally {
      checking = false;
      $('btnCheck').disabled = false;
    }
    show(state, url);
    // Finché Rizzo-PII non risponde, la verifica si ripete da sola.
    if (state !== 'ok') timer = setTimeout(check, RETRY_MS);
  }

  async function isEnte() {
    try {
      const st = (await chrome.storage.local.get('pgState')).pgState;
      if (st && st.config) return st.config.mode === 'ente';
    } catch (_) { /* ignora */ }
    try {
      const m = await chrome.storage.managed.get(null);
      return Boolean(m && m.mode === 'ente');
    } catch (_) {
      return false;
    }
  }

  async function init() {
    texts();
    $('btnCheck').addEventListener('click', check);
    $('btnOptions').addEventListener('click', () => chrome.runtime.openOptionsPage());
    if (await isEnte()) {
      $('steps').hidden = true;
      $('managed').hidden = false;
      $('managed').textContent = S.benvenutoEnte;
      return;
    }
    shortcut();
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.rizzoUrl) check();
    });
    check();
  }

  init();
})();
