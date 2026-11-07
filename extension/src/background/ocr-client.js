// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 gli autori di Pseudomania
//
// Personal edition: client OCR del service worker (vedi OCR-CONTRATTO.md, sezione 3).
// Il service worker non ha DOM né canvas: Tesseract.js e MuPDF.js girano nel documento offscreen
// src/offscreen/ocr.html, che riceve i messaggi con `target: 'pg-offscreen'`. Tutto resta sul PC.

(function (root) {
  'use strict';
  const PG = (root.PG = root.PG || {});

  const OFFSCREEN_URL = 'src/offscreen/ocr.html';
  const TARGET = 'pg-offscreen';
  const TIMEOUT_MS = 120000;

  class OcrError extends Error {
    constructor(code, message) {
      super(message || code);
      this.name = 'OcrError';
      this.code = code; // decode | pdf | encrypted | ocr | timeout
    }
  }

  // Guardia contro creazioni concorrenti: più richieste ravvicinate condividono la stessa creazione.
  let creating = null;

  async function exists() {
    if (!chrome.runtime.getContexts) return false;
    const ctx = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)],
    });
    return Array.isArray(ctx) && ctx.length > 0;
  }

  /** Crea il documento offscreen se non esiste già. */
  async function ensure() {
    if (await exists()) return;
    if (!creating) {
      creating = (async () => {
        try {
          await chrome.offscreen.createDocument({
            url: OFFSCREEN_URL,
            reasons: ['WORKERS'],
            justification: 'Lettura OCR locale (Tesseract.js) di immagini e PDF scansionati per pseudonimizzarne il testo: nulla esce dal PC.',
          });
        } catch (e) {
          // Creato nel frattempo da un altro contesto: va bene.
          if (!/single offscreen|already/i.test(String(e && e.message))) throw e;
        }
      })();
    }
    try {
      await creating;
    } finally {
      creating = null;
    }
  }

  /** Invia una richiesta all'offscreen e restituisce `data`, o lancia OcrError. */
  async function call(type, payload, timeoutMs) {
    try {
      await ensure();
    } catch (e) {
      throw new OcrError('ocr', 'Documento OCR non disponibile: ' + String(e && e.message));
    }
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new OcrError('timeout', 'Lettura OCR troppo lunga: interrotta dopo ' + Math.round((timeoutMs || TIMEOUT_MS) / 1000) + ' s.')), timeoutMs || TIMEOUT_MS);
    });
    let res;
    try {
      res = await Promise.race([chrome.runtime.sendMessage(Object.assign({ target: TARGET, type }, payload)), timeout]);
    } catch (e) {
      if (e instanceof OcrError) throw e;
      throw new OcrError('ocr', String(e && e.message));
    } finally {
      clearTimeout(timer);
    }
    if (!res) throw new OcrError('ocr', 'Nessuna risposta dal documento OCR.');
    if (!res.ok) throw new OcrError(res.error || 'ocr', res.message || res.error || 'Errore OCR');
    return res.data;
  }

  const image = (b64, mime) => call('ocr:image', { b64, mime });
  const redact = (b64, mime, boxes, outMime) => call('ocr:redact', { b64, mime, boxes, outMime });

  // PDF (PDF-CONTRATTO.md, sezione A): MuPDF.js nel documento offscreen.
  const PDF_TIMEOUT_MS = 180000;
  /** opts: {imagePolicy:'ocr'|'remove'|'keep', maxOcrPages?:number} → {pageCount, truncated, pages}. */
  const pdfPrepare = (b64, opts) =>
    call('pdf:prepare', { b64, imagePolicy: (opts && opts.imagePolicy) || 'ocr', maxOcrPages: (opts && opts.maxOcrPages) || 30 }, PDF_TIMEOUT_MS);
  /** → {b64, report:{redacted, skipped, residual, imagesRemoved, ocrBoxes}} */
  const pdfRedact = (b64, mapping, ocrBoxes, imagePolicy) =>
    call('pdf:redact', { b64, mapping: mapping || {}, ocrBoxes: ocrBoxes || [], imagePolicy: imagePolicy || 'ocr' }, PDF_TIMEOUT_MS);
  /** → {b64, report:{restored, unknown}} */
  const pdfRestore = (b64, mapping) => call('pdf:restore', { b64, mapping: mapping || {} });

  const api = { ensure, image, redact, pdfPrepare, pdfRedact, pdfRestore, OcrError, TARGET, OFFSCREEN_URL, TIMEOUT_MS, PDF_TIMEOUT_MS, _call: call };
  PG.ocrClient = api;
  if (typeof module === 'object' && module && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
