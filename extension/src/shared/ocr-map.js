// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 gli autori di Pseudomania
//
// Corrispondenza fra il testo letto con OCR (Tesseract) e le coordinate nell'immagine (vedi
// OCR-CONTRATTO.md, sezione 1): ricostruzione del testo con gli offset di ogni parola, calcolo dei
// riquadri neri da sovrapporre ai dati personali, stima della qualità della lettura, disegno dei
// riquadri su un canvas, testo unico dei PDF (testo di pagina + OCR) con i riquadri per pagina.
// Nessun accesso al DOM né a chrome.*: funziona nel service worker, nel documento offscreen e in Node.

(function (root) {
  'use strict';
  const PG = (root.PG = root.PG || {});

  const DEFAULT_PAD = 3;
  const MIN_FONT_PX = 7;
  const LABEL_HEIGHT_RATIO = 0.7;

  function isNum(n) {
    return typeof n === 'number' && Number.isFinite(n);
  }

  /** Un bbox è valido se ha quattro coordinate finite e area positiva. */
  function validBbox(b) {
    return !!b && isNum(b.x0) && isNum(b.y0) && isNum(b.x1) && isNum(b.y1) && b.x1 > b.x0 && b.y1 > b.y0;
  }

  /**
   * Testo unico dalle righe OCR: parole della stessa riga separate da uno spazio, righe da «\n».
   * Le parole vuote (o solo spazi) sono scartate; le righe senza parole non producono righe vuote.
   *
   * @param {{words:{text:string,bbox:{x0:number,y0:number,x1:number,y1:number},conf:number}[]}[]} lines
   * @returns {{text:string, words:{text:string,start:number,end:number,bbox:Object,conf:number,line:number}[]}}
   */
  function buildText(lines) {
    let text = '';
    const words = [];
    (Array.isArray(lines) ? lines : []).forEach((line, li) => {
      const src = line && Array.isArray(line.words) ? line.words : [];
      let first = true;
      for (const w of src) {
        const t = w && w.text != null ? String(w.text).trim() : '';
        if (!t) continue;
        if (first) {
          if (text.length > 0) text += '\n';
          first = false;
        } else {
          text += ' ';
        }
        const start = text.length;
        text += t;
        const b = w.bbox || {};
        words.push({
          text: t,
          start,
          end: text.length,
          bbox: { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 },
          conf: isNum(w.conf) ? w.conf : 0,
          line: li,
        });
      }
    });
    return { text, words };
  }

  /** Allarga il riquadro di `pad` pixel e lo tiene dentro l'immagine (se ne sono note le dimensioni). */
  function finishBox(b, pad, width, height, label) {
    let x0 = Math.max(0, Math.floor(b.x0 - pad));
    let y0 = Math.max(0, Math.floor(b.y0 - pad));
    let x1 = Math.ceil(b.x1 + pad);
    let y1 = Math.ceil(b.y1 + pad);
    if (isNum(width) && width > 0) x1 = Math.min(width, x1);
    if (isNum(height) && height > 0) y1 = Math.min(height, y1);
    if (x1 <= x0 || y1 <= y0) return null;
    return { x0, y0, x1, y1, label };
  }

  /**
   * Riquadri da oscurare per gli span (offset nel testo di buildText). Ogni parola che interseca uno
   * span è coperta per intero (anche se lo span ne copre solo una parte: meglio coprire troppo che
   * troppo poco). Parole consecutive della stessa riga nello stesso span formano un unico riquadro
   * (min/max delle coordinate). L'etichetta è il tag solo sul primo riquadro di ciascuno span.
   *
   * @param {Array} words  parole restituite da buildText
   * @param {{start:number,end:number,tag:string}[]} spans
   * @param {{pad?:number,width?:number,height?:number}} [opts]
   * @returns {{x0:number,y0:number,x1:number,y1:number,label:string}[]}
   */
  function boxesForSpans(words, spans, opts) {
    opts = opts || {};
    const pad = isNum(opts.pad) && opts.pad >= 0 ? opts.pad : DEFAULT_PAD;
    const ws = Array.isArray(words) ? words : [];
    const out = [];
    for (const s of Array.isArray(spans) ? spans : []) {
      if (!s || !isNum(s.start) || !isNum(s.end) || s.end <= s.start) continue;
      const tag = s.tag != null ? String(s.tag) : '';
      const groups = [];
      let cur = null;
      let lastIdx = -2;
      ws.forEach((w, i) => {
        if (!w || !(w.start < s.end && w.end > s.start)) return;
        if (!validBbox(w.bbox)) return; // bbox inutilizzabile: ignorato
        const b = w.bbox;
        if (cur && cur.line === w.line && lastIdx === i - 1) {
          cur.x0 = Math.min(cur.x0, b.x0);
          cur.y0 = Math.min(cur.y0, b.y0);
          cur.x1 = Math.max(cur.x1, b.x1);
          cur.y1 = Math.max(cur.y1, b.y1);
        } else {
          cur = { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1, line: w.line };
          groups.push(cur);
        }
        lastIdx = i;
      });
      let labelled = false;
      for (const g of groups) {
        const box = finishBox(g, pad, opts.width, opts.height, labelled ? '' : tag);
        if (!box) continue;
        out.push(box);
        labelled = true;
      }
    }
    return out;
  }

  /**
   * Qualità della lettura: confidenza media e avviso se bassa (media < 60 oppure più del 25% delle
   * parole con confidenza < 50). Senza parole: noText = true e lowConf = false.
   */
  function quality(words) {
    const ws = Array.isArray(words) ? words : [];
    const wordCount = ws.length;
    if (wordCount === 0) return { wordCount: 0, meanConf: 0, lowConf: false, noText: true };
    let sum = 0;
    let low = 0;
    for (const w of ws) {
      const c = w && isNum(w.conf) ? w.conf : 0;
      sum += c;
      if (c < 50) low += 1;
    }
    const meanConf = Math.round((sum / wordCount) * 10) / 10;
    return { wordCount, meanConf, lowConf: meanConf < 60 || low / wordCount > 0.25, noText: false };
  }

  /**
   * Disegna i riquadri neri e, se c'è un'etichetta, il segnaposto in bianco ridimensionato per
   * stare nel riquadro (altezza circa 70% del box, ridotta finché measureText non entra; sotto
   * 7 px il testo non viene scritto).
   *
   * @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} ctx
   * @param {{x0:number,y0:number,x1:number,y1:number,label?:string}[]} boxes
   * @param {{fontFamily?:string}} [opts]
   */
  function drawRedactions(ctx, boxes, opts) {
    opts = opts || {};
    const family = opts.fontFamily || 'sans-serif';
    for (const b of Array.isArray(boxes) ? boxes : []) {
      if (!validBbox(b)) continue;
      const w = b.x1 - b.x0;
      const h = b.y1 - b.y0;
      ctx.fillStyle = '#000';
      ctx.fillRect(b.x0, b.y0, w, h);
      const label = b.label ? String(b.label) : '';
      if (!label) continue;
      const margin = Math.max(1, Math.round(h * 0.1));
      const maxW = w - 2 * margin;
      let size = Math.floor(h * LABEL_HEIGHT_RATIO);
      while (size >= MIN_FONT_PX) {
        ctx.font = size + 'px ' + family;
        if (ctx.measureText(label).width <= maxW) break;
        size -= 1;
      }
      if (size < MIN_FONT_PX) continue;
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, b.x0 + w / 2, b.y0 + h / 2);
    }
  }

  /**
   * Testo unico di un PDF preparato dal documento offscreen (`pdf:prepare`): per ogni pagina il testo
   * della pagina, poi (se la pagina ha `ocr`) «\n» + il testo OCR della pagina (buildText); pagine
   * separate da «\n\n». Le coordinate delle parole OCR sono già in punti della pagina.
   *
   * @param {{index:number,text?:string,ocr?:Array|null}[]} pages
   * @returns {{text:string,
   *   ocrWords:{page:number,start:number,end:number,bbox:Object,conf:number,line:number,text:string}[],
   *   regions:{page:number,kind:'text'|'ocr',start:number,end:number}[]}}
   *   `regions`: intervalli del testo complessivo che vengono dal testo di pagina o dall'OCR.
   */
  function pagesToDoc(pages) {
    let text = '';
    const ocrWords = [];
    const regions = [];
    (Array.isArray(pages) ? pages : []).forEach((p, i) => {
      if (i > 0) text += '\n\n';
      if (!p) return;
      const page = isNum(p.index) ? p.index : i;
      const pt = p.text != null ? String(p.text) : '';
      regions.push({ page, kind: 'text', start: text.length, end: text.length + pt.length });
      text += pt;
      if (Array.isArray(p.ocr)) {
        text += '\n';
        const base = text.length;
        const built = buildText(p.ocr);
        regions.push({ page, kind: 'ocr', start: base, end: base + built.text.length });
        text += built.text;
        for (const w of built.words) {
          ocrWords.push({ page, text: w.text, start: base + w.start, end: base + w.end, bbox: w.bbox, conf: w.conf, line: w.line });
        }
      }
    });
    return { text, ocrWords, regions };
  }

  /**
   * boxesForSpans applicata pagina per pagina alle parole di pagesToDoc: ogni riquadro porta `page`;
   * l'etichetta (tag) compare solo sul primo riquadro di ciascuno span, anche se lo span tocca più
   * pagine. `opts.sizes` (facoltativo): {pagina: {width, height}} per tenere i riquadri nella pagina.
   *
   * @param {Array} ocrWords  parole con `page` (pagesToDoc)
   * @param {{start:number,end:number,tag:string}[]} spans
   * @param {{pad?:number,sizes?:Object}} [opts]
   * @returns {{page:number,x0:number,y0:number,x1:number,y1:number,label:string}[]}
   */
  function boxesForPages(ocrWords, spans, opts) {
    opts = opts || {};
    const byPage = new Map();
    for (const w of Array.isArray(ocrWords) ? ocrWords : []) {
      if (!w || !isNum(w.page)) continue;
      if (!byPage.has(w.page)) byPage.set(w.page, []);
      byPage.get(w.page).push(w);
    }
    const order = [...byPage.keys()].sort((a, b) => a - b);
    const out = [];
    for (const s of Array.isArray(spans) ? spans : []) {
      if (!s || !isNum(s.start) || !isNum(s.end) || s.end <= s.start) continue;
      let labelled = false;
      for (const page of order) {
        const ws = byPage.get(page);
        if (!ws.some((w) => w.start < s.end && w.end > s.start)) continue;
        const size = (opts.sizes && opts.sizes[page]) || {};
        for (const b of boxesForSpans(ws, [s], { pad: opts.pad, width: size.width, height: size.height })) {
          out.push(Object.assign({ page }, b, { label: labelled ? '' : b.label }));
          labelled = true;
        }
      }
    }
    return out;
  }

  const api = { DEFAULT_PAD, MIN_FONT_PX, validBbox, buildText, boxesForSpans, quality, drawRedactions, pagesToDoc, boxesForPages };
  PG.ocrMap = api;
  if (typeof module === 'object' && module && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
