// SPDX-License-Identifier: AGPL-3.0-or-later
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const lite = require('../../src/shared/detector-lite.js');
const mock = require('../../dev/mock-server/server.js');

test('detector-lite: CF e IBAN con checksum', () => {
  assert.equal(lite.cfValid('RSSMRA80A01H501U'), true);
  assert.equal(lite.cfValid('RSSMRA80A01H501A'), false);
  assert.equal(lite.ibanValid('IT60 X054 2811 1010 0000 0123 456'), true);
  assert.equal(lite.ibanValid('IT60X0542811101000000123457'), false);
  const s = lite.summarize('scrivi a a.b@c.it, CF RSSMRA80A01H501U, tel 333 123 4567');
  assert.deepEqual(s, { EMAIL: 1, CF: 1, TELEPHONENUM: 1 });
});

test('mock server: stesso valore → stesso tag nello scope, offset sull\'originale', () => {
  const sc = { type: 'conversation', id: 'u-' + Date.now() };
  const t = 'Mario Rossi (mario.rossi@ente.it) e di nuovo Mario Rossi';
  const r = mock.pseudonymize(sc, t);
  assert.equal(r.text, '[FULLNAME_1] ([EMAIL_1]) e di nuovo [FULLNAME_1]');
  for (const e of r.entities) assert.match(t.slice(e.start, e.end), /Mario Rossi|mario\.rossi@ente\.it/);
  const r2 = mock.pseudonymize(sc, 'Giulia Bianchi e Mario Rossi');
  assert.equal(r2.text, '[FULLNAME_2] e [FULLNAME_1]');
});
