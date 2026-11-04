// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 gli autori di Pseudomania
//
// PDF di solo testo (A4, Helvetica, codifica WinAnsi) generato senza librerie. Usato per il
// ripristino dei PDF scaricati nella Personal edition: l'impaginazione originale non si conserva,
// il testo sì.

(function (root) {
  'use strict';
  const PG = (root.PG = root.PG || {});

  // Caratteri di WinAnsiEncoding fuori da Latin-1 (0x80-0x9F).
  const WIN = { '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89,
    'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95,
    '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b, 'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f };

  function encodeChar(ch) {
    if (WIN[ch] !== undefined) return WIN[ch];
    const c = ch.codePointAt(0);
    if (c < 0x80 || (c >= 0xa0 && c <= 0xff)) return c;
    return 0x3f; // «?»
  }

  function escapeBytes(str) {
    let s = '';
    for (const ch of str) {
      const b = encodeChar(ch);
      if (b === 0x28 || b === 0x29 || b === 0x5c) s += '\\' + String.fromCharCode(b);
      else if (b < 0x20 || b > 0x7e) s += '\\' + b.toString(8).padStart(3, '0');
      else s += String.fromCharCode(b);
    }
    return s;
  }

  function wrap(text, maxChars) {
    const out = [];
    for (const raw of String(text).replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n')) {
      let line = raw;
      while (line.length > maxChars) {
        let cut = line.lastIndexOf(' ', maxChars);
        if (cut < maxChars * 0.5) cut = maxChars;
        out.push(line.slice(0, cut));
        line = line.slice(cut).replace(/^ /, '');
      }
      out.push(line);
    }
    return out;
  }

  /** @returns {Uint8Array} */
  function textToPdf(text, opts) {
    opts = opts || {};
    const fontSize = opts.fontSize || 10;
    const leading = fontSize * 1.4;
    const W = 595.28, H = 841.89, M = 56;
    const perPage = Math.floor((H - 2 * M) / leading);
    const lines = wrap(text, opts.maxChars || 95);
    const pages = [];
    for (let i = 0; i < Math.max(lines.length, 1); i += perPage) pages.push(lines.slice(i, i + perPage));

    const objs = []; // stringhe (già solo ASCII)
    const add = (s) => objs.push(s) && objs.length;
    add('<< /Type /Catalog /Pages 2 0 R >>');
    add('PAGES');
    add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const kids = [];
    for (const pl of pages) {
      let body = `BT /F1 ${fontSize} Tf ${leading.toFixed(2)} TL ${M} ${(H - M - fontSize).toFixed(2)} Td\n`;
      for (const l of pl) body += `(${escapeBytes(l)}) Tj T*\n`;
      body += 'ET';
      const c = add(`<< /Length ${body.length} >>\nstream\n${body}\nendstream`);
      kids.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${c} 0 R >>`));
    }
    objs[1] = `<< /Type /Pages /Kids [${kids.map((k) => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`;
    let pdf = '%PDF-1.4\n';
    const offs = [];
    objs.forEach((o, i) => {
      offs.push(pdf.length);
      pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
    });
    const xref = pdf.length;
    pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
    for (const o of offs) pdf += String(o).padStart(10, '0') + ' 00000 n \n';
    pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    const bytes = new Uint8Array(pdf.length);
    for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
    return bytes;
  }

  PG.pdfwrite = { textToPdf, wrap };
  if (typeof module !== 'undefined' && module.exports) module.exports = PG.pdfwrite;
})(typeof globalThis !== 'undefined' ? globalThis : this);
