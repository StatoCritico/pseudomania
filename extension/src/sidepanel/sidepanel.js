// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 gli autori di Pseudomania
//
// Pannello laterale di ispezione: originale e testo inviato affiancati, entità, risposte con
// segnaposto, segnalazioni (senza valori reali) e cancellazione dello scope.

(function () {
  'use strict';
  const S = PG.strings;
  const $ = (id) => document.getElementById(id);

  let target = null; // {tabId, recordId, convKey, scope}
  let records = [];
  let current = null;
  let reportType = null;
  let dict = {};
  let dictInfo = { unrecoverable: [], confirmBy: null };
  let edition = 'server';
  const openedTraces = new Set();

  function send(type, payload) {
    return chrome.runtime.sendMessage(Object.assign({ type }, payload || {})).catch((e) => ({ ok: false, message: String(e) }));
  }

  function highlighted(el, text, ranges, cls) {
    el.textContent = '';
    let cur = 0;
    for (const r of [...ranges].sort((a, b) => a.start - b.start)) {
      if (r.start < cur || r.end > text.length) continue;
      el.append(text.slice(cur, r.start));
      const m = document.createElement('mark');
      m.className = cls;
      if (r.title) m.title = r.title;
      m.textContent = text.slice(r.start, r.end);
      el.append(m);
      cur = r.end;
    }
    el.append(text.slice(cur));
  }

  function staticTexts() {
    $('title').textContent = S.pannelloTitolo;
    $('hOrig').textContent = S.pannelloOriginale;
    $('hSent').textContent = S.pannelloInviato;
    $('hEnt').textContent = S.pannelloEntita;
    $('lblRaw').textContent = S.pannelloRisposte;
    $('btnFN').textContent = S.pannelloSegnalaFN;
    $('btnFP').textContent = S.pannelloSegnalaFP;
    $('lblNote').textContent = S.pannelloNota;
    $('btnSend').textContent = S.pannelloInviaSegnalazione;
    $('btnCancel').textContent = S.annulla;
    $('empty').textContent = S.pannelloVuoto;
    $('hConfirm').textContent = S.pannelloConfermaTitolo;
    $('btnConfirm').textContent = S.pannelloConfermaBtn;
    $('hRecovery').textContent = S.pannelloRecuperoTitolo;
    $('recoveryText').textContent = S.pannelloRecuperoTesto;
    $('btnPrepare').textContent = S.pannelloRecuperoBtn;
    $('btnImport').textContent = S.pannelloRecuperoVerifica;
    $('recoveryLink').textContent = S.procedura;
    $('recoveryLink').href = S.urlRecupero;
  }

  async function activeTabId() {
    // ?tabId=N: pannello aperto in una scheda normale (ripiego e test) invece che nel pannello laterale.
    const forced = new URLSearchParams(location.search).get('tabId');
    if (forced) return Number(forced);
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab ? tab.id : null;
  }

  async function load() {
    const got = await chrome.storage.session.get('pgInspect');
    target = got.pgInspect || null;
    const tabId = await activeTabId();
    if (!target || (tabId != null && target.tabId !== tabId)) {
      // Nessun contrassegno cliccato in questa scheda: si usa la conversazione della scheda attiva.
      try {
        const r = await chrome.tabs.sendMessage(tabId, { type: 'pg:getPageScope' });
        if (r && r.ok) target = { tabId, convKey: r.data.convKey, scope: r.data.scope, recordId: null };
      } catch (_) {
        target = target && target.tabId === tabId ? target : null;
      }
    }
    render();
  }

  async function render() {
    $('scope').textContent = S.pannelloScope(target && target.scope);
    $('btnDelete').textContent = S.pannelloElimina(target && target.scope ? target.scope.type : 'conversation');
    $('btnDelete').disabled = !(target && target.scope && !String(target.scope.id).startsWith('pending:'));
    records = [];
    if (target && target.convKey) {
      const r = await send('pg:getRecords', { convKey: target.convKey });
      records = r && r.ok ? r.data : [];
    }
    const st = (await chrome.storage.local.get('pgState')).pgState;
    edition = st && st.config && st.config.mode === 'ente' ? 'server' : 'personal';
    dictInfo = { unrecoverable: [], confirmBy: null };
    if (target && target.scope) {
      const d = await send('pg:dictionary', { scope: target.scope });
      dict = d && d.ok ? d.data.entries || {} : {};
      if (d && d.ok) dictInfo = { unrecoverable: d.data.unrecoverable || [], confirmBy: d.data.confirmBy || null };
    }
    renderServer();
    renderBlock();
    const sel = $('records');
    sel.textContent = '';
    records.forEach((rec, i) => {
      const o = document.createElement('option');
      o.value = rec.id;
      const preview = rec.original.replace(/\s+/g, ' ').slice(0, 50);
      o.textContent = `${i + 1}. ${new Date(rec.ts).toLocaleTimeString('it-IT')} – ${preview}`;
      sel.append(o);
    });
    current = records.find((r) => target && r.id === target.recordId) || records[records.length - 1] || null;
    $('recordSel').hidden = records.length < 2;
    if (current) sel.value = current.id;
    showRecord();
    if ($('showRaw').checked) loadRaw();
  }

  function showRecord() {
    $('empty').hidden = Boolean(current);
    $('detail').hidden = !current;
    $('btnFN').disabled = $('btnFP').disabled = !current;
    if (!current) return;
    const origRanges = current.entities
      .filter((e) => typeof e.start === 'number')
      .map((e) => ({ start: e.start, end: e.end, title: e.tag }));
    highlighted($('orig'), current.original, origRanges, 'o');
    highlighted($('sent'), current.sent, PG.tags.findTags(current.sent).map((t) => ({ start: t.start, end: t.end })), 't');
    const tbl = $('entities');
    tbl.textContent = '';
    const seen = new Set();
    for (const e of current.entities) {
      if (seen.has(e.tag)) continue;
      seen.add(e.tag);
      const tr = document.createElement('tr');
      const value = typeof e.start === 'number' ? current.original.slice(e.start, e.end) : dict[e.tag] || '';
      for (const c of [e.tag, value]) {
        const td = document.createElement('td');
        td.textContent = c;
        tr.append(td);
      }
      tbl.append(tr);
    }
    $('trace').textContent = current.traceId ? `${S.pannelloTraccia}: ${current.traceId}` : '';
    if (current.traceId && !openedTraces.has(current.traceId)) {
      openedTraces.add(current.traceId);
      send('pg:event', { event: 'inspection_opened', traceId: current.traceId, scope: current.scope, details: { kind: current.kind } });
    }
  }

  async function loadRaw() {
    const box = $('raw');
    box.hidden = false;
    box.textContent = '';
    let r = null;
    try {
      r = await chrome.tabs.sendMessage(target.tabId, { type: 'pg:getRawResponses' });
    } catch (_) {
      r = null;
    }
    const list = r && r.ok ? r.data.responses : [];
    if (!list.length) {
      box.append(Object.assign(document.createElement('p'), { className: 'muted small', textContent: S.pannelloRisposteVuoto }));
      return;
    }
    for (const t of list) {
      const d = document.createElement('div');
      d.className = 'txt';
      highlighted(d, t, PG.tags.findTags(t).map((x) => ({ start: x.start, end: x.end, title: x.tag })), 't');
      box.append(d);
    }
  }

  /** Server edition: conferma annuale dei progetti e recupero delle chiavi. */
  async function renderServer() {
    const ent = edition === 'server';
    const project = Boolean(target && target.scope && target.scope.type === 'project');
    const cb = $('confirmBox');
    cb.hidden = !(ent && project && dictInfo.confirmBy);
    if (!cb.hidden) {
      const when = new Date(dictInfo.confirmBy);
      const soon = when.getTime() - Date.now() < 30 * 86400000;
      cb.className = 'box' + (soon ? ' warn' : '');
      $('confirmText').textContent = S.pannelloConfermaTesto(when.toLocaleDateString('it-IT')) + (soon ? ' ' + S.pannelloConfermaInScadenza : '');
    }
    $('recoveryBox').hidden = !ent;
    if (!ent) return;
    const ks = await send('pg:keyStatus');
    const k = ks && ks.ok ? ks.data : null;
    $('keyInfo').textContent = S.pannelloChiave(k && k.keyId, k && k.createdAt ? new Date(k.createdAt).toLocaleDateString('it-IT') : '');
    $('unrecInfo').textContent = dictInfo.unrecoverable.length ? S.pannelloNonRipristinabili(dictInfo.unrecoverable.length) : '';
    $('recoveryCode').textContent = k && k.deviceKeyId ? S.pannelloRecuperoCodice(k.deviceKeyId) : '';
    $('btnImport').hidden = !(k && k.deviceKeyId);
    $('recoveryLink').parentElement.hidden = !project;
  }

  /** Ultimo invio bloccato: segnalazione anche senza un messaggio inviato. */
  let lastBlock = null;
  async function renderBlock() {
    lastBlock = (await chrome.storage.session.get('pgLastBlock')).pgLastBlock || null;
    $('blockBox').hidden = !lastBlock;
    if (!lastBlock) return;
    $('blockText').textContent = S.pannelloUltimoBlocco(lastBlock.category, new Date(lastBlock.ts).toLocaleTimeString('it-IT'));
    $('btnBlockFP').textContent = S.segnalaBloccoErrato;
    $('btnBlockFP').disabled = false;
    $('blockMsg').textContent = '';
  }

  async function reportBlock() {
    if (!lastBlock) return;
    $('btnBlockFP').disabled = true;
    const r = await send('pg:event', {
      event: 'report_false_positive', traceId: lastBlock.traceId, scope: lastBlock.scope,
      details: { kind: 'blocked', category: lastBlock.category },
    });
    $('blockMsg').textContent = r && r.ok ? (edition === 'personal' ? S.pannelloSegnalazioneLocale : S.bloccoSegnalato) : S.pannelloErrore + ((r && (r.message || r.error)) || '');
  }

  async function confirmProject() {
    const r = await send('pg:confirmScope', { scope: target.scope });
    $('msg').textContent = r && r.ok ? S.pannelloConfermaOk : S.pannelloErrore + ((r && (r.message || r.error)) || '');
    if (r && r.ok) render();
  }

  async function prepareRecovery() {
    $('btnPrepare').disabled = true;
    const r = await send('pg:prepareRecovery');
    $('btnPrepare').disabled = false;
    if (r && r.ok) $('recoveryCode').textContent = S.pannelloRecuperoCodice(r.data.deviceKeyId);
    else $('msg').textContent = S.pannelloErrore + ((r && (r.message || r.error)) || '');
    renderServer();
  }

  async function importRecovered() {
    const r = await send('pg:importRecovered');
    $('msg').textContent = r && r.ok ? S.pannelloRecuperoImportate(r.data.imported) : S.pannelloErrore + ((r && (r.message || r.error)) || '');
    if (r && r.ok && r.data.imported) render();
  }

  function openReport(type) {
    reportType = type;
    $('reportForm').hidden = false;
    $('note').value = '';
    $('note').focus();
    $('msg').textContent = '';
  }

  async function sendReport() {
    if (!current) return;
    // La nota non deve contenere dati reali: i valori del dizionario vengono sostituiti dai segnaposto.
    const note = PG.tags.maskKnownValues($('note').value.trim(), Object.assign({}, dict, entriesFromRecord(current)));
    const counts = {};
    for (const e of current.entities) counts[e.type] = (counts[e.type] || 0) + 1;
    const r = await send('pg:event', {
      event: reportType,
      traceId: current.traceId,
      scope: current.scope,
      details: { note, kind: current.kind, entityCounts: counts },
    });
    $('reportForm').hidden = true;
    const okText = edition === 'personal' ? S.pannelloSegnalazioneLocale : S.pannelloSegnalazioneOk;
    $('msg').textContent = r && r.ok ? okText : S.pannelloErrore + ((r && (r.message || r.error)) || '');
  }

  function entriesFromRecord(rec) {
    const out = {};
    for (const e of rec.entities) if (typeof e.start === 'number') out[e.tag] = rec.original.slice(e.start, e.end);
    return out;
  }

  async function deleteScope() {
    if (!target || !target.scope) return;
    if (!confirm(S.pannelloEliminaConferma(target.scope.type))) return;
    const r = await send('pg:deleteScope', { scope: target.scope });
    $('msg').textContent = r && r.ok ? (edition === 'personal' ? S.pannelloEliminaOkLocale : S.pannelloEliminaOk) : S.pannelloErrore + ((r && (r.message || r.error)) || '');
  }

  staticTexts();
  $('records').addEventListener('change', (e) => {
    current = records.find((r) => r.id === e.target.value) || null;
    showRecord();
  });
  $('showRaw').addEventListener('change', (e) => {
    if (e.target.checked) loadRaw();
    else $('raw').hidden = true;
  });
  $('btnFN').addEventListener('click', () => openReport('report_false_negative'));
  $('btnFP').addEventListener('click', () => openReport('report_false_positive'));
  $('btnSend').addEventListener('click', sendReport);
  $('btnCancel').addEventListener('click', () => ($('reportForm').hidden = true));
  $('btnDelete').addEventListener('click', deleteScope);
  $('btnConfirm').addEventListener('click', confirmProject);
  $('btnBlockFP').addEventListener('click', reportBlock);
  $('btnPrepare').addEventListener('click', prepareRecovery);
  $('btnImport').addEventListener('click', importRecovered);
  chrome.storage.session.onChanged.addListener((ch) => {
    if (ch.pgInspect) load();
    if (ch.pgLastBlock) renderBlock();
  });
  if (!new URLSearchParams(location.search).get('tabId')) chrome.tabs.onActivated.addListener(() => load());
  load();
})();
