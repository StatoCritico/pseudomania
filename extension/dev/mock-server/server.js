#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 gli autori di Pseudomania
//
// Server di PROVA della Server edition: implementa le API di SPEC.md/DECISIONI.md (cifratura
// lato client del dizionario, escrow, rotazione, recupero) con un rilevatore banale a regex.
// Solo per sviluppo e test dell'estensione: NON usarlo con dati reali.
//
//   node dev/mock-server/server.js            (porta 8787, token "dev-token", amministratore "admin-token")
//
// Come il server vero non conserva valori in chiaro: per ogni voce tiene l'«HMAC» del valore
// normalizzato e, dopo il caricamento dall'estensione, ciphertext/iv/keyId.
// La chiave privata di custodia è generata qui all'avvio (nel sistema vero è offline e divisa tra
// i custodi): serve agli endpoint di test che simulano i custodi.
//
// Endpoint di servizio per i test: GET /dev/events, /dev/calls, /dev/dictionary, /dev/plain (decifra
// con la chiave di custodia), /dev/escrows; POST /dev/reset, /dev/detector {"down"}, /dev/rotate,
// /dev/recover {"deviceKeyId","keyId"} (simula i custodi).

'use strict';
const http = require('http');
const crypto = require('crypto');

const TAG_INSTRUCTION =
  'I testi contengono segnaposto tra parentesi quadre come [FULLNAME_n] o [CF_n] (n = numero). Riportali esattamente ' +
  'come sono, senza modificarli, tradurli, declinarli o spiegarli, e non crearne di nuovi.';

const FIRST_NAMES = ['Mario', 'Luigi', 'Giulia', 'Anna', 'Marco', 'Paola', 'Giuseppe', 'Francesca', 'Luca', 'Maria'];
const ALLOWLIST = ['Claude', 'Anthropic', 'Comune'];
const BLOCK_WORDS = [/\bHIV\b/i, /sieropositiv/i, /condanna penale/i, /casellario giudiziale/i, /orientamento sessuale/i];
const RULES = [
  { type: 'EMAIL', re: /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g },
  { type: 'IBAN', re: /\bIT\d{2}[A-Z]\d{10}[0-9A-Z]{12}\b/g },
  { type: 'CF', re: /\b[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]\b/g },
  { type: 'TELEPHONENUM', re: /(?<!\d)(?:\+39\s?)?3\d{2}[\s.]?\d{3}[\s.]?\d{3,4}(?!\d)/g },
  { type: 'URL', re: /\bhttps?:\/\/[^\s)]+/g },
  { type: 'IPADDR', re: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g },
  { type: 'FULLNAME', re: new RegExp(`\\b(?:${FIRST_NAMES.join('|')})\\s+[A-Z][a-zà-ù]+\\b`, 'g') },
];
const TAG_RX = /^\[([A-Z]+(?:_[A-Z]+)*)_(\d+)\]$/;
const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ESCROW_KEY_ID = 'mock-escrow-1';
const HMAC_KEY = crypto.randomBytes(32);

let escrowPair = null;
function escrowKeys() {
  if (!escrowPair) escrowPair = crypto.generateKeyPairSync('rsa', { modulusLength: 4096 });
  return escrowPair;
}
const OAEP = (key) => ({ key, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' });

function createState() {
  return { scopes: new Map(), events: [], calls: [], detectorDown: false, escrows: new Map(), forceRotate: false, devices: new Map(), recovered: [], rid: 0 };
}
let state = createState();

const scopeKey = (t, id) => `${t}:${id}`;
const normalize = (v) => String(v).normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
const hmac = (n) => crypto.createHmac('sha256', HMAC_KEY).update(n).digest('base64');

function getScope(t, id, create) {
  const k = scopeKey(t, id);
  let s = state.scopes.get(k);
  if (!s && create) {
    s = { type: t, id, entries: new Map(), byHmac: new Map(), confirmBy: t === 'project' ? new Date(Date.now() + 365 * 86400000) : null };
    state.scopes.set(k, s);
  }
  return s;
}

function detect(text) {
  const found = [];
  for (const r of RULES) {
    r.re.lastIndex = 0;
    let m;
    while ((m = r.re.exec(text)) !== null) {
      if (ALLOWLIST.some((a) => a.toLowerCase() === m[0].toLowerCase())) continue;
      found.push({ type: r.type, start: m.index, end: m.index + m[0].length });
    }
  }
  found.sort((a, b) => a.start - b.start || b.end - a.end);
  const out = [];
  let last = -1;
  for (const f of found) {
    if (f.start < last) continue;
    if (/^\[[A-Z_]+_\d+\]$/.test(text.slice(f.start, f.end))) continue;
    out.push(f);
    last = f.end;
  }
  return out;
}

/** Tag stabili per scope; newEntries = voci ancora senza ciphertext (riproposte se ricompaiono). */
function pseudonymize(scope, text) {
  const s = getScope(scope.type, scope.id, true);
  const ents = detect(text);
  let result = '';
  let cur = 0;
  const entities = [];
  const newEntries = [];
  const offered = new Set();
  for (const e of ents) {
    const value = text.slice(e.start, e.end);
    const h = hmac(normalize(value));
    let tag = s.byHmac.get(h);
    if (!tag) {
      let n = 0;
      for (const t of s.entries.keys()) {
        const m = TAG_RX.exec(t);
        if (m && m[1] === e.type) n = Math.max(n, Number(m[2]));
      }
      tag = `[${e.type}_${n + 1}]`;
      s.byHmac.set(h, tag);
      s.entries.set(tag, { type: e.type, hmac: h, ciphertext: null, iv: null, keyId: null, aadScope: null, pendingUntil: Date.now() + 10 * 60000, rid: ++state.rid });
    }
    const entry = s.entries.get(tag);
    if (!entry.ciphertext && !offered.has(tag)) {
      entry.pendingUntil = Date.now() + 10 * 60000;
      newEntries.push({ tag, value: value.trim() });
      offered.add(tag);
    }
    result += text.slice(cur, e.start) + tag;
    cur = e.end;
    entities.push({ tag, type: e.type, start: e.start, end: e.end });
  }
  result += text.slice(cur);
  return { text: result, entities, newEntries };
}

function checkBlocked(text) {
  for (const re of BLOCK_WORDS) {
    if (re.test(text)) {
      return 'Il testo sembra contenere dati di categorie particolari (artt. 9-10 GDPR): l\'invio non è consentito. ' +
        'Rimuovi queste informazioni e riprova.';
    }
  }
  return null;
}

function parseMultipart(buf, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '');
  if (!m) return null;
  const boundary = Buffer.from('--' + (m[1] || m[2]));
  const fields = {};
  let pos = buf.indexOf(boundary);
  while (pos !== -1) {
    const start = pos + boundary.length;
    if (buf.slice(start, start + 2).toString() === '--') break;
    const headerEnd = buf.indexOf('\r\n\r\n', start);
    if (headerEnd === -1) break;
    const headers = buf.slice(start + 2, headerEnd).toString('utf8');
    const next = buf.indexOf(boundary, headerEnd);
    const body = buf.slice(headerEnd + 4, next - 2);
    const name = /name="([^"]*)"/i.exec(headers);
    const filename = /filename="([^"]*)"/i.exec(headers);
    const ctype = /content-type:\s*([^\r\n]+)/i.exec(headers);
    if (name) {
      fields[name[1]] = filename
        ? { filename: filename[1], mime: ctype ? ctype[1].trim() : 'application/octet-stream', data: body }
        : body.toString('utf8');
    }
    pos = next;
  }
  return fields;
}

const b64len = (s) => {
  try {
    return Buffer.from(String(s), 'base64').length;
  } catch (_) {
    return -1;
  }
};

function decryptEntry(scope, tag, e) {
  const esc = state.escrows.get(e.keyId);
  if (!esc) return null;
  const raw = crypto.privateDecrypt(OAEP(escrowKeys().privateKey), Buffer.from(esc.wrappedKey, 'base64'));
  const ct = Buffer.from(e.ciphertext, 'base64');
  const aadScope = e.aadScope || scope;
  const d = crypto.createDecipheriv('aes-256-gcm', raw, Buffer.from(e.iv, 'base64'));
  d.setAAD(Buffer.from(`${aadScope.type}|${aadScope.id}|${tag}`));
  d.setAuthTag(ct.subarray(ct.length - 16));
  return Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]).toString('utf8');
}

const TEXT_EXT = /\.(txt|md|csv)$/i;

function send(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(obj === undefined ? '' : JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

function createServer(opts) {
  opts = opts || {};
  const TOKEN = opts.token || process.env.MOCK_TOKEN || 'dev-token';
  const ADMIN = opts.adminToken || process.env.MOCK_ADMIN_TOKEN || 'admin-token';
  const log = opts.quiet ? () => {} : (...a) => console.log(new Date().toISOString(), ...a);
  escrowKeys();

  return http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return send(res, 204);
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname;
    const raw = await readBody(req);
    let json = null;
    if ((req.headers['content-type'] || '').includes('application/json')) {
      try {
        json = JSON.parse(raw.toString('utf8') || '{}');
      } catch (_) {
        return send(res, 400, { error: 'bad_json', message: 'JSON non valido' });
      }
    }
    log(req.method, p);

    // --- servizio per i test ---------------------------------------------------------------
    if (p === '/dev/events' && req.method === 'GET') return send(res, 200, state.events);
    if (p === '/dev/calls' && req.method === 'GET') return send(res, 200, state.calls);
    if (p === '/dev/reset' && req.method === 'POST') {
      state = createState();
      return send(res, 204);
    }
    if (p === '/dev/detector' && req.method === 'POST') {
      state.detectorDown = Boolean(json && json.down);
      return send(res, 204);
    }
    if (p === '/dev/rotate' && req.method === 'POST') {
      state.forceRotate = true;
      return send(res, 204);
    }
    if (p === '/dev/escrows' && req.method === 'GET') return send(res, 200, [...state.escrows.keys()]);
    if (p === '/dev/dictionary' && req.method === 'GET') {
      const out = {};
      for (const [k, s] of state.scopes) {
        out[k] = {};
        for (const [t, e] of s.entries) out[k][t] = { hasCiphertext: Boolean(e.ciphertext), keyId: e.keyId, aadScope: e.aadScope };
      }
      return send(res, 200, out);
    }
    if (p === '/dev/plain' && req.method === 'GET') {
      // Simula i custodi: decifra con la chiave privata di custodia.
      const out = {};
      for (const [k, s] of state.scopes) {
        out[k] = {};
        for (const [t, e] of s.entries) {
          if (!e.ciphertext) continue;
          try {
            out[k][t] = decryptEntry({ type: s.type, id: s.id }, t, e);
          } catch (err) {
            out[k][t] = '<non decifrabile: ' + err.message + '>';
          }
        }
      }
      return send(res, 200, out);
    }
    if (p === '/dev/recover' && req.method === 'POST') {
      const dev = state.devices.get(json.deviceKeyId);
      const esc = state.escrows.get(json.keyId);
      if (!dev || !esc) return send(res, 404, { error: 'not_found', message: 'dispositivo o escrow inesistente' });
      const rawKey = crypto.privateDecrypt(OAEP(escrowKeys().privateKey), Buffer.from(esc.wrappedKey, 'base64'));
      const pub = crypto.createPublicKey({ key: Buffer.from(dev.publicKey, 'base64'), format: 'der', type: 'spki' });
      const wrapped = crypto.publicEncrypt(OAEP(pub), rawKey).toString('base64');
      state.recovered.push({ keyId: json.keyId, wrappedKey: wrapped, deviceKeyId: json.deviceKeyId, createdAt: new Date().toISOString() });
      return send(res, 204);
    }

    if (p === '/v1/source' && req.method === 'GET') {
      return send(res, 200, { license: 'AGPL-3.0-or-later', source: process.env.SOURCE_URL || 'https://example.org/pseudomania', version: '0.0.0-mock' });
    }
    if (p === '/v1/health' && req.method === 'GET') {
      return send(res, 200, { status: state.detectorDown ? 'degraded' : 'ok', version: '0.0.0-mock', mode: 'ente', detector: state.detectorDown ? 'down' : 'ok', keys: 'ok' });
    }

    // POST /v1/keys/recovered: solo amministratore
    if (p === '/v1/keys/recovered' && req.method === 'POST') {
      if (req.headers.authorization !== `Bearer ${ADMIN}`) return send(res, 401, { error: 'unauthorized', message: 'Token amministratore non valido' });
      for (const k of json.keys || []) state.recovered.push({ keyId: k.keyId, wrappedKey: k.wrappedKey, deviceKeyId: k.deviceKeyId, createdAt: new Date().toISOString() });
      return send(res, 204);
    }

    if (req.headers.authorization !== `Bearer ${TOKEN}`) return send(res, 401, { error: 'unauthorized', message: 'Token non valido' });

    if (p === '/v1/config' && req.method === 'GET') {
      return send(res, 200, {
        mode: 'ente', failClosed: true, allowDisable: false, tagInstruction: TAG_INSTRUCTION,
        allowlist: ALLOWLIST, policyVersion: 'mock-1', maxFileMB: 5,
        escrowPublicKey: escrowKeys().publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
        escrowKeyId: ESCROW_KEY_ID, rotateKey: state.forceRotate, keyRotationDays: 90, pendingEntryMinutes: 10,
      });
    }

    if (p === '/v1/keys/escrow' && req.method === 'POST') {
      if (!UUID_RX.test(json.keyId || '')) return send(res, 400, { error: 'bad_request', message: 'keyId non valido' });
      if (json.escrowKeyId !== ESCROW_KEY_ID) return send(res, 409, { error: 'escrow_key_mismatch', message: 'Chiave di custodia cambiata' });
      if (b64len(json.wrappedKey) !== 512) return send(res, 400, { error: 'bad_request', message: 'wrappedKey deve essere di 512 byte' });
      state.escrows.set(json.keyId, { wrappedKey: json.wrappedKey, escrowKeyId: json.escrowKeyId, createdAt: Date.now() });
      state.forceRotate = false;
      state.calls.push({ endpoint: 'keys/escrow', keyId: json.keyId });
      return send(res, 204);
    }

    if (p === '/v1/keys/device' && req.method === 'POST') {
      try {
        crypto.createPublicKey({ key: Buffer.from(json.publicKey, 'base64'), format: 'der', type: 'spki' });
      } catch (_) {
        return send(res, 400, { error: 'bad_request', message: 'Chiave pubblica non valida' });
      }
      const deviceKeyId = crypto.randomUUID();
      state.devices.set(deviceKeyId, { publicKey: json.publicKey });
      return send(res, 200, { deviceKeyId });
    }
    if (p === '/v1/keys/recovered' && req.method === 'GET') {
      return send(res, 200, { keys: state.recovered });
    }

    if (p === '/v1/pseudonymize' && req.method === 'POST') {
      if (state.detectorDown) return send(res, 503, { error: 'detector_down', message: 'Detector non disponibile' });
      const traceId = crypto.randomUUID();
      state.calls.push({ endpoint: 'pseudonymize', kind: json.kind, scope: json.scope, site: json.site });
      const reason = checkBlocked(json.text || '');
      if (reason) return send(res, 200, { text: '', entities: [], newEntries: [], blocked: true, blockReason: reason, traceId });
      const r = pseudonymize(json.scope, json.text || '');
      return send(res, 200, { text: r.text, entities: r.entities, newEntries: r.newEntries, blocked: false, blockReason: null, traceId });
    }

    if (p === '/v1/pseudonymize/file' && req.method === 'POST') {
      if (state.detectorDown) return send(res, 503, { error: 'detector_down', message: 'Detector non disponibile' });
      const f = parseMultipart(raw, req.headers['content-type']);
      if (!f || !f.file) return send(res, 400, { error: 'bad_request', message: 'file mancante' });
      const traceId = crypto.randomUUID();
      state.calls.push({ endpoint: 'pseudonymize/file', kind: f.kind, scope: { type: f.scope_type, id: f.scope_id } });
      if (f.file.data.length > 5 * 1024 * 1024) return send(res, 413, { error: 'too_large', message: 'File troppo grande' });
      if (!TEXT_EXT.test(f.file.filename)) {
        return send(res, 200, {
          filename: f.file.filename, mime: f.file.mime, contentB64: '', entities: [], newEntries: [], blocked: true,
          blockReason: 'Formato di file non supportato (server di prova: solo txt, md, csv).', traceId,
        });
      }
      const text = f.file.data.toString('utf8');
      const reason = checkBlocked(text);
      if (reason) return send(res, 200, { filename: f.file.filename, mime: f.file.mime, contentB64: '', entities: [], newEntries: [], blocked: true, blockReason: reason, traceId });
      const r = pseudonymize({ type: f.scope_type, id: f.scope_id }, text);
      return send(res, 200, {
        filename: f.file.filename, mime: f.file.mime || 'text/plain', contentB64: Buffer.from(r.text).toString('base64'),
        entities: r.entities.map(({ tag, type }) => ({ tag, type })), newEntries: r.newEntries, blocked: false, blockReason: null, traceId,
      });
    }

    if (p === '/v1/dictionary/entries' && req.method === 'POST') {
      const s = getScope(json.scope.type, json.scope.id, false);
      let stored = 0;
      const rejected = [];
      for (const e of json.entries || []) {
        const cur = s && s.entries.get(e.tag);
        if (!TAG_RX.test(e.tag || '')) rejected.push({ tag: e.tag, reason: 'tag_non_valido' });
        else if (!UUID_RX.test(e.keyId || '')) rejected.push({ tag: e.tag, reason: 'keyId_non_valido' });
        else if (b64len(e.iv) !== 12) rejected.push({ tag: e.tag, reason: 'iv_non_valido' });
        else if (b64len(e.ciphertext) < 17) rejected.push({ tag: e.tag, reason: 'ciphertext_non_valido' });
        else if (!state.escrows.has(e.keyId)) rejected.push({ tag: e.tag, reason: 'keyId_senza_escrow' });
        else if (!cur || cur.ciphertext || cur.pendingUntil < Date.now()) rejected.push({ tag: e.tag, reason: 'non_in_attesa_o_scaduta' });
        else {
          Object.assign(cur, { ciphertext: e.ciphertext, iv: e.iv, keyId: e.keyId, pendingUntil: null });
          stored++;
        }
      }
      state.calls.push({ endpoint: 'dictionary/entries', stored, rejected: rejected.length });
      return send(res, 200, { stored, rejected });
    }

    if (p === '/v1/dictionary/rekey' && req.method === 'GET') {
      const keyId = url.searchParams.get('key_id');
      const after = Number(url.searchParams.get('after') || 0);
      const limit = Number(url.searchParams.get('limit') || 500);
      const all = [];
      for (const s of state.scopes.values()) {
        for (const [tag, e] of s.entries) {
          if (e.keyId === keyId && e.ciphertext && e.rid > after) {
            const item = { scope: { type: s.type, id: s.id }, tag, ciphertext: e.ciphertext, iv: e.iv, keyId: e.keyId, rid: e.rid };
            if (e.aadScope) item.aadScope = e.aadScope;
            all.push(item);
          }
        }
      }
      all.sort((a, b) => a.rid - b.rid);
      const page = all.slice(0, limit);
      const next = all.length > limit ? page[page.length - 1].rid : null;
      return send(res, 200, { entries: page.map(({ rid, ...x }) => x), next });
    }
    if (p === '/v1/dictionary/rekey' && req.method === 'PUT') {
      if (!state.escrows.has(json.newKeyId)) return send(res, 400, { error: 'bad_request', message: 'newKeyId senza escrow' });
      let updated = 0;
      for (const e of json.entries || []) {
        const s = getScope(e.scope.type, e.scope.id, false);
        const cur = s && s.entries.get(e.tag);
        if (cur && cur.keyId === json.oldKeyId) {
          Object.assign(cur, { ciphertext: e.ciphertext, iv: e.iv, keyId: json.newKeyId, aadScope: null });
          updated++;
        }
      }
      let remaining = 0;
      for (const s of state.scopes.values()) for (const e of s.entries.values()) if (e.keyId === json.oldKeyId) remaining++;
      let escrowDeleted = false;
      if (remaining === 0 && state.escrows.has(json.oldKeyId)) {
        state.escrows.delete(json.oldKeyId);
        escrowDeleted = true;
      }
      state.calls.push({ endpoint: 'dictionary/rekey', updated, remaining });
      return send(res, 200, { updated, remaining, escrowDeleted });
    }

    if (p === '/v1/dictionary' && req.method === 'GET') {
      const s = getScope(url.searchParams.get('scope_type'), url.searchParams.get('scope_id'), false);
      const entries = {};
      if (s) {
        for (const [tag, e] of s.entries) {
          if (!e.ciphertext) continue;
          entries[tag] = { ciphertext: e.ciphertext, iv: e.iv, keyId: e.keyId };
          if (e.aadScope) entries[tag].aadScope = e.aadScope;
        }
      }
      return send(res, 200, {
        entries, expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
        confirmBy: s && s.confirmBy ? s.confirmBy.toISOString() : null,
      });
    }

    if (p === '/v1/reidentify/file' && req.method === 'POST') {
      const f = parseMultipart(raw, req.headers['content-type']);
      if (!f || !f.file) return send(res, 400, { error: 'bad_request', message: 'file mancante' });
      if (!TEXT_EXT.test(f.file.filename) && !/^text\//.test(f.file.mime)) {
        return send(res, 415, { error: 'unsupported', message: 'Formato non supportato dal server di prova' });
      }
      let entries = {};
      try {
        entries = JSON.parse(f.entries || '{}');
      } catch (_) {
        return send(res, 400, { error: 'bad_request', message: 'entries non valido' });
      }
      const s = getScope(f.scope_type, f.scope_id, false);
      const unknown = new Set();
      const text = f.file.data.toString('utf8').replace(/\[[A-Z]+(?:_[A-Z]+)*_\d+\]/g, (t) => {
        if (s && s.entries.has(t) && typeof entries[t] === 'string') return entries[t];
        unknown.add(t);
        return t;
      });
      return send(res, 200, {
        filename: f.file.filename, mime: f.file.mime, contentB64: Buffer.from(text).toString('base64'),
        entities: [], unknownTags: [...unknown], traceId: null,
      });
    }

    if (p === '/v1/scopes/rebind' && req.method === 'POST') {
      const from = getScope(json.from.type, json.from.id, false);
      if (from) {
        const to = getScope(json.to.type, json.to.id, true);
        for (const [tag, e] of from.entries) {
          const other = to.entries.get(tag);
          if (other && other.hmac !== e.hmac) return send(res, 409, { error: 'rebind_conflict', message: 'Tag in conflitto' });
          const byH = to.byHmac.get(e.hmac);
          if (byH && byH !== tag) return send(res, 409, { error: 'rebind_conflict', message: 'Tag in conflitto' });
        }
        for (const [tag, e] of from.entries) {
          if (!e.aadScope) e.aadScope = { type: from.type, id: from.id };
          to.entries.set(tag, e);
          to.byHmac.set(e.hmac, tag);
        }
        state.scopes.delete(scopeKey(from.type, from.id));
      }
      return send(res, 204);
    }

    const conf = /^\/v1\/scopes\/(conversation|project)\/([^/]+)\/confirm$/.exec(p);
    if (conf && req.method === 'POST') {
      if (conf[1] !== 'project') return send(res, 400, { error: 'bad_request', message: 'Solo i progetti si confermano' });
      const s = getScope('project', decodeURIComponent(conf[2]), true);
      s.confirmBy = new Date(Date.now() + 365 * 86400000);
      state.calls.push({ endpoint: 'confirm', scope: { type: 'project', id: s.id } });
      return send(res, 204);
    }

    const del = /^\/v1\/scopes\/(conversation|project)\/([^/]+)$/.exec(p);
    if (del && req.method === 'DELETE') {
      state.scopes.delete(scopeKey(del[1], decodeURIComponent(del[2])));
      return send(res, 204);
    }

    if (p === '/v1/events' && req.method === 'POST') {
      state.events.push(Object.assign({ receivedAt: new Date().toISOString() }, json));
      return send(res, 204);
    }

    return send(res, 404, { error: 'not_found', message: 'Endpoint sconosciuto' });
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 8787);
  createServer().listen(port, '127.0.0.1', () => {
    console.log(`Server di prova Pseudomania (Server edition) su http://127.0.0.1:${port} (token: ${process.env.MOCK_TOKEN || 'dev-token'})`);
  });
}

module.exports = { createServer, detect, pseudonymize, parseMultipart, getState: () => state };
