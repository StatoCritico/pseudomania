// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 gli autori di Pseudomania
//
// Personal edition: allowlist (termini mai mascherati) e filtro delle categorie particolari
// (artt. 9-10 GDPR). Porting in JavaScript di server/pseudogate/policy.py; i dati sono in
// policy-data.js (generato da scripts/genera-policy.py). Codice puro, testabile in Node.

(function (root) {
  'use strict';
  const PG = (root.PG = root.PG || {});

  // \w di Python (Unicode) → classe equivalente in JS (flag "u").
  const W = '[\\p{L}\\p{N}_]';
  const W_IN_CLASS = '\\p{L}\\p{N}_';

  function normalize(value) {
    return String(value || '').normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
  }

  function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /** Converte una regex "alla Python" della configurazione in sorgente JS con flag "u". */
  function pyPattern(p) {
    p = String(p).trim();
    if (p.startsWith('(?i)')) p = p.slice(4);
    let out = '';
    let inClass = false;
    for (let i = 0; i < p.length; i++) {
      const c = p[i];
      if (c === '\\' && i + 1 < p.length) {
        const n = p[i + 1];
        if (n === 'w') out += inClass ? W_IN_CLASS : W;
        else if (n === 'W') out += inClass ? '^' + W_IN_CLASS : '[^\\p{L}\\p{N}_]';
        else out += c + n;
        i++;
        continue;
      }
      if (c === '[' && !inClass) inClass = true;
      else if (c === ']' && inClass) inClass = false;
      out += c;
    }
    return `(?:${out})`;
  }

  /** Termine → regex a confini di parola; '*' finale = prefisso (es. 'sieropositiv*'). */
  function termRegex(term) {
    const prefix = term.endsWith('*');
    const core = prefix ? term.slice(0, -1) : term;
    const body = core.split(/\s+/).filter(Boolean).map(escapeRe).join('\\s+');
    return `(?<!${W})${body}${prefix ? W + '*' : `(?!${W})`}`;
  }

  class Allowlist {
    constructor(data) {
      data = data || {};
      this.version = String(data.version || '0');
      this.terms = (data.terms || []).map(String);
      this.norm = new Set(this.terms.map(normalize));
      const alts = this.terms.map(termRegex).concat((data.patterns || []).map(pyPattern));
      this.rxSource = alts.length ? alts.join('|') : null;
      this.types = new Set((data.never_mask_types || []).map((t) => String(t).toUpperCase()));
    }

    /** Scarta le entità in allowlist o comprese in un termine in allowlist (es. 'Roma' in 'Comune di Roma'). */
    filter(text, detections) {
      if (!detections.length) return detections;
      const spans = [];
      if (this.rxSource) {
        const rx = new RegExp(this.rxSource, 'giu');
        let m;
        while ((m = rx.exec(text)) !== null) {
          if (m[0] === '') {
            rx.lastIndex++;
            continue;
          }
          spans.push([m.index, m.index + m[0].length]);
        }
      }
      return detections.filter((d) => {
        if (this.types.has(String(d.label).toUpperCase())) return false;
        if (this.norm.has(normalize(d.value))) return false;
        return !spans.some(([s, e]) => s <= d.start && d.end <= e);
      });
    }
  }

  const DEFAULT_MESSAGE =
    'Il contenuto sembra includere {label} (art. {article} GDPR), ad esempio «{term}». ' +
    'Questi dati non dovrebbero essere inviati a un servizio di IA esterno, nemmeno pseudonimizzati. ' +
    'Rimuovi o generalizza questi riferimenti e riprova.';

  class SpecialCategoryFilter {
    constructor(data) {
      data = data || {};
      this.version = String(data.version || '0');
      this.message = data.message || DEFAULT_MESSAGE;
      this.categories = (data.categories || []).map((c) => {
        const alts = (c.terms || []).map(termRegex).concat((c.patterns || []).map(pyPattern));
        return { id: c.id, article: c.article, label: c.label, action: c.action || 'block', rx: alts.length ? new RegExp(alts.join('|'), 'iu') : null };
      });
    }

    scan(text) {
      if (!text) return [];
      const out = [];
      for (const c of this.categories) {
        if (!c.rx) continue;
        const m = c.rx.exec(text);
        if (m) out.push({ category: c.id, article: c.article, label: c.label, term: m[0], action: c.action });
      }
      return out;
    }

    firstBlock(text) {
      return this.scan(text).find((m) => m.action === 'block') || null;
    }

    /** Messaggio di blocco; `template` (facoltativo) sostituisce quello delle regole (Personal edition). */
    reason(m, template) {
      const term = m.term.length <= 60 ? m.term : m.term.slice(0, 57) + '...';
      return (template || this.message).replace(/\{label\}/g, m.label).replace(/\{article\}/g, m.article).replace(/\{term\}/g, term);
    }
  }

  function fromBundled() {
    const d = PG.policyData || { allowlist: {}, special: {} };
    return { allowlist: new Allowlist(d.allowlist), special: new SpecialCategoryFilter(d.special) };
  }

  const api = { normalize, termRegex, pyPattern, Allowlist, SpecialCategoryFilter, fromBundled };
  PG.policy = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
