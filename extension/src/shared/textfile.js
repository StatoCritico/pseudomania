// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 gli autori di Pseudomania
//
// Personal edition: riconoscimento del formato dei file e testo con codifica (porting di
// server/pseudogate/files/__init__.py).

(function (root) {
  'use strict';
  const PG = (root.PG = root.PG || {});

  const MIME = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    txt: 'text/plain',
    md: 'text/markdown',
    csv: 'text/csv',
  };
  const TEXT_EXT = { '.txt': 'txt', '.text': 'txt', '.md': 'md', '.markdown': 'md', '.csv': 'csv' };

  function ext(name) {
    const m = String(name || '').toLowerCase().match(/\.[^./\\]+$/);
    return m ? m[0] : '';
  }

  /** @returns {Promise<{kind:string|null, reason?:string}>} */
  async function detectKind(filename, bytes) {
    const e = ext(filename);
    const head = String.fromCharCode(...bytes.subarray(0, 5));
    if (head === '%PDF-') return { kind: 'pdf' };
    if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3 && bytes[3] === 4) {
      const k = await PG.ooxml.detectOfficeKind(bytes);
      if (k) return { kind: k };
      return { kind: null, reason: 'Formato non supportato: sono accettati PDF, DOCX, XLSX, TXT, MD e CSV (i file con macro, .docm/.xlsm, e gli archivi .zip non sono ammessi).' };
    }
    if (TEXT_EXT[e]) {
      const sample = bytes.subarray(0, 4096);
      const utf16 = (bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff);
      if (!utf16 && sample.includes(0)) return { kind: null, reason: 'Il file di testo sembra binario: non può essere pseudonimizzato.' };
      return { kind: TEXT_EXT[e] };
    }
    if (['.doc', '.xls', '.ppt', '.pptx', '.odt', '.ods', '.rtf'].includes(e)) {
      return { kind: null, reason: `Il formato ${e} non è supportato: salva il file come DOCX, XLSX o PDF e riprova.` };
    }
    if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.heic', '.tif', '.tiff', '.bmp'].includes(e)) {
      return { kind: null, reason: 'Le immagini non sono ammesse: il testo contenuto in un\'immagine non può essere pseudonimizzato.' };
    }
    return { kind: null, reason: 'Formato non supportato: sono accettati PDF, DOCX, XLSX, TXT, MD e CSV.' };
  }

  /** Come Rizzo-PII: UTF-16 solo con BOM, poi UTF-8, poi windows-1252. */
  function decodeText(bytes) {
    if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return { text: new TextDecoder('utf-8').decode(bytes.subarray(3)), encoding: 'utf-8', bom: true };
    if (bytes[0] === 0xff && bytes[1] === 0xfe) return { text: new TextDecoder('utf-16le').decode(bytes.subarray(2)), encoding: 'utf-16le', bom: true };
    if (bytes[0] === 0xfe && bytes[1] === 0xff) return { text: new TextDecoder('utf-16be').decode(bytes.subarray(2)), encoding: 'utf-16be', bom: true };
    try {
      return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'utf-8', bom: false };
    } catch (_) {
      return { text: new TextDecoder('windows-1252').decode(bytes), encoding: 'windows-1252', bom: false };
    }
  }

  /** Riscrive il testo; le codifiche non UTF-8 diventano UTF-8 con BOM (come il server quando non codificabile). */
  function encodeText(dt, text) {
    const body = new TextEncoder().encode(text);
    if (dt.encoding === 'utf-8' && !dt.bom) return body;
    const out = new Uint8Array(body.length + 3);
    out.set([0xef, 0xbb, 0xbf]);
    out.set(body, 3);
    return out;
  }

  const api = { MIME, detectKind, decodeText, encodeText, ext };
  PG.textfile = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
