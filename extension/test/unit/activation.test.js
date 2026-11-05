// SPDX-License-Identifier: AGPL-3.0-or-later
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Activation } = require('../../src/shared/activation.js');

test('nuova conversazione: disattivata di default, senza domande', () => {
  const a = new Activation();
  assert.equal(a.enter('pending:1'), 'off');
  assert.equal(a.states['pending:1'], undefined, 'nessuno stato memorizzato senza una scelta');
  a.set('pending:1', 'on');
  assert.equal(a.enter('pending:2'), 'off', 'anche dopo un\'attivazione, una nuova chat parte disattivata');
  assert.equal(a.enter(null), 'off');
});

test('conversazione ripresa: era attiva → attiva; altrimenti disattivata', () => {
  const a = new Activation({ states: { c1: 'on', c2: 'off' }, last: 'on' });
  assert.equal(a.enter('c1'), 'on');
  assert.equal(a.enter('c2'), 'off');
  assert.equal(a.enter('c3'), 'off');
  assert.notEqual(a.enter('c2'), 'ask', 'lo stato «ask» non viene più usato');
});

test('pending → id definitivo: stato e avviso seguono la conversazione', () => {
  const a = new Activation();
  a.set('pending:x', 'on');
  a.markWarned('pending:x');
  a.move('pending:x', 'c9');
  assert.equal(a.states.c9, 'on');
  assert.equal(a.enter('c9'), 'on');
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
  assert.equal(Activation.toggled('off'), 'on');
});

test('serializzazione e scorciatoia nel manifest', () => {
  const a = new Activation({ states: { c1: 'on' }, last: 'on' });
  assert.deepEqual(new Activation(JSON.parse(JSON.stringify(a))).toJSON(), a.toJSON());
  const m = require('../../manifest.json');
  assert.equal(m.commands['toggle-protection'].suggested_key.default, 'Alt+Shift+P');
  assert.ok(m.content_scripts[1].js.includes('src/shared/activation.js'));
});

test('modalità «attiva di default»: nuove conversazioni attive, quelle spente restano spente', () => {
  const a = new Activation({ states: { c2: 'off' } });
  assert.equal(a.enter('pending:1', 'on'), 'on');
  assert.equal(a.enter('c2', 'on'), 'off');
  assert.equal(a.states['pending:1'], undefined, 'nessuna scelta memorizzata in automatico');
});

test('modalità «attiva con richiesta» (comportamento del 1/11/2026)', () => {
  const a = new Activation();
  assert.equal(a.enter('pending:1', 'ask'), 'on', 'nessuna scelta precedente: attiva da sola');
  assert.equal(a.states['pending:1'], 'on');
  a.set('pending:1', 'off');
  assert.equal(a.enter('pending:2', 'ask'), 'ask', 'ultima scelta «spenta»: chiede');
  assert.equal(a.enter('pending:1', 'ask'), 'ask', 'ripresa spenta: chiede');
  a.set('c3', 'on');
  assert.equal(a.enter('pending:4', 'ask'), 'on');
});
