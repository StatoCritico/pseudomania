// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 gli autori di Pseudomania
//
// Controllo locale di base (rete di sicurezza secondaria). Usato SOLO in modalità non fail-closed,
// quando il server non risponde, per mostrare all'utente nella richiesta di conferma quali dati
// evidenti contiene il messaggio. Non maschera nulla: la pseudonimizzazione resta compito del server.
// Ispirato ai rilevatori a espressioni regolari/checksum di Privacy Guardrail (DFKI), riscritto.

(function (root) {
  'use strict';
  const PG = (root.PG = root.PG || {});

  const CF_ODD = {
    0: 1, 1: 0, 2: 5, 3: 7, 4: 9, 5: 13, 6: 15, 7: 17, 8: 19, 9: 21, A: 1, B: 0, C: 5, D: 7, E: 9, F: 13,
    G: 15, H: 17, I: 19, J: 21, K: 2, L: 4, M: 18, N: 20, O: 11, P: 3, Q: 6, R: 8, S: 12, T: 14, U: 16,
    V: 10, W: 22, X: 25, Y: 24, Z: 23,
  };

  function cfValid(cf) {
    cf = cf.toUpperCase();
    if (!/^[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/.test(cf)) return false;
    let sum = 0;
    for (let i = 0; i < 15; i++) {
      const c = cf[i];
      if (i % 2 === 0) sum += CF_ODD[c];
      else sum += /[0-9]/.test(c) ? Number(c) : c.charCodeAt(0) - 65;
    }
    return String.fromCharCode(65 + (sum % 26)) === cf[15];
  }

  function ibanValid(iban) {
    const s = iban.replace(/\s+/g, '').toUpperCase();
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false;
    const r = s.slice(4) + s.slice(0, 4);
    let rem = 0;
    for (const ch of r) {
      const v = /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch;
      for (const d of v) rem = (rem * 10 + Number(d)) % 97;
    }
    return rem === 1;
  }

  const RULES = [
    { type: 'EMAIL', re: /[\w.+-]+@[\w-]+(\.[\w-]+)+/g },
    { type: 'CF', re: /\b[A-Za-z]{6}[0-9LMNPQRSTUVlmnpqrstuv]{2}[A-Za-z][0-9LMNPQRSTUVlmnpqrstuv]{2}[A-Za-z][0-9LMNPQRSTUVlmnpqrstuv]{3}[A-Za-z]\b/g, check: cfValid },
    { type: 'IBAN', re: /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){2,7}(?:\s?[A-Z0-9]{1,4})?\b/g, check: ibanValid },
    { type: 'TELEPHONENUM', re: /(?<![\w\d])(?:\+39[\s.]?)?(?:3\d{2}|0\d{1,3})[\s.]?\d{3,4}[\s.]?\d{3,4}(?![\w\d])/g },
    { type: 'PIVA', re: /\b(?:IT)?\d{11}\b/g },
  ];

  /** @returns {{type:string,start:number,end:number}[]} */
  function detect(text) {
    const out = [];
    for (const r of RULES) {
      r.re.lastIndex = 0;
      let m;
      while ((m = r.re.exec(text)) !== null) {
        if (r.check && !r.check(m[0])) continue;
        out.push({ type: r.type, start: m.index, end: m.index + m[0].length });
      }
    }
    return out;
  }

  function summarize(text) {
    const counts = {};
    for (const e of detect(text)) counts[e.type] = (counts[e.type] || 0) + 1;
    return counts;
  }

  const LABELS = {
    EMAIL: 'indirizzi email', CF: 'codici fiscali', IBAN: 'IBAN', TELEPHONENUM: 'numeri di telefono',
    PIVA: 'partite IVA',
  };

  const api = { detect, summarize, cfValid, ibanValid, LABELS };
  PG.detectorLite = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
