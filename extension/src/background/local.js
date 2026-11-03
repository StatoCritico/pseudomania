// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 gli autori di Pseudomania
//
// Personal edition: estensione AUTONOMA, senza server Pseudomania. Parla direttamente con
// Rizzo-PII desktop (http://127.0.0.1:5005) e offre agli script di contenuto la stessa interfaccia
// di messaggi dell'Enterprise edition (pg:pseudonymize, pg:pseudonymizeFile, pg:dictionary…).
//
// - Tag stabili per scope assegnati qui; dizionario in IndexedDB, valori cifrati con una chiave
//   AES-GCM locale NON estraibile; l'indice valore→tag usa un HMAC con una chiave locale non
//   estraibile (nessun valore in chiaro su disco).
// - Registro locale (azioni, conteggi, hash; mai testi) cifrato con la stessa chiave.
// - Allowlist e categorie particolari incluse nell'estensione (policy-data.js).
// - Durate: chat 30 giorni dall'ultimo uso, scope pending 24 ore, progetti finché l'utente non li
//   elimina; registro 90 giorni.

(function (root) {
  'use strict';
  const PG = (root.PG = root.PG || {});
  const te = new TextEncoder();
  const td = new TextDecoder();
  const DAY = 86400000;
  const TAG_RX = /^\[([A-Z]+(?:_[A-Z]+)*)_(\d+)\]$/;

  let keysP = null;
  let policyCache = null;

  class Blocked extends Error {
    constructor(reason, category) {
      super(reason);
      this.category = category;
    }
  }

  const b64 = (buf) => PG.keys.b64(buf);
  const unb64 = (s) => PG.keys.unb64(s);
  const scopeKey = (s) => `${s.type}:${s.id}`;

  function policy() {
    if (!policyCache) policyCache = PG.policy.fromBundled();
    return policyCache;
  }

  function rizzo(cfg) {
    return new PG.rizzo.RizzoClient(cfg.rizzoUrl);
  }

  async function localKeys() {
    if (keysP) return keysP;
    keysP = (async () => {
      let rec = await PG.idb.get('meta', 'localKeys');
      if (!rec) {
        rec = {
          id: 'localKeys',
          aes: await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']),
          hmac: await crypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256' }, false, ['sign']),
          createdAt: Date.now(),
        };
        await PG.idb.put('meta', rec);
      }
      return rec;
    })();
    try {
      return await keysP;
    } catch (e) {
      keysP = null;
      throw e;
    }
  }

  async function hmac(value) {
    const k = await localKeys();
    return b64(await crypto.subtle.sign('HMAC', k.hmac, te.encode(value)));
  }

  async function enc(aadStr, value) {
    const k = await localKeys();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: te.encode(aadStr) }, k.aes, te.encode(value));
    return { iv: b64(iv), ct: b64(ct) };
  }

  async function dec(aadStr, rec) {
    const k = await localKeys();
    return td.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(rec.iv), additionalData: te.encode(aadStr) }, k.aes, unb64(rec.ct)));
  }

  // --- Dizionario ------------------------------------------------------------------------------
  async function loadScope(scope, create) {
    const key = scopeKey(scope);
    let rec = await PG.idb.get('pdict', key);
    if (!rec && create) rec = { scopeKey: key, type: scope.type, id: scope.id, createdAt: Date.now(), lastUsed: Date.now(), entries: {}, index: {} };
    return rec || null;
  }

  /** dets [{label, value}] → Map(valoreNormalizzato → {tag, type}). */
  async function assign(scope, dets) {
    const rec = await loadScope(scope, true);
    const out = new Map();
    const counters = {};
    for (const tag of Object.keys(rec.entries)) {
      const m = TAG_RX.exec(tag);
      if (m) counters[m[1]] = Math.max(counters[m[1]] || 0, Number(m[2]));
    }
    for (const d of dets) {
      const n = PG.policy.normalize(d.value);
      if (!n || out.has(n)) continue;
      const h = await hmac(`${scopeKey(scope)}|${n}`);
      let tag = rec.index[h];
      if (!tag) {
        const type = String(d.label).toUpperCase();
        counters[type] = (counters[type] || 0) + 1;
        tag = `[${type}_${counters[type]}]`;
        rec.index[h] = tag;
        rec.entries[tag] = Object.assign({ type }, await enc(`${scope.type}|${scope.id}|${tag}`, d.value.trim()));
      }
      out.set(n, { tag, type: rec.entries[tag].type });
    }
    rec.lastUsed = Date.now();
    await PG.idb.put('pdict', rec);
    return out;
  }

  async function replacementsFor(scope, dets) {
    if (!dets.length) return [];
    const map = await assign(scope, dets);
    return dets.map((d) => {
      const a = map.get(PG.policy.normalize(d.value));
      return { start: d.start, end: d.end, tag: a.tag, type: a.type, value: d.value };
    });
  }

  async function detect(cfg, text) {
    const raw = await rizzo(cfg).analyzeText(text);
    return PG.rizzo.clean(policy().allowlist.filter(text, raw));
  }

  function checkSpecial(text) {
    const hit = policy().special.firstBlock(text);
    if (hit) throw new Blocked(policy().special.reason(hit), hit.category);
  }

  function failure(e) {
    if (e && (e.code === 'detector_down' || e.code === 'cors')) return { ok: false, error: e.code, message: e.message };
    if (e && e.code === 'detector_rejected') return { ok: false, error: 'http', status: 400, message: e.message };
    return { ok: false, error: 'internal', message: String(e && e.message) };
  }

  const uniqueEntities = (reps) => {
    const seen = new Set();
    return reps.filter((r) => !seen.has(r.tag) && seen.add(r.tag)).map((r) => ({ tag: r.tag, type: r.type }));
  };

  async function sha256(text) {
    return b64(await crypto.subtle.digest('SHA-256', te.encode(text)));
  }

  function counts(reps) {
    const c = {};
    for (const r of reps) c[r.type] = (c[r.type] || 0) + 1;
    return c;
  }

  // --- Registro locale cifrato -----------------------------------------------------------------
  async function log(entry) {
    try {
      const ts = Date.now();
      const body = await enc(`log|${ts}`, JSON.stringify(entry));
      await PG.idb.add('plog', { ts, iv: body.iv, ct: body.ct });
    } catch (e) {
      console.warn('[Pseudomania] registro locale non scritto:', e && e.message);
    }
  }

  async function readLog() {
    const out = [];
    for (const r of await PG.idb.all('plog')) {
      try {
        out.push(Object.assign({ ts: new Date(r.ts).toISOString() }, JSON.parse(await dec(`log|${r.ts}`, r))));
      } catch (_) { /* voce illeggibile */ }
    }
    return out;
  }

  // --- Operazioni (stessa forma delle risposte del server) -------------------------------------
  async function pseudonymize(cfg, msg) {
    const traceId = crypto.randomUUID();
    const scope = msg.scope;
    const hit = policy().special.firstBlock(msg.text);
    if (hit) {
      await log({ action: 'pseudonymize', kind: msg.kind, scopeType: scope.type, blocked: true, category: hit.category, traceId });
      return { ok: true, data: { text: '', entities: [], newEntries: [], blocked: true, blockReason: policy().special.reason(hit), blockCategory: hit.category, traceId } };
    }
    try {
      const dets = await detect(cfg, msg.text);
      const reps = await replacementsFor(scope, dets);
      const text = PG.rizzo.applyReplacements(msg.text, reps);
      await log({ action: 'pseudonymize', kind: msg.kind, scopeType: scope.type, counts: counts(reps), sha256: await sha256(text), traceId });
      return {
        ok: true,
        data: { text, entities: reps.map((r) => ({ tag: r.tag, type: r.type, start: r.start, end: r.end })), newEntries: [], blocked: false, blockReason: null, traceId },
      };
    } catch (e) {
      return failure(e);
    }
  }

  async function pseudonymizeName(cfg, scope, filename) {
    const m = filename.match(/^(.*?)(\.[^.]*)?$/);
    const stem = m[1];
    const ext = m[2] || '';
    const readable = stem.replace(/_/g, ' ');
    if (!readable.trim()) return { name: filename, reps: [] };
    const dets = await detect(cfg, readable);
    if (!dets.length) return { name: filename, reps: [] };
    const reps = await replacementsFor(scope, dets.map((d) => Object.assign({}, d, { value: stem.slice(d.start, d.end).replace(/_/g, ' ') })));
    return { name: PG.rizzo.applyReplacements(stem, reps) + ext, reps };
  }

  async function pseudonymizeFile(cfg, msg) {
    const traceId = crypto.randomUUID();
    const scope = msg.scope;
    const bytes = unb64(msg.b64);
    const blocked = async (reason, category) => {
      await log({ action: 'pseudonymize_file', kind: msg.kind, scopeType: scope.type, blocked: true, category, traceId });
      return { ok: true, data: { filename: msg.name, mime: '', contentB64: '', entities: [], newEntries: [], blocked: true, blockReason: reason, blockCategory: category, traceId } };
    };
    const fk = await PG.textfile.detectKind(msg.name, bytes);
    if (!fk.kind) return blocked(fk.reason, 'unsupported_format');
    const all = [];
    let out;
    let mime = PG.textfile.MIME[fk.kind];
    let outName = msg.name;
    let notice = null;
    try {
      if (fk.kind === 'txt' || fk.kind === 'md' || fk.kind === 'csv') {
        const dt = PG.textfile.decodeText(bytes);
        checkSpecial(dt.text);
        const reps = await replacementsFor(scope, await detect(cfg, dt.text));
        all.push(...reps);
        out = PG.textfile.encodeText(dt, PG.rizzo.applyReplacements(dt.text, reps));
      } else if (fk.kind === 'docx' || fk.kind === 'xlsx') {
        out = await PG.ooxml.transformOffice(bytes, fk.kind, async (texts) => {
          checkSpecial(texts.join('\n'));
          const per = await PG.rizzo.detectUnits(texts, (big) => detect(cfg, big), policy().allowlist);
          const flat = per.flat();
          const reps = await replacementsFor(scope, flat);
          all.push(...reps);
          let i = 0;
          return per.map((dets) => dets.map(() => {
            const r = reps[i++];
            return { start: r.start, end: r.end, text: r.tag };
          }));
        });
      } else {
        // PDF: testo estratto da Rizzo-PII, inviato come .txt pseudonimizzato al posto del PDF.
        const res = await rizzo(cfg).analyzeFile(msg.name, bytes, 'application/pdf');
        checkSpecial(res.text);
        const dets = PG.rizzo.clean(policy().allowlist.filter(res.text, res.detections));
        const reps = await replacementsFor(scope, dets);
        all.push(...reps);
        out = te.encode(PG.rizzo.applyReplacements(res.text, reps));
        mime = 'text/plain';
        outName = msg.name.replace(/\.pdf$/i, '') + '.txt';
        notice = PG.strings.pdfConvertito(msg.name);
      }
    } catch (e) {
      if (e instanceof Blocked) return blocked(e.message, e.category);
      if (e instanceof PG.zip.ZipError) return blocked('File Office non valido o danneggiato: ' + e.message, 'invalid_file');
      if (e && e.code === 'detector_rejected') return blocked('Il file non può essere analizzato: ' + e.message, 'unreadable');
      return failure(e);
    }
    let nameRes;
    try {
      nameRes = await pseudonymizeName(cfg, scope, outName);
    } catch (e) {
      return failure(e);
    }
    all.push(...nameRes.reps);
    await log({ action: 'pseudonymize_file', kind: msg.kind, format: fk.kind, scopeType: scope.type, counts: counts(all), traceId });
    return {
      ok: true,
      data: { filename: nameRes.name, mime, contentB64: b64(out), entities: uniqueEntities(all), newEntries: [], blocked: false, blockReason: null, traceId, notice },
    };
  }

  async function dictionary(scope) {
    const rec = await loadScope(scope, false);
    const entries = {};
    const unrecoverable = [];
    if (rec) {
      for (const [tag, e] of Object.entries(rec.entries)) {
        try {
          entries[tag] = await dec(`${e.aad || `${rec.type}|${rec.id}`}|${tag}`, e);
        } catch (_) {
          unrecoverable.push(tag);
        }
      }
      rec.lastUsed = Date.now();
      await PG.idb.put('pdict', rec);
    }
    const expiresAt = rec && rec.type === 'conversation' ? new Date((rec ? rec.lastUsed : Date.now()) + 30 * DAY).toISOString() : null;
    return { ok: true, data: { entries, unrecoverable, expiresAt, confirmBy: null } };
  }

  function findTagEdits(text, entries) {
    const edits = [];
    const unknown = [];
    const rx = /\\?\[([A-Z][A-Z]*(?:\\?_[A-Z]+)*)\\?_(\d{1,6})\\?\]/g;
    let m;
    while ((m = rx.exec(text)) !== null) {
      const tag = m[0].replace(/\\/g, '');
      if (Object.prototype.hasOwnProperty.call(entries, tag)) edits.push({ start: m.index, end: m.index + m[0].length, text: entries[tag] });
      else if (!unknown.includes(tag)) unknown.push(tag);
    }
    return { edits, unknown };
  }

  async function reidentifyFile(cfg, msg) {
    const bytes = unb64(msg.b64);
    const entries = (await dictionary(msg.scope)).data.entries;
    const fk = await PG.textfile.detectKind(msg.name, bytes);
    const unknownTags = new Set();
    let out;
    if (fk.kind === 'txt' || fk.kind === 'md' || fk.kind === 'csv') {
      const dt = PG.textfile.decodeText(bytes);
      const { edits, unknown } = findTagEdits(dt.text, entries);
      unknown.forEach((t) => unknownTags.add(t));
      out = PG.textfile.encodeText(dt, PG.rizzo.applyReplacements(dt.text, edits.map((e) => ({ start: e.start, end: e.end, tag: e.text }))));
    } else if (fk.kind === 'docx' || fk.kind === 'xlsx') {
      out = await PG.ooxml.transformOffice(bytes, fk.kind, async (texts) =>
        texts.map((t) => {
          const r = findTagEdits(t, entries);
          r.unknown.forEach((x) => unknownTags.add(x));
          return r.edits;
        }));
    } else {
      return { ok: false, error: 'http', status: 415, message: 'Ripristino non disponibile per questo formato nella Personal edition (PDF e altri formati).' };
    }
    return { ok: true, data: { filename: msg.name, mime: msg.mime, contentB64: b64(out), entities: [], unknownTags: [...unknownTags], traceId: null } };
  }

  async function rebind(msg) {
    const from = await loadScope(msg.from, false);
    if (!from) return { ok: true, status: 204, data: null };
    const to = await loadScope(msg.to, true);
    // Conflitto: stesso tag con valore diverso, o stesso valore con tag diverso.
    for (const [h, tag] of Object.entries(from.index)) {
      if (to.index[h] && to.index[h] !== tag) return { ok: false, error: 'conflict', status: 409 };
    }
    const toByTag = new Set(Object.values(to.index));
    for (const [h, tag] of Object.entries(from.index)) {
      if (toByTag.has(tag) && to.index[h] !== tag) return { ok: false, error: 'conflict', status: 409 };
    }
    // L'indice HMAC dipende dallo scope: si ricalcola sui valori decifrati.
    for (const [tag, e] of Object.entries(from.entries)) {
      const aadStr = `${e.aad || `${from.type}|${from.id}`}`;
      const value = await dec(`${aadStr}|${tag}`, e);
      to.index[await hmac(`${scopeKey(msg.to)}|${PG.policy.normalize(value)}`)] = tag;
      to.entries[tag] = Object.assign({}, e, { aad: aadStr });
    }
    to.lastUsed = Date.now();
    await PG.idb.put('pdict', to);
    await PG.idb.del('pdict', from.scopeKey);
    return { ok: true, status: 204, data: null };
  }

  async function deleteScope(msg) {
    await PG.idb.del('pdict', scopeKey(msg.scope));
    await log({ action: 'scope_delete', scopeType: msg.scope.type });
    return { ok: true };
  }

  async function event(body) {
    const d = Object.assign({}, body.details || {});
    // Nessun testo nel registro: per le risposte si conserva solo l'hash.
    if (typeof d.textPseudonymized === 'string') {
      d.textSha256 = await sha256(d.textPseudonymized);
      delete d.textPseudonymized;
    }
    await log({ event: body.event, scopeType: body.scope ? body.scope.type : null, traceId: body.traceId || null, details: d });
    return { ok: true, status: 204 };
  }

  async function cleanup() {
    const now = Date.now();
    for (const rec of await PG.idb.all('pdict')) {
      const pending = String(rec.id).startsWith('pending:');
      if ((pending && now - rec.lastUsed > DAY) || (!pending && rec.type === 'conversation' && now - rec.lastUsed > 30 * DAY)) {
        await PG.idb.del('pdict', rec.scopeKey);
      }
    }
    for (const r of await PG.idb.all('plog')) if (now - r.ts > 90 * DAY) await PG.idb.del('plog', r.id);
  }

  async function health(cfg) {
    const state = await rizzo(cfg).health();
    return { ok: state === 'ok', detector: state, keys: 'local', version: null, checked: Date.now() };
  }

  PG.local = { pseudonymize, pseudonymizeFile, dictionary, reidentifyFile, rebind, deleteScope, event, cleanup, health, readLog, Blocked };
})(typeof globalThis !== 'undefined' ? globalThis : this);
