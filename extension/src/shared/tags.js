// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 gli autori di Pseudomania
//
// Segnaposto [TIPO_N] (vedi SPEC.md, «Formato dei segnaposto»): ricerca, ripristino su testo
// semplice e piano di riscrittura per testo distribuito su più nodi DOM (streaming, markup inline).
// Nessun accesso al DOM né a chrome.*: è codice puro e testabile in Node.

(function (root) {
  'use strict';
  const PG = (root.PG = root.PG || {});

  /** Etichette Rizzo-PII previste dalla SPEC. */
  const KNOWN_TYPES = [
    'FULLNAME', 'EMAIL', 'TELEPHONENUM', 'STREET', 'BUILDINGNUM', 'ZIPCODE', 'CITY', 'PROVINCE',
    'IBAN', 'CREDITCARDNUMBER', 'AMOUNT', 'CF', 'PIVA', 'CATASTO', 'DOCID', 'ID_DOC', 'ORG', 'DATE',
    'TIME', 'TARGA', 'AGE', 'GENDER', 'URL', 'IPADDR',
  ];
  const KNOWN_SET = new Set(KNOWN_TYPES);

  const TAG_SOURCE = '\\[([A-Z]+(?:_[A-Z]+)*)_(\\d+)\\]';
  /** Separatore inserito tra blocchi diversi: impedisce che un segnaposto «attraversi» due paragrafi. */
  const BLOCK_SEP = '\u0000';

  function tagRegex() {
    return new RegExp(TAG_SOURCE, 'g');
  }

  /** Tutti i segnaposto ben formati presenti nel testo. */
  function findTags(text) {
    const out = [];
    const re = tagRegex();
    let m;
    while ((m = re.exec(text)) !== null) {
      out.push({ tag: m[0], type: m[1], n: Number(m[2]), start: m.index, end: m.index + m[0].length });
    }
    return out;
  }

  function isKnownType(type) {
    return KNOWN_SET.has(type);
  }

  function findAll(haystack, needle) {
    const out = [];
    if (!needle) return out;
    let i = haystack.indexOf(needle);
    while (i !== -1) {
      out.push([i, i + needle.length]);
      i = haystack.indexOf(needle, i + needle.length);
    }
    return out;
  }

  /**
   * Piano di riscrittura per una sequenza di segmenti di testo (tipicamente i nodi di testo di un
   * blocco, in ordine di documento). I segnaposto possono essere spezzati su più segmenti.
   *
   * @param {{raw:string, sep?:boolean}[]} segments  `sep` = il segmento inizia un nuovo blocco
   * @param {Object<string,string>} entries          dizionario tag → valore reale
   * @param {{excludeTexts?:string[], unrecoverable?:string[]}} [opts]  testi da non toccare (istruzione
   *        fissa); segnaposto «non ripristinabili» (keyId sconosciuto: cambio PC)
   * @returns {{segments:{rendered:string,highlights:{start:number,end:number,kind:string,tag:string}[]}[],
   *            restored:string[], unknown:string[], joined:string}}
   *
   * Regola: il valore reale viene scritto interamente nel segmento in cui il segnaposto inizia; le
   * parti del segnaposto negli altri segmenti vengono rimosse. I segnaposto di tipo noto assenti dal
   * dizionario restano visibili e vengono marcati come «unknown».
   */
  function planRewrite(segments, entries, opts) {
    entries = entries || {};
    opts = opts || {};
    let joined = '';
    const bounds = [];
    segments.forEach((s, i) => {
      if (i > 0 && s.sep) joined += BLOCK_SEP;
      const start = joined.length;
      joined += s.raw;
      bounds.push([start, joined.length]);
    });

    const excluded = [];
    for (const t of opts.excludeTexts || []) excluded.push(...findAll(joined, t));
    const isExcluded = (a, b) => excluded.some(([x, y]) => a < y && b > x);

    const matches = [];
    const restored = new Set();
    const unknown = new Set();
    const unrec = new Set(opts.unrecoverable || []);
    const unrecoverable = new Set();
    for (const t of findTags(joined)) {
      if (isExcluded(t.start, t.end)) continue;
      if (Object.prototype.hasOwnProperty.call(entries, t.tag)) {
        matches.push({ ...t, action: 'replace', value: String(entries[t.tag]) });
        restored.add(t.tag);
      } else if (unrec.has(t.tag)) {
        matches.push({ ...t, action: 'mark', kind: 'unrecoverable' });
        unrecoverable.add(t.tag);
      } else if (isKnownType(t.type)) {
        matches.push({ ...t, action: 'mark' });
        unknown.add(t.tag);
      }
    }

    const outSegments = bounds.map(([segStart, segEnd]) => {
      let out = '';
      const highlights = [];
      let cursor = segStart;
      for (const m of matches) {
        if (m.end <= segStart || m.start >= segEnd) continue;
        const a = Math.max(m.start, segStart);
        if (a > cursor) out += joined.slice(cursor, a);
        if (m.action === 'replace') {
          if (m.start >= segStart) {
            highlights.push({ start: out.length, end: out.length + m.value.length, kind: 'restored', tag: m.tag });
            out += m.value;
          }
          cursor = Math.min(m.end, segEnd);
        } else {
          const b = Math.min(m.end, segEnd);
          highlights.push({ start: out.length, end: out.length + (b - a), kind: m.kind || 'unknown', tag: m.tag });
          out += joined.slice(a, b);
          cursor = b;
        }
      }
      if (cursor < segEnd) out += joined.slice(cursor, segEnd);
      return { rendered: out, highlights };
    });

    return { segments: outSegments, restored: [...restored], unknown: [...unknown], unrecoverable: [...unrecoverable], joined };
  }

  /** Ripristino su una stringa singola. */
  function restoreText(text, entries, opts) {
    const plan = planRewrite([{ raw: text }], entries, opts);
    return { text: plan.segments[0].rendered, restored: plan.restored, unknown: plan.unknown };
  }

  /** Sostituisce nel testo i valori reali noti con i rispettivi segnaposto (per note e segnalazioni). */
  function maskKnownValues(text, entries) {
    const pairs = Object.entries(entries || {})
      .filter(([, v]) => v && String(v).trim().length >= 2)
      .sort((a, b) => String(b[1]).length - String(a[1]).length);
    let out = text;
    for (const [tag, value] of pairs) {
      const esc = String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      out = out.replace(new RegExp(esc, 'gi'), tag);
    }
    return out;
  }

  /**
   * Forma normalizzata per confrontare un testo approvato con quello effettivamente inviato dal
   * sito (che può convertire spazi, a capo e markup in modo diverso dalla casella di scrittura).
   */
  function normalizeForCompare(text) {
    return String(text || '')
      .normalize('NFC')
      .replace(/[\s*_`#>~\- ​]+/g, '')
      .toLowerCase();
  }

  const api = {
    KNOWN_TYPES, TAG_SOURCE, BLOCK_SEP, tagRegex, findTags, isKnownType, planRewrite, restoreText,
    maskKnownValues, normalizeForCompare,
  };
  PG.tags = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
