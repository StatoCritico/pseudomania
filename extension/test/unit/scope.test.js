// SPDX-License-Identifier: AGPL-3.0-or-later
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const claude = require('../../src/sites/claude.js');
const { ScopeTracker, isPending } = require('../../src/shared/scope.js');

const C = '0f8fad5b-d9cb-469f-a165-70867728950e';
const P = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

test('parseUrl: chat, progetto, nuova chat, altro', () => {
  assert.deepEqual(claude.parseUrl(`https://claude.ai/chat/${C}`), { page: 'chat', conversationId: C, projectId: null });
  assert.deepEqual(claude.parseUrl(`https://claude.ai/chat/${C.toUpperCase()}?x=1#y`), { page: 'chat', conversationId: C, projectId: null });
  assert.deepEqual(claude.parseUrl(`https://claude.ai/project/${P}/`), { page: 'project', conversationId: null, projectId: P });
  assert.equal(claude.parseUrl('https://claude.ai/new').page, 'new');
  assert.equal(claude.parseUrl('https://claude.ai/').page, 'new');
  assert.equal(claude.parseUrl('https://claude.ai/recents').page, 'other');
  assert.equal(claude.parseUrl('https://claude.ai/chat/non-un-uuid').page, 'other');
  assert.equal(claude.parseUrl('non un url').page, 'other');
});

function tracker(projectMap) {
  let n = 0;
  return new ScopeTracker({ newId: () => `pending:test-${++n}`, projectOf: (c) => (projectMap || {})[c] || null });
}

test('nuova chat: scope pending, poi rebind verso la conversazione', () => {
  const t = tracker();
  let r = t.update(claude.parseUrl('https://claude.ai/new'));
  assert.deepEqual(r.scope, { type: 'conversation', id: 'pending:test-1' });
  assert.ok(isPending(r.scope.id));
  t.markUsed();
  r = t.update(claude.parseUrl(`https://claude.ai/chat/${C}`));
  assert.deepEqual(r.scope, { type: 'conversation', id: C });
  assert.deepEqual(r.rebind, { from: { type: 'conversation', id: 'pending:test-1' }, to: { type: 'conversation', id: C } });
  assert.deepEqual(r.moveConvKey, { from: 'pending:test-1', to: C });
});

test('nuova chat non usata: nessun rebind', () => {
  const t = tracker();
  t.update(claude.parseUrl('https://claude.ai/new'));
  const r = t.update(claude.parseUrl(`https://claude.ai/chat/${C}`));
  assert.equal(r.rebind, null);
});

test('chat avviata da un progetto: scope del progetto e associazione memorizzata', () => {
  const t = tracker();
  let r = t.update(claude.parseUrl(`https://claude.ai/project/${P}`));
  assert.deepEqual(r.scope, { type: 'project', id: P });
  t.markUsed();
  r = t.update(claude.parseUrl(`https://claude.ai/chat/${C}`));
  assert.deepEqual(r.scope, { type: 'project', id: P });
  assert.equal(r.rebind, null);
  assert.deepEqual(r.mapProject, { conversationId: C, projectId: P });
  assert.equal(r.convKey, C);
});

test('chat già nota come parte di un progetto usa lo scope del progetto', () => {
  const t = tracker({ [C]: P });
  const r = t.update(claude.parseUrl(`https://claude.ai/chat/${C}`));
  assert.deepEqual(r.scope, { type: 'project', id: P });
});

test('chat con progetto letto dal DOM (projectId nella pageInfo)', () => {
  const t = tracker();
  const r = t.update({ page: 'chat', conversationId: C, projectId: P });
  assert.deepEqual(r.scope, { type: 'project', id: P });
});

test('ritorno su /new genera un nuovo pending', () => {
  const t = tracker();
  t.update(claude.parseUrl('https://claude.ai/new'));
  t.update(claude.parseUrl(`https://claude.ai/chat/${C}`));
  const r = t.update(claude.parseUrl('https://claude.ai/new'));
  assert.equal(r.scope.id, 'pending:test-2');
  const again = t.update(claude.parseUrl('https://claude.ai/new'));
  assert.equal(again.scope.id, 'pending:test-2');
  assert.equal(again.changed, false);
});

test('rebind rifiutato (409): la conversazione resta sullo scope pending', () => {
  const alias = {};
  const t = new ScopeTracker({ newId: () => 'pending:x', aliasOf: (c) => alias[c] || null });
  t.update(claude.parseUrl('https://claude.ai/new'));
  t.markUsed();
  const r = t.update(claude.parseUrl(`https://claude.ai/chat/${C}`));
  assert.ok(r.rebind);
  // il server risponde 409: l'estensione registra l'alias e sostituisce lo scope corrente
  alias[C] = r.rebind.from.id;
  t.overrideScope(r.rebind.from);
  assert.deepEqual(t.current.scope, { type: 'conversation', id: 'pending:x' });
  // alla riapertura della chat lo scope resta quello pending
  const t2 = new ScopeTracker({ aliasOf: (c) => alias[c] || null });
  assert.deepEqual(t2.update(claude.parseUrl(`https://claude.ai/chat/${C}`)).scope, { type: 'conversation', id: 'pending:x' });
});

test('pagine non pertinenti: nessuno scope', () => {
  const t = tracker();
  assert.equal(t.update(claude.parseUrl('https://claude.ai/settings')).scope, null);
});
