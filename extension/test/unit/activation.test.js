// SPDX-License-Identifier: AGPL-3.0-or-later
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Activation } = require('../../src/shared/activation.js');

test('nuova conversazione: segue l\'ultima scelta (attivo → da sola, disattivo → richiesta)', () => {
  const a = new Activation();
  assert.equal(a.enter('pending:1'), 'on');
  assert.equal(a.states['pending:1'], 'on', 'attivazione automatica memorizzata');
  a.set('pending:1', 'off');
  assert.equal(a.last, 'off');
  assert.equal(a.enter('pending:2'), 'ask');
  assert.equal(a.states['pending:2'], undefined, 'nessuna scelta finché l\'utente non risponde');
});

test('conversazione ripresa: era attiva → attiva; era disattivata → richiesta', () => {
  const a = new Activation({ states: { c1: 'on', c2: 'off' }, last: 'off' });
  assert.equal(a.enter('c1'), 'on');
  assert.equal(a.enter('c2'), 'ask');
  const b = new Activation({ states: { c2: 'off' }, last: 'on' });
  assert.equal(b.enter('c2'), 'ask', 'lo stato della conversazione prevale sull\'ultima scelta');
});

test('pending → id definitivo: stato e avviso seguono la conversazione', () => {
  const a = new Activation();
  a.set('pending:x', 'off');
  a.markWarned('pending:x');
  a.move('pending:x', 'c9');
  assert.equal(a.states.c9, 'off');
  assert.ok(a.warned.c9);
  assert.equal(a.states['pending:x'], undefined);
});

test('avviso al primo spegnimento solo se ci sono dati protetti e una volta sola', () => {
  const a = new Activation();
  assert.equal(a.needsOffWarning('c1', false), false);
  assert.equal(a.needsOffWarning('c1', true), true);
  a.markWarned('c1');
  assert.equal(a.needsOffWarning('c1', true), false);
  assert.equal(Activation.toggled('on'), 'off');
  assert.equal(Activation.toggled('ask'), 'on');
  assert.equal(Activation.toggled('off'), 'on');
});

test('serializzazione e scorciatoia nel manifest', () => {
  const a = new Activation({ states: { c1: 'off' }, last: 'off' });
  assert.deepEqual(new Activation(JSON.parse(JSON.stringify(a))).toJSON(), a.toJSON());
  const m = require('../../manifest.json');
  assert.equal(m.commands['toggle-protection'].suggested_key.default, 'Alt+Shift+P');
  assert.ok(m.content_scripts[1].js.includes('src/shared/activation.js'));
});
