// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 gli autori di Pseudomania

(function () {
  'use strict';
  const S = PG.strings;
  const $ = (id) => document.getElementById(id);
  const send = (type, p) => chrome.runtime.sendMessage(Object.assign({ type }, p || {}));

  function render(st) {
    const c = st.config;
    $('mode').textContent = c.mode === 'ente' ? S.modalitaEnte : S.modalitaPersonale;
    const serverOk = st.health && st.health.ok;
    let cls = 'on';
    let text = S.attiva;
    if (!c.enabled) {
      cls = 'off';
      text = S.disattiva;
    } else if (!serverOk) {
      cls = 'warn';
      text = S.statoServizio(c.mode, st.health);
    }
    $('dot').className = 'dot ' + cls;
    $('stateText').textContent = text;

    // Il popup si apre solo nell'Enterprise edition (Personal: il clic sul pulsante attiva/disattiva
    // la conversazione). Interruttore solo se la policy lo consente esplicitamente.
    const entMode = c.mode === 'ente';
    $('switchRow').hidden = !(entMode && c.allowDisable);
    $('toggle').checked = c.enabled;
    $('toggleLbl').textContent = c.enabled ? S.attiva : S.disattiva;
    $('locked').hidden = entMode && c.allowDisable;
    $('locked').textContent = entMode ? S.nonDisattivabile : S.popupPersonal;

    const ent = c.mode === 'ente';
    $('server').className = 'line ' + (serverOk ? 'ok' : 'ko');
    $('server').textContent = ent
      ? (serverOk ? S.serverOk : S.statoServizio(c.mode, st.health)) + (c.serverUrl ? ` (${c.serverUrl})` : '')
      : (serverOk ? S.rizzoOk : S.statoServizio(c.mode, st.health)) + ` (${c.rizzoUrl})`;

    const isOidc = c.authMethod === 'oidc';
    $('auth').hidden = !ent;
    $('auth').textContent = st.auth && st.auth.loggedIn ? S.accessoEseguito : S.accessoNecessario;
    $('auth').className = 'line ' + (st.auth && st.auth.loggedIn ? 'ok' : 'warn');
    $('btnLogin').hidden = !isOidc;
    $('btnLogin').textContent = st.auth && st.auth.loggedIn ? S.esci : S.accedi;
    $('btnLogin').onclick = async () => {
      const r = await send(st.auth && st.auth.loggedIn ? 'pg:logout' : 'pg:login');
      if (r && r.data) render(r.data);
    };
    $('btnOptions').hidden = false;
    $('btnOptions').textContent = c.mode === 'ente' ? S.impostazioniInfo : S.impostazioni;
  }

  $('btnPanel').textContent = S.apriPannello;
  $('btnOptions').textContent = S.impostazioni;
  $('btnOptions').onclick = () => chrome.runtime.openOptionsPage();
  $('btnPanel').onclick = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) await chrome.sidePanel.open({ tabId: tab.id });
    window.close();
  };
  $('toggle').addEventListener('change', async (e) => {
    const r = await send('pg:setEnabled', { enabled: e.target.checked });
    if (r && r.data) render(r.data);
  });

  send('pg:refreshState').then((r) => r && r.ok && render(r.data));
})();
