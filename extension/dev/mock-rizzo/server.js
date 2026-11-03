#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 gli autori di Pseudomania
//
// Rizzo-PII FINTO per sviluppare e provare la Personal edition senza il modello vero.
// Riproduce il formato di POST /analyze (segmenti che coprono il testo, include_mapping,
// source_text per i file) e GET /health. Come il Flask di Rizzo-PII NON invia intestazioni CORS.
// Rilevatore banale a espressioni regolari: NON usarlo con dati reali.
//
//   node dev/mock-rizzo/server.js        (porta 5005)
//   PORT=5099 node dev/mock-rizzo/server.js
//
// «PDF» di prova: le righe che iniziano con "%TEXT: " sono il testo estratto.

'use strict';
const http = require('http');

const FIRST = ['Mario', 'Luigi', 'Giulia', 'Anna', 'Marco', 'Paola', 'Giuseppe', 'Francesca', 'Luca', 'Maria'];
const RULES = [
  ['EMAIL', /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g],
  ['IBAN', /\bIT\d{2}[A-Z]\d{10}[0-9A-Z]{12}\b/g],
  ['CF', /\b[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]\b/g],
  ['TELEPHONENUM', /(?<!\d)(?:\+39\s?)?3\d{2}[\s.]?\d{3}[\s.]?\d{3,4}(?!\d)/g],
  ['FULLNAME', new RegExp(`\\b(?:${FIRST.join('|')})\\s+[A-Z][a-zà-ù]+\\b`, 'g')],
];

function analyze(text, mapping) {
  const s = text.trim();
  const found = [];
  for (const [label, rx] of RULES) {
    rx.lastIndex = 0;
    let m;
    while ((m = rx.exec(s)) !== null) found.push({ label, start: m.index, end: m.index + m[0].length });
  }
  found.sort((a, b) => a.start - b.start || b.end - a.end);
  const segs = [];
  let pos = 0;
  const counters = {};
  const map = {};
  for (const f of found) {
    if (f.start < pos) continue;
    if (f.start > pos) segs.push({ t: s.slice(pos, f.start) });
    counters[f.label] = (counters[f.label] || 0) + 1;
    const ph = `[${f.label}_${counters[f.label]}]`;
    const seg = { label: f.label, ph, src: 'regex', validated: true };
    if (mapping) {
      seg.t = s.slice(f.start, f.end);
      map[ph] = seg.t;
    }
    segs.push(seg);
    pos = f.end;
  }
  if (pos < s.length) segs.push({ t: s.slice(pos) });
  return { segments: segs, mapping: mapping ? map : {}, mapping_enabled: Boolean(mapping), n_entities: found.length };
}

function parseMultipart(buf, ct) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(ct || '');
  if (!m) return {};
  const boundary = Buffer.from('--' + (m[1] || m[2]));
  const out = {};
  let pos = buf.indexOf(boundary);
  while (pos !== -1) {
    const start = pos + boundary.length;
    if (buf.slice(start, start + 2).toString() === '--') break;
    const he = buf.indexOf('\r\n\r\n', start);
    if (he < 0) break;
    const headers = buf.slice(start + 2, he).toString();
    const next = buf.indexOf(boundary, he);
    const body = buf.slice(he + 4, next - 2);
    const name = /name="([^"]*)"/.exec(headers);
    const fn = /filename="([^"]*)"/.exec(headers);
    if (name) out[name[1]] = fn ? { filename: fn[1], data: body } : body.toString();
    pos = next;
  }
  return out;
}

function createRizzo(opts) {
  opts = opts || {};
  return http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const send = (code, obj) => {
        res.writeHead(code, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(obj));
      };
      const body = Buffer.concat(chunks);
      if (req.url === '/health' && req.method === 'GET') {
        return opts.loading ? send(503, { status: 'loading' }) : send(200, { status: 'ok', model_loaded: true });
      }
      if (req.url === '/analyze' && req.method === 'POST') {
        const ct = req.headers['content-type'] || '';
        if (ct.includes('application/json')) {
          const j = JSON.parse(body.toString() || '{}');
          if (!String(j.text || '').trim()) return send(400, { error: 'Testo vuoto' });
          return send(200, analyze(j.text, Boolean(j.include_mapping)));
        }
        if (ct.includes('multipart/form-data')) {
          const f = parseMultipart(body, ct);
          const file = f.file || f.pdf;
          if (!file) return send(400, { error: 'Nessun file' });
          let text = file.data.toString('utf8');
          if (text.startsWith('%PDF-')) {
            text = text.split('\n').filter((l) => l.startsWith('%TEXT: ')).map((l) => l.slice(7)).join('\n');
          }
          if (!text.trim()) return send(400, { error: 'Nessun testo estraibile' });
          const mapping = String(f.include_mapping) === 'true';
          const r = analyze(text, mapping);
          if (mapping) r.source_text = text.trim();
          return send(200, r);
        }
        return send(400, { error: 'Formato non supportato' });
      }
      send(404, { error: 'not found' });
    });
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 5005);
  createRizzo().listen(port, '127.0.0.1', () => console.log(`Rizzo-PII finto su http://127.0.0.1:${port} (senza CORS)`));
}

module.exports = { createRizzo, analyze };
