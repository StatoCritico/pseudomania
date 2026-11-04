// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 gli autori di Pseudomania
//
// Personal edition: client di Rizzo-PII desktop (http://127.0.0.1:5005) e pipeline di rilevamento.
// Porting di server/pseudogate/detector.py e di parte di pseudonymizer.py.
//
// Formato (verificato dall'agente server sul sorgente di Rizzo-PII, src/app/app.py):
//   POST /analyze JSON {"text", "exclude_tags":[...], "include_mapping": true}
//        oppure multipart: campo "file" + "exclude_tags" (CSV) + "include_mapping"
//   200 → {"segments":[{"t"} | {"label","ph","src","validated","t"}], "source_text"?, ...}
//   400 → {"error"}   GET /health → 200 | 503 (modello in caricamento)
//   Rizzo fa text.strip(): gli offset dei segmenti valgono sul testo senza spazi iniziali.

(function (root) {
  'use strict';
  const PG = (root.PG = root.PG || {});

  // Separatore fra frammenti (celle, paragrafi) analizzati insieme: "|" impedisce alle regex di
  // Rizzo di unire contenuti di celle diverse in un'unica entità (come nel server).
  const UNIT_SEP = '\n\n|\n\n';

  class DetectorError extends Error {
    constructor(code, message) {
      super(message || code);
      this.code = code; // detector_down | detector_rejected | cors
    }
  }

  /** Ricostruisce gli offset dai segmenti (che coprono tutto il testo, in ordine). */
  function segmentsToDetections(segments, stripped, offset) {
    const out = [];
    let pos = 0;
    let consistent = true;
    for (const seg of segments) {
      const t = seg.t;
      if ('label' in seg) {
        if (t == null) throw new DetectorError('detector_down', 'Rizzo-PII non ha restituito i valori delle entità (include_mapping disattivato?).');
        if (stripped.slice(pos, pos + t.length) !== t) {
          consistent = false;
          break;
        }
        out.push({ start: offset + pos, end: offset + pos + t.length, label: seg.label, value: t });
      } else if (t != null && stripped.slice(pos, pos + t.length) !== t) {
        consistent = false;
        break;
      }
      pos += (t || '').length;
    }
    if (consistent && pos === stripped.length) return out;
    // Ripiego prudente: ricerca sequenziale dei valori.
    const res = [];
    let cursor = 0;
    for (const seg of segments) {
      if (!('label' in seg)) continue;
      const t = seg.t || '';
      let i = stripped.indexOf(t, cursor);
      if (i < 0) i = stripped.indexOf(t);
      if (i < 0) continue;
      res.push({ start: offset + i, end: offset + i + t.length, label: seg.label, value: t });
      cursor = i + t.length;
    }
    return res;
  }

  /** Ordina e scarta le sovrapposizioni (vince la più lunga). */
  function clean(dets) {
    const out = [];
    const sorted = [...dets].sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
    for (const d of sorted) {
      if (d.end <= d.start) continue;
      if (out.length && d.start < out[out.length - 1].end) continue;
      out.push(d);
    }
    return out;
  }

  class RizzoClient {
    /**
     * @param {string} baseUrl  es. http://127.0.0.1:5005
     * @param {{fetch?:Function, excludeTags?:string[], batchChars?:number, timeoutMs?:number}} [o]
     */
    constructor(baseUrl, o) {
      o = o || {};
      this.base = String(baseUrl || 'http://127.0.0.1:5005').replace(/\/+$/, '');
      this.fetch = o.fetch || ((...a) => root.fetch(...a));
      this.exclude = o.excludeTags || [];
      this.batchChars = o.batchChars || 200000;
      this.timeoutMs = o.timeoutMs || 600000;
    }

    async _fetch(path, init, timeoutMs) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs || this.timeoutMs);
      try {
        return await this.fetch(this.base + path, Object.assign({}, init, { signal: ctrl.signal }));
      } finally {
        clearTimeout(timer);
      }
    }

    /**
     * Stato del servizio locale: ok | loading (503, modello in caricamento) | cors (risponde ma
     * rifiuta l'origine dell'estensione) | down.
     */
    async health() {
      try {
        const r = await this._fetch('/health', { method: 'GET' }, 8000);
        if (r.ok) return 'ok';
        return r.status === 503 ? 'loading' : 'down';
      } catch (e) {
        // Un servizio lento (modello occupato su CPU) non è un rifiuto CORS: il timeout non va
        // scambiato per un blocco dell'origine.
        if (e && e.name === 'AbortError') return 'down';
        try {
          await this._fetch('/health', { method: 'GET', mode: 'no-cors' }, 3000);
          return 'cors'; // la richiesta «opaca» passa: il servizio c'è, ma blocca CORS
        } catch (__) {
          return 'down';
        }
      }
    }

    async _handle(r) {
      if (r.status === 200) return r.json();
      let msg = '';
      try {
        msg = (await r.json()).error || '';
      } catch (_) { /* nessun corpo JSON */ }
      if (r.status === 400 || r.status === 422) throw new DetectorError('detector_rejected', msg || 'Rizzo-PII ha rifiutato il contenuto.');
      throw new DetectorError('detector_down', `Rizzo-PII ha risposto HTTP ${r.status}`);
    }

    async _post(path, init) {
      try {
        return await this._fetch(path, Object.assign({ method: 'POST' }, init));
      } catch (e) {
        const state = await this.health();
        throw new DetectorError(state === 'cors' ? 'cors' : 'detector_down', String(e && e.message));
      }
    }

    /** Entità nel testo, con offset riferiti al testo originale (non «strippato»). */
    async analyzeText(text) {
      if (!text.trim()) return [];
      if (text.length <= this.batchChars) return this._analyzeOne(text, 0);
      const out = [];
      let start = 0;
      while (start < text.length) {
        let end = Math.min(text.length, start + this.batchChars);
        if (end < text.length) {
          const cut = Math.max(text.lastIndexOf('\n', end), text.lastIndexOf(' ', end));
          if (cut > start) end = cut;
        }
        out.push(...(await this._analyzeOne(text.slice(start, end), start)));
        start = end;
      }
      return out;
    }

    async _analyzeOne(text, base) {
      if (!text.trim()) return [];
      const lead = text.length - text.replace(/^\s+/, '').length;
      const r = await this._post('/analyze', {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, exclude_tags: this.exclude, include_mapping: true }),
      });
      const data = await this._handle(r);
      return segmentsToDetections(data.segments || [], text.trim(), base + lead);
    }

    /** Estrazione del testo + rilevamento fatti da Rizzo (PDF). */
    /**
     * Ripristino di un PDF con l'impaginazione originale (POST /restore/pdf, versioni di
     * Rizzo-PII che lo offrono). Restituisce null se il servizio non ha questa funzione.
     */
    async restorePdf(filename, bytes, mapping) {
      const fd = new FormData();
      fd.append('file', new Blob([bytes], { type: 'application/pdf' }), filename);
      fd.append('mapping', JSON.stringify(mapping));
      const r = await this._post('/restore/pdf', { body: fd });
      if (r.status === 404 || r.status === 405) return null;
      if (r.status !== 200) await this._handle(r);
      return new Uint8Array(await r.arrayBuffer());
    }

    async analyzeFile(filename, bytes, mime) {
      const fd = new FormData();
      fd.append('file', new Blob([bytes], { type: mime || 'application/octet-stream' }), filename);
      fd.append('exclude_tags', this.exclude.join(','));
      fd.append('include_mapping', 'true');
      const r = await this._post('/analyze', { body: fd });
      const data = await this._handle(r);
      let source = data.source_text;
      if (source == null) source = (data.segments || []).map((s) => s.t || '').join('');
      return { text: source, detections: segmentsToDetections(data.segments || [], source, 0) };
    }
  }

  /**
   * Rileva su più frammenti con UNA chiamata: unisce con UNIT_SEP, poi riparte le entità per
   * frammento (porting di Pseudonymizer.detect_units). `detect(text)` restituisce entità già pulite.
   */
  async function detectUnits(units, detect, allowlist) {
    const offsets = [];
    let pos = 0;
    for (const u of units) {
      offsets.push(pos);
      pos += u.length + UNIT_SEP.length;
    }
    const big = units.join(UNIT_SEP);
    const found = await detect(big);
    const perUnit = units.map(() => []);
    for (const d of found) {
      let i = 0;
      while (i + 1 < offsets.length && offsets[i + 1] <= d.start) i++;
      while (i < units.length && offsets[i] < d.end) {
        const uStart = offsets[i];
        const uEnd = uStart + units[i].length;
        const s = Math.max(d.start, uStart);
        const e = Math.min(d.end, uEnd);
        if (e > s) {
          const val = big.slice(s, e);
          if (val.trim()) {
            const lead = val.length - val.replace(/^\s+/, '').length;
            const trail = val.length - val.replace(/\s+$/, '').length;
            perUnit[i].push({ start: s - uStart + lead, end: e - uStart - trail, label: d.label, value: val.trim() });
          }
        }
        i++;
      }
    }
    return units.map((u, i) => (perUnit[i].length && allowlist ? clean(allowlist.filter(u, perUnit[i])) : perUnit[i]));
  }

  function applyReplacements(text, reps) {
    let out = '';
    let pos = 0;
    for (const r of [...reps].sort((a, b) => a.start - b.start)) {
      out += text.slice(pos, r.start) + r.tag;
      pos = r.end;
    }
    return out + text.slice(pos);
  }

  const api = { RizzoClient, DetectorError, segmentsToDetections, clean, detectUnits, applyReplacements, UNIT_SEP };
  PG.rizzo = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
