// SPDX-License-Identifier: Apache-2.0 AND AGPL-3.0-or-later
//
// Derivato da Privacy Guardrail, src/content/site-adapters/adapter-interface.ts
// Copyright 2026 DFKI GmbH, Forschungsbereich Data Science and its Applications (Apache-2.0).
// Modifiche Copyright (C) 2026 gli autori di Pseudomania (AGPL-3.0-or-later):
//  - riscritto in JavaScript;
//  - aggiunta la sostituzione dell'INTERO contenuto (non solo inserimento al cursore) con
//    tentativi in cascata (incolla sintetico → execCommand → DOM) e verifica del risultato.
//
// Scrittura di testo in caselle gestite da framework (React, ProseMirror) in modo che lo stato
// interno del sito resti coerente con il DOM.

(function (root) {
  'use strict';
  const PG = (root.PG = root.PG || {});

  function isTextFormControl(el) {
    if (!el) return false;
    if (el.tagName === 'TEXTAREA') return true;
    return el.tagName === 'INPUT' && ['text', 'search', 'url', 'email', 'tel', ''].includes(el.type);
  }

  /** Usa il setter nativo di `value` così React rileva la modifica (come nell'originale DFKI). */
  function setFormControlValue(el, value) {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new InputEvent('input', { inputType: 'insertReplacementText', data: value, bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function tryExec(cmd, arg) {
    if (typeof document.execCommand !== 'function') return false;
    try {
      return document.execCommand(cmd, false, arg);
    } catch (_) {
      return false;
    }
  }

  function selectAllIn(el) {
    el.focus();
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function tick(ms) {
    return new Promise((r) => setTimeout(r, ms || 0));
  }

  /**
   * Sostituisce tutto il contenuto della casella con `text` e verifica il risultato.
   * @param {HTMLElement} el
   * @param {string} text
   * @param {(el:HTMLElement)=>string} readText  lettura del testo (dall'adattatore)
   * @returns {Promise<boolean>} true se la casella contiene il testo atteso
   */
  async function replaceAllText(el, text, readText) {
    const norm = PG.tags.normalizeForCompare;
    const ok = () => norm(readText(el)) === norm(text);

    if (isTextFormControl(el)) {
      setFormControlValue(el, text);
      await tick();
      return ok();
    }

    // 1) Incolla sintetico: ProseMirror gestisce a capo e paragrafi come in un incolla reale.
    try {
      selectAllIn(el);
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
      el.dispatchEvent(ev);
      await tick(30);
      if (ok()) return true;
    } catch (_) { /* si passa al tentativo successivo */ }

    // 2) execCommand insertText sulla selezione completa.
    selectAllIn(el);
    if (tryExec('insertText', text)) {
      await tick(30);
      if (ok()) return true;
    }

    // 3) Ultima risorsa: DOM diretto (un <p> per riga) + evento input.
    el.innerHTML = '';
    for (const line of text.split('\n')) {
      const p = document.createElement('p');
      if (line) p.textContent = line;
      else p.appendChild(document.createElement('br'));
      el.appendChild(p);
    }
    el.dispatchEvent(new InputEvent('input', { inputType: 'insertReplacementText', data: text, bubbles: true }));
    await tick(30);
    return ok();
  }

  PG.domInput = { isTextFormControl, setFormControlValue, replaceAllText, tick };
})(typeof globalThis !== 'undefined' ? globalThis : this);
