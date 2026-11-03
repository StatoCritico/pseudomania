// SPDX-License-Identifier: AGPL-3.0-or-later
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const tags = require('../../src/shared/tags.js');

const DICT = { '[FULLNAME_1]': 'Mario Rossi', '[CF_2]': 'RSSMRA80A01H501U', '[ID_DOC_1]': 'AX1234567' };

test('findTags riconosce tipi con trattino basso (ID_DOC)', () => {
  const t = tags.findTags('doc [ID_DOC_1] di [FULLNAME_1].');
  assert.deepEqual(t.map((x) => [x.tag, x.type, x.n]), [['[ID_DOC_1]', 'ID_DOC', 1], ['[FULLNAME_1]', 'FULLNAME', 1]]);
});

test('restoreText sostituisce i segnaposto noti e segnala quelli sconosciuti', () => {
  const r = tags.restoreText('Ciao [FULLNAME_1], CF [CF_2], email [EMAIL_9], passo [STEP_1].', DICT);
  assert.equal(r.text, 'Ciao Mario Rossi, CF RSSMRA80A01H501U, email [EMAIL_9], passo [STEP_1].');
  assert.deepEqual(r.restored.sort(), ['[CF_2]', '[FULLNAME_1]']);
  assert.deepEqual(r.unknown, ['[EMAIL_9]']); // STEP non è un tipo noto: ignorato
});

test('planRewrite: segnaposto spezzato su due segmenti', () => {
  const plan = tags.planRewrite([{ raw: 'Gentile [FULL' }, { raw: 'NAME_1], buongiorno' }], DICT);
  assert.deepEqual(plan.segments.map((s) => s.rendered), ['Gentile Mario Rossi', ', buongiorno']);
  assert.deepEqual(plan.segments[0].highlights, [{ start: 8, end: 19, kind: 'restored', tag: '[FULLNAME_1]' }]);
});

test('planRewrite: segnaposto spezzato su tre segmenti (streaming carattere per carattere)', () => {
  const plan = tags.planRewrite([{ raw: 'a [' }, { raw: 'CF' }, { raw: '_2] b' }], DICT);
  assert.deepEqual(plan.segments.map((s) => s.rendered), ['a RSSMRA80A01H501U', '', ' b']);
});

test('planRewrite: segnaposto incompleto (streaming in corso) resta com\'è', () => {
  const plan = tags.planRewrite([{ raw: 'Gentile [FULLNA' }], DICT);
  assert.equal(plan.segments[0].rendered, 'Gentile [FULLNA');
});

test('planRewrite: il separatore di blocco impedisce unioni fra paragrafi', () => {
  const plan = tags.planRewrite([{ raw: 'fine [FULL' }, { raw: 'NAME_1] inizio', sep: true }], DICT);
  assert.deepEqual(plan.segments.map((s) => s.rendered), ['fine [FULL', 'NAME_1] inizio']);
});

test('planRewrite: sconosciuto spezzato viene evidenziato in entrambi i segmenti', () => {
  const plan = tags.planRewrite([{ raw: 'x [EMA' }, { raw: 'IL_3] y' }], DICT);
  assert.deepEqual(plan.segments.map((s) => s.rendered), ['x [EMA', 'IL_3] y']);
  assert.equal(plan.segments[0].highlights[0].kind, 'unknown');
  assert.deepEqual(plan.segments[1].highlights[0], { start: 0, end: 5, kind: 'unknown', tag: '[EMAIL_3]' });
  assert.deepEqual(plan.unknown, ['[EMAIL_3]']);
});

test('planRewrite: l\'istruzione fissa non viene ripristinata', () => {
  const instr = 'segnaposto come [FULLNAME_1] o [CF_2].';
  const plan = tags.planRewrite([{ raw: instr + ' Testo per [FULLNAME_1].' }], DICT, { excludeTexts: [instr] });
  assert.equal(plan.segments[0].rendered, instr + ' Testo per Mario Rossi.');
});

test('planRewrite è idempotente rispetto al testo grezzo', () => {
  const seg = [{ raw: '[FULLNAME_1] e [FULLNAME_1]' }];
  const a = tags.planRewrite(seg, DICT);
  const b = tags.planRewrite(seg, DICT);
  assert.deepEqual(a, b);
  assert.equal(a.segments[0].rendered, 'Mario Rossi e Mario Rossi');
});

test('etichette URL e IPADDR sono tipi noti; [FULLNAME_n] non è un segnaposto', () => {
  const r = tags.restoreText('vedi [URL_1] da [IPADDR_2]; esempio [FULLNAME_n]', DICT);
  assert.deepEqual(r.unknown.sort(), ['[IPADDR_2]', '[URL_1]']);
  assert.equal(tags.findTags('[FULLNAME_n] o [CF_n]').length, 0);
});

test('maskKnownValues toglie i valori reali dalle note', () => {
  assert.equal(tags.maskKnownValues('manca mario rossi qui', DICT), 'manca [FULLNAME_1] qui');
});

test('normalizeForCompare ignora spazi, a capo e markup', () => {
  assert.equal(tags.normalizeForCompare('Ciao  **[FULLNAME_1]**\n\n- punto'), tags.normalizeForCompare('Ciao [FULLNAME_1] punto'));
});

test('planRewrite: segnaposto «non ripristinabili» (chiave di un altro PC) marcati a parte', () => {
  const plan = tags.planRewrite([{ raw: 'Pratica di [FULLNAME_7] e [FULLNAME_1]' }], DICT, { unrecoverable: ['[FULLNAME_7]'] });
  assert.equal(plan.segments[0].rendered, 'Pratica di [FULLNAME_7] e Mario Rossi');
  assert.deepEqual(plan.unrecoverable, ['[FULLNAME_7]']);
  assert.deepEqual(plan.unknown, []);
  assert.equal(plan.segments[0].highlights[0].kind, 'unrecoverable');
});
