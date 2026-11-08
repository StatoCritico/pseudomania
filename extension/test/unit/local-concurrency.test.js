// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Personal edition: esclusione reciproca per scope in local.js. Più elaborazioni contemporanee sulla
// stessa conversazione non devono assegnare lo stesso segnaposto a valori diversi.
// local.js viene caricato in un contesto vm con uno stub di idb ASINCRONO che introduce ritardi
// casuali (come IndexedDB vero), così le operazioni si intrecciano.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '../../src');
const read = (p) => fs.readFileSync(path.join(SRC, p), 'utf8');
const delay = () => new Promise((r) => setTimeout(r, Math.floor(Math.random() * 8)));
const clone = (v) => (v === undefined ? v : structuredClone(v));

function makeEnv() {
  const store = {};
  const ctx = {
    console: { warn() {}, log() {} },
    crypto: globalThis.crypto,
    TextEncoder, TextDecoder, setTimeout, clearTimeout, Promise, Date, Uint8Array, structuredClone,
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of ['shared/policy-data.js', 'shared/policy.js', 'shared/rizzo.js', 'shared/textfile.js']) {
    vm.runInContext(read(f), ctx, { filename: f });
  }
  const PG = ctx.PG;
  PG.strings = {};
  PG.keys = {
    b64: (buf) => Buffer.from(buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf).toString('base64'),
    unb64: (s) => new Uint8Array(Buffer.from(s, 'base64')),
  };
  // Copie strutturate e ritardi prima e dopo ogni accesso, come IndexedDB.
  const keyOf = (st, rec) => (st === 'pdict' ? rec.scopeKey : rec.id);
  PG.idb = {
    async get(st, k) { await delay(); const v = clone((store[st] || {})[k]); await delay(); return v; },
    async put(st, rec) { await delay(); (store[st] = store[st] || {})[keyOf(st, rec)] = clone(rec); await delay(); },
    async add(st, rec) { await delay(); const s = (store[st] = store[st] || {}); s[Object.keys(s).length + 1] = clone(rec); },
    async all(st) { await delay(); return Object.values(store[st] || {}).map(clone); },
    async del(st, k) { await delay(); delete (store[st] || {})[k]; await delay(); },
  };
  // Il finto Rizzo riconosce come FULLNAME ogni «Persona Xxx».
  PG.rizzo.RizzoClient = class {
    async analyzeText(text) {
      await delay();
      const out = [];
      const rx = /Persona [A-Z][a-z]+/g;
      let m;
      while ((m = rx.exec(text)) !== null) out.push({ start: m.index, end: m.index + m[0].length, label: 'FULLNAME', value: m[0] });
      return out;
    }
  };
  vm.runInContext(read('background/local.js'), ctx, { filename: 'local.js' });
  return { PG, store };
}

const cfg = { rizzoUrl: 'http://127.0.0.1:5005' };
const NAMES = 'Alfa Bravo Carlo Delta Eco Foxtrot Golf Hotel India Juliet Kilo Lima Mike Novembre Oscar Papa Quebec Romeo Sierra Tango'
  .split(' ').map((n) => `Persona ${n}`);

test('20 pseudonimizzazioni concorrenti sullo stesso scope: segnaposti distinti e dizionario coerente', async () => {
  const { PG } = makeEnv();
  const scope = { type: 'conversation', id: 'c-concorrente' };
  const rs = await Promise.all(NAMES.map((n) => PG.local.pseudonymize(cfg, { scope, kind: 'text', text: `Scrivo a ${n} oggi.` })));
  const tagOf = new Map();
  rs.forEach((r, i) => {
    assert.equal(r.ok, true);
    assert.equal(r.data.entities.length, 1);
    tagOf.set(NAMES[i], r.data.entities[0].tag);
  });
  const tags = [...tagOf.values()];
  assert.equal(new Set(tags).size, 20, `segnaposti ripetuti: ${tags.join(', ')}`);
  const d = await PG.local.dictionary(scope);
  assert.equal(Object.keys(d.data.entries).length, 20);
  assert.equal(d.data.unrecoverable.length, 0);
  for (const [name, tag] of tagOf) assert.equal(d.data.entries[tag], name, `${tag} ripristinerebbe la persona sbagliata`);
  // Lo stesso valore, anche in concorrenza, riceve sempre lo stesso segnaposto.
  const again = await Promise.all(NAMES.slice(0, 5).map((n) => PG.local.pseudonymize(cfg, { scope, kind: 'text', text: `Ancora ${n}.` })));
  again.forEach((r, i) => assert.equal(r.data.entities[0].tag, tagOf.get(NAMES[i])));
});

test('dictionary, rebind e deleteScope concorrenti con assign non perdono né mescolano voci', async () => {
  const { PG, store } = makeEnv();
  const pending = { type: 'conversation', id: 'pending:x' };
  const conv = { type: 'conversation', id: 'c-def' };
  await PG.local.pseudonymize(cfg, { scope: pending, kind: 'text', text: 'Primo Persona Alfa.' });
  // Mentre il pending viene spostato sulla conversazione, arrivano altre elaborazioni su entrambi.
  const ops = [
    PG.local.pseudonymize(cfg, { scope: conv, kind: 'text', text: 'Persona Bravo' }),
    PG.local.rebind({ from: pending, to: conv }),
    PG.local.dictionary(conv),
    PG.local.pseudonymize(cfg, { scope: conv, kind: 'text', text: 'Persona Carlo' }),
    PG.local.rebind({ from: conv, to: pending }).catch(() => null),
  ];
  // Ordine delle chiavi opposto nei due rebind: con code non ordinate/atomiche ci sarebbe stallo.
  let timer;
  const timeout = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('stallo')), 5000); });
  await Promise.race([Promise.all(ops), timeout]).finally(() => clearTimeout(timer));
  const recs = Object.values(store.pdict || {});
  for (const rec of recs) {
    const d = await PG.local.dictionary({ type: rec.type, id: rec.id });
    const vals = Object.values(d.data.entries);
    assert.equal(new Set(Object.keys(d.data.entries)).size, vals.length);
    assert.equal(new Set(vals).size, vals.length, 'stesso valore con due segnaposti');
  }
  const all = recs.flatMap((r) => Object.keys(r.entries));
  assert.ok(all.length >= 3, 'voci perse');

  await Promise.all([PG.local.deleteScope({ scope: conv }), PG.local.deleteScope({ scope: pending })]);
  const r = await PG.local.pseudonymize(cfg, { scope: conv, kind: 'text', text: 'Persona Delta' });
  assert.equal(r.data.entities[0].tag, '[FULLNAME_1]');
});
