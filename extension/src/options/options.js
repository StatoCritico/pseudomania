// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 gli autori di Pseudomania
//
// Impostazioni e informazioni.
//  - Personal edition: indirizzo di Rizzo-PII desktop (solo locale) e verifica del servizio, compreso
//    il caso in cui Rizzo-PII risponde ma rifiuta le chiamate dell'estensione (CORS).
//    Scelte su immagini, immagini nei PDF (con seconda conferma per «Lascia le immagini») e attivazione.
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

  // Scelte con pulsanti di opzione: salvate subito in chrome.storage.local.
  function radios(container, name, options, current, disabled, onChange) {
    container.textContent = '';
    for (const [value, [title, help]] of Object.entries(options)) {
      const lab = document.createElement('label');
      const inp = document.createElement('input');
      inp.type = 'radio';
      inp.name = name;
      inp.value = value;
      inp.checked = value === current;
      inp.disabled = disabled.includes(value);
      if (inp.disabled) lab.className = 'disabled';
      inp.addEventListener('change', () => onChange(value));
      const txt = document.createElement('span');
      const t = document.createElement('span');
      t.className = 'ttl';
      t.textContent = title;
      const hp = document.createElement('span');
      hp.className = 'help';
      hp.style.display = 'block';
      hp.textContent = help;
      txt.append(t, hp);
      lab.append(inp, txt);
      container.append(lab);
    }
  }

  async function saveChoice(obj) {
    await chrome.storage.local.set(obj);
    $('msg').className = 'ok';
    $('msg').textContent = S.impSalvatoBreve;
  }

  function showChoices(cfg, ent) {
    $('images').hidden = false;
    $('imgTitle').textContent = S.impImmaginiTitolo;
    if (ent) {
      // Server edition: decide l'ente con la policy; qui solo in lettura.
      radios($('imgOptions'), 'imagePolicy', S.impImmagini, cfg.imagePolicy, Object.keys(S.impImmagini), () => {});
      $('imgManaged').hidden = false;
      $('imgManaged').textContent = S.impImmaginiEnte(cfg.imagePolicy);
      return;
    }
    // Personal edition: tutte le scelte sono disponibili, compreso l'oscuramento automatico (OCR locale).
    radios($('imgOptions'), 'imagePolicy', S.impImmagini, cfg.imagePolicy || 'ocr', [],
      (v) => saveChoice({ imagePolicy: v }));
    $('activation').hidden = false;
    $('actTitle').textContent = S.impAttivazioneTitolo;
    radios($('actOptions'), 'activationMode', S.impAttivazione, cfg.activationMode || 'off', [],
      (v) => saveChoice({ activationMode: v }));
    showPdfImages(cfg);
  }

  // Seconda conferma per «Lascia le immagini»: finestra nella pagina, focus iniziale su «Annulla».
  // Risolve true solo con un clic esplicito su «Sì, lascia le immagini»; Esc o «Annulla» → false.
  function confirmKeep() {
    const dlg = $('pdfKeepDlg');
    $('pdfKeepTitle').textContent = S.impPdfKeepConfermaTitolo;
    $('pdfKeepText').textContent = S.impPdfKeepConfermaTesto;
    $('pdfKeepCancel').textContent = S.annulla;
    $('pdfKeepOk').textContent = S.impPdfKeepConfermaOk;
    return new Promise((resolve) => {
      let ok = false;
      const onOk = () => { ok = true; dlg.close(); };
      const onCancel = () => dlg.close();
      $('pdfKeepOk').addEventListener('click', onOk);
      $('pdfKeepCancel').addEventListener('click', onCancel);
      dlg.addEventListener('close', () => {
        $('pdfKeepOk').removeEventListener('click', onOk);
        $('pdfKeepCancel').removeEventListener('click', onCancel);
        resolve(ok);
      }, { once: true });
      dlg.showModal();
      $('pdfKeepCancel').focus();
    });
  }

  // Immagini nei PDF (solo Personal edition): ocr | remove | keep.
  function showPdfImages(cfg) {
    const PDF = PG.config.PDF_IMAGE_POLICIES;
    let current = PDF.includes(cfg.pdfImagePolicy) ? cfg.pdfImagePolicy : 'ocr';
    $('pdfImages').hidden = false;
    $('pdfImgTitle').textContent = S.impPdfImmaginiTitolo;
    $('pdfImgHelp').textContent = S.impPdfImmaginiAiuto;
    const box = $('pdfImgOptions');
    const select = (v) => {
      for (const inp of box.querySelectorAll('input[name="pdfImagePolicy"]')) inp.checked = inp.value === v;
    };
    radios(box, 'pdfImagePolicy', S.impPdfImmagini, current, [], async (v) => {
      if (v === 'keep' && current !== 'keep') {
        const ok = await confirmKeep();
        if (!ok) {
          select(current); // annullato: torna alla scelta precedente, nulla viene salvato
          $('msg').className = '';
          $('msg').textContent = '';
          return;
        }
      }
      current = v;
      await saveChoice({ pdfImagePolicy: v });
    });
  }

  async function init() {
    let managed = {};
    try {
      managed = await chrome.storage.managed.get(null);
    } catch (_) { /* nessuna policy */ }
    const st = (await chrome.storage.local.get('pgState')).pgState;
    const local = await chrome.storage.local.get(['rizzoUrl', 'imagePolicy', 'pdfImagePolicy', 'activationMode']);
    const cfg = st && st.config ? st.config : PG.config.resolveConfig({ managed, local });
    const ent = cfg.mode === 'ente';
    // Lo stato pubblicato può essere di un attimo indietro: per la Personal vale l'ultimo valore salvato.
    if (!ent && PG.config.PDF_IMAGE_POLICIES.includes(local.pdfImagePolicy)) cfg.pdfImagePolicy = local.pdfImagePolicy;
    $('edition').textContent = ent ? S.modalitaEnte : S.modalitaPersonale;
    if (!ent) showLog();
    showChoices(cfg, ent);
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
