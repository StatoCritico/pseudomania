// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Personal edition: regole (allowlist, categorie particolari) e client di Rizzo-PII.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
require('../../src/shared/policy-data.js');
const policy = require('../../src/shared/policy.js');
const rizzo = require('../../src/shared/rizzo.js');
const { createRizzo } = require('../../dev/mock-rizzo/server.js');

test('allowlist: termine esatto e entità compresa in un termine', () => {
  const al = new policy.Allowlist({ terms: ['Comune di Roma', 'URP'], patterns: [], never_mask_types: ['GENDER'] });
  const text = 'Il Comune di Roma e il signor Rossi; URP; maschio';
  const dets = [
    { start: 13, end: 17, label: 'CITY', value: 'Roma' },
    { start: 37, end: 42, label: 'FULLNAME', value: 'Rossi' },
    { start: 44, end: 47, label: 'ORG', value: 'urp' },
    { start: 49, end: 56, label: 'GENDER', value: 'maschio' },
  ];
  assert.deepEqual(al.filter(text, dets).map((d) => d.value), ['Rossi']);
});

test('categorie particolari dalle regole incluse (porting dei YAML del server)', () => {
  const { special } = policy.fromBundled();
  const hit = special.firstBlock('Il dipendente è in malattia da lunedì');
  assert.ok(hit);
  assert.equal(hit.category, 'salute');
  assert.match(special.reason(hit), /art\. 9/);
  assert.equal(special.firstBlock('Circolare sugli orari di apertura'), null);
  // \w Unicode: il prefisso "sieropositiv*" copre le forme flesse
  assert.ok(special.firstBlock('risulta sieropositività') || special.firstBlock('risulta sieropositivo'));
  // pattern con \b e \s del YAML
  assert.ok(special.firstBlock('ai sensi della legge 104/92'));
});

test('segmentsToDetections: offset su testo con spazi iniziali e ripiego', () => {
  const text = '  Ciao Mario Rossi!';
  const segs = [{ t: 'Ciao ' }, { label: 'FULLNAME', ph: '[FULLNAME_1]', t: 'Mario Rossi' }, { t: '!' }];
  const d = rizzo.segmentsToDetections(segs, text.trim(), 2);
  assert.deepEqual(d, [{ start: 7, end: 18, label: 'FULLNAME', value: 'Mario Rossi' }]);
  assert.equal(text.slice(7, 18), 'Mario Rossi');
  // segmenti non allineati → ricerca sequenziale
  const d2 = rizzo.segmentsToDetections([{ t: 'XX' }, { label: 'FULLNAME', t: 'Mario Rossi' }], text.trim(), 2);
  assert.equal(d2[0].start, 7);
});

test('detectUnits: entità ripartite per frammento con un\'unica analisi', async () => {
  const units = ['Mario Rossi', 'nessuno', 'tel 3331234567'];
  const detect = async (big) => {
    const out = [];
    for (const [rx, label] of [[/Mario Rossi/g, 'FULLNAME'], [/333\d+/g, 'TELEPHONENUM']]) {
      let m;
      while ((m = rx.exec(big)) !== null) out.push({ start: m.index, end: m.index + m[0].length, label, value: m[0] });
    }
    return out;
  };
  const per = await rizzo.detectUnits(units, detect, null);
  assert.deepEqual(per.map((p) => p.map((d) => [d.start, d.end, d.label])), [[[0, 11, 'FULLNAME']], [], [[4, 14, 'TELEPHONENUM']]]);
});

test('RizzoClient contro il Rizzo-PII finto: testo, file, salute, servizio spento', async () => {
  const srv = createRizzo();
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const c = new rizzo.RizzoClient(base);
    assert.equal(await c.health(), 'ok');
    const d = await c.analyzeText('  Scrivo a Mario Rossi, mario.rossi@ente.it ');
    assert.deepEqual(d.map((x) => [x.label, x.value]), [['FULLNAME', 'Mario Rossi'], ['EMAIL', 'mario.rossi@ente.it']]);
    const f = await c.analyzeFile('a.pdf', new TextEncoder().encode('%PDF-1.4\n%TEXT: Contratto di Luigi Verdi\n%%EOF'), 'application/pdf');
    assert.equal(f.text, 'Contratto di Luigi Verdi');
    assert.equal(f.detections[0].value, 'Luigi Verdi');
  } finally {
    srv.close();
  }
  const dead = new rizzo.RizzoClient('http://127.0.0.1:9');
  assert.equal(await dead.health(), 'down');
  await assert.rejects(() => dead.analyzeText('Mario Rossi'), (e) => e.code === 'detector_down');
  void http;
});
