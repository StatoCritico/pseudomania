// SPDX-License-Identifier: AGPL-3.0-or-later
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const ocrMap = require('../../src/shared/ocr-map.js');

const W = (text, x0, y0, x1, y1, conf = 90) => ({ text, bbox: { x0, y0, x1, y1 }, conf });

// Riga 0: «Gentile Mario Rossi,»  Riga 1: (vuota)  Riga 2: «via Roma 1»
const LINES = [
  { words: [W('Gentile', 10, 10, 80, 30), W('Mario', 90, 10, 140, 32), W('Rossi,', 150, 8, 210, 30)] },
  { words: [W('', 0, 0, 1, 1), W('   ', 0, 0, 1, 1)] },
  { words: [W('via', 10, 50, 40, 70), W('', 45, 50, 46, 70), W('Roma', 50, 50, 100, 72), W('1', 110, 50, 120, 70)] },
];

function spanOf(text, needle, tag) {
  const start = text.indexOf(needle);
  assert.ok(start >= 0, 'testo non trovato: ' + needle);
  return { start, end: start + needle.length, tag };
}

test('buildText: offset su più righe, parole e righe vuote scartate', () => {
  const { text, words } = ocrMap.buildText(LINES);
  assert.equal(text, 'Gentile Mario Rossi,\nvia Roma 1');
  assert.deepEqual(words.map((w) => w.text), ['Gentile', 'Mario', 'Rossi,', 'via', 'Roma', '1']);
  for (const w of words) assert.equal(text.slice(w.start, w.end), w.text);
  assert.deepEqual(words.map((w) => w.line), [0, 0, 0, 2, 2, 2]);
  assert.deepEqual(words[1].bbox, { x0: 90, y0: 10, x1: 140, y1: 32 });
  assert.equal(words[3].start, 21);
  assert.deepEqual(ocrMap.buildText([]), { text: '', words: [] });
});

test('boxesForSpans: span su parte di una parola copre la parola intera', () => {
  const { text, words } = ocrMap.buildText(LINES);
  const boxes = ocrMap.boxesForSpans(words, [spanOf(text, 'Ross', '[FULLNAME_1]')], { pad: 0 });
  assert.deepEqual(boxes, [{ x0: 150, y0: 8, x1: 210, y1: 30, label: '[FULLNAME_1]' }]);
});

test('boxesForSpans: parole della stessa riga fuse con min/max e padding', () => {
  const { text, words } = ocrMap.buildText(LINES);
  const boxes = ocrMap.boxesForSpans(words, [spanOf(text, 'Mario Rossi', '[FULLNAME_1]')]);
  assert.deepEqual(boxes, [{ x0: 87, y0: 5, x1: 213, y1: 35, label: '[FULLNAME_1]' }]);
});

test('boxesForSpans: span su due righe = due riquadri, etichetta solo sul primo', () => {
  const { text, words } = ocrMap.buildText(LINES);
  const span = { start: text.indexOf('Rossi'), end: text.indexOf('Roma') + 4, tag: '[STREET_1]' };
  const boxes = ocrMap.boxesForSpans(words, [span], { pad: 0 });
  assert.deepEqual(boxes, [
    { x0: 150, y0: 8, x1: 210, y1: 30, label: '[STREET_1]' },
    { x0: 10, y0: 50, x1: 100, y1: 72, label: '' },
  ]);
});

test('boxesForSpans: limiti width/height e bordo sinistro/superiore', () => {
  const lines = [{ words: [W('Anna', 1, 2, 98, 49)] }];
  const { words } = ocrMap.buildText(lines);
  const boxes = ocrMap.boxesForSpans(words, [{ start: 0, end: 4, tag: '[FULLNAME_2]' }], { pad: 5, width: 100, height: 50 });
  assert.deepEqual(boxes, [{ x0: 0, y0: 0, x1: 100, y1: 50, label: '[FULLNAME_2]' }]);
});

test('boxesForSpans: bbox invalidi e span vuoti ignorati, più span distinti', () => {
  const lines = [{ words: [W('a', 0, 0, 10, 10), { text: 'b', bbox: { x0: 20, y0: 0, x1: 15, y1: 10 }, conf: 90 },
    { text: 'c', bbox: null, conf: 90 }, W('d', 40, 0, 50, 10)] }];
  const { words } = ocrMap.buildText(lines); // «a b c d»
  const boxes = ocrMap.boxesForSpans(words, [
    { start: 0, end: 7, tag: '[X_1]' },
    { start: 3, end: 3, tag: '[Y_1]' },
  ], { pad: 0 });
  // «b» e «c» scartati: «a» e «d» non sono più consecutive, quindi due riquadri
  assert.deepEqual(boxes, [
    { x0: 0, y0: 0, x1: 10, y1: 10, label: '[X_1]' },
    { x0: 40, y0: 0, x1: 50, y1: 10, label: '' },
  ]);
  assert.deepEqual(ocrMap.boxesForSpans(words, []), []);
});

test('quality: noText e lowConf', () => {
  assert.deepEqual(ocrMap.quality([]), { wordCount: 0, meanConf: 0, lowConf: false, noText: true });
  const good = ocrMap.quality([{ conf: 90 }, { conf: 80 }, { conf: 70 }, { conf: 95 }]);
  assert.equal(good.wordCount, 4);
  assert.equal(good.meanConf, 83.8);
  assert.equal(good.lowConf, false);
  assert.equal(good.noText, false);
  assert.equal(ocrMap.quality([{ conf: 50 }, { conf: 55 }]).lowConf, true); // media < 60
  // media alta ma 2 parole su 5 (40%) sotto 50
  assert.equal(ocrMap.quality([{ conf: 99 }, { conf: 99 }, { conf: 99 }, { conf: 40 }, { conf: 45 }]).lowConf, true);
  // 1 su 5 (20%) sotto 50, media alta: ok
  assert.equal(ocrMap.quality([{ conf: 99 }, { conf: 99 }, { conf: 99 }, { conf: 99 }, { conf: 45 }]).lowConf, false);
});

function fakeCtx() {
  const calls = [];
  const ctx = {
    calls,
    _font: '',
    _fill: '',
    set font(v) { this._font = v; calls.push(['font', v]); },
    get font() { return this._font; },
    set fillStyle(v) { this._fill = v; calls.push(['fillStyle', v]); },
    get fillStyle() { return this._fill; },
    textAlign: '',
    textBaseline: '',
    fillRect(...a) { calls.push(['fillRect', ...a]); },
    fillText(t, x, y) { calls.push(['fillText', t, x, y, this._font, this._fill]); },
    measureText(t) { const px = parseFloat(this._font) || 10; return { width: t.length * px * 0.6 }; },
  };
  return ctx;
}

test('drawRedactions: riquadro nero e testo bianco ridimensionato', () => {
  const ctx = fakeCtx();
  ocrMap.drawRedactions(ctx, [{ x0: 10, y0: 20, x1: 110, y1: 60, label: '[FULLNAME_1]' }]);
  const rect = ctx.calls.find((c) => c[0] === 'fillRect');
  assert.deepEqual(rect, ['fillRect', 10, 20, 100, 40]);
  const idxRect = ctx.calls.indexOf(rect);
  assert.deepEqual(ctx.calls[idxRect - 1], ['fillStyle', '#000']);
  const txt = ctx.calls.find((c) => c[0] === 'fillText');
  assert.ok(txt, 'testo atteso');
  assert.equal(txt[1], '[FULLNAME_1]');
  assert.equal(txt[2], 60);
  assert.equal(txt[3], 40);
  assert.equal(txt[5], '#fff');
  const px = parseFloat(txt[4]);
  assert.ok(px < 28, 'ridotto rispetto al 70% dell\'altezza (28px): ' + px);
  assert.ok(px >= 7);
  assert.ok(12 * px * 0.6 <= 100, 'deve stare nel riquadro');
  assert.match(txt[4], /sans-serif$/);
});

test('drawRedactions: altezza piena se il testo entra; niente testo sotto 7px; box senza etichetta', () => {
  const ctx = fakeCtx();
  ocrMap.drawRedactions(ctx, [
    { x0: 0, y0: 0, x1: 400, y1: 20, label: '[CF_1]' }, // 70% di 20 = 14px, entra
    { x0: 0, y0: 30, x1: 20, y1: 60, label: '[FULLNAME_1]' }, // troppo stretto
    { x0: 0, y0: 70, x1: 200, y1: 79, label: '[CF_2]' }, // 70% di 9 = 6px < 7
    { x0: 0, y0: 90, x1: 50, y1: 100, label: '' },
    { x0: 5, y0: 5, x1: 5, y1: 10, label: '[X_1]' }, // invalido: ignorato
  ]);
  const rects = ctx.calls.filter((c) => c[0] === 'fillRect');
  assert.equal(rects.length, 4);
  const texts = ctx.calls.filter((c) => c[0] === 'fillText');
  assert.equal(texts.length, 1);
  assert.equal(texts[0][1], '[CF_1]');
  assert.equal(texts[0][4], '14px sans-serif');
});

test('pagesToDoc: testo di pagina + OCR, offset globali, pagine separate da riga vuota', () => {
  const pages = [
    { index: 0, text: 'Pagina con testo', ocr: null },
    { index: 1, text: 'Intestazione', ocr: [{ words: [W('Mario', 0, 0, 10, 10)] }, { words: [W('Rossi', 0, 20, 10, 30)] }] },
    { index: 2, text: '', ocr: [{ words: [W('Fine', 5, 5, 25, 15, 70)] }] },
  ];
  const doc = ocrMap.pagesToDoc(pages);
  assert.equal(doc.text, 'Pagina con testo\n\nIntestazione\nMario\nRossi\n\n\nFine');
  assert.deepEqual(doc.ocrWords.map((w) => [w.page, w.text, w.line]), [[1, 'Mario', 0], [1, 'Rossi', 1], [2, 'Fine', 0]]);
  for (const w of doc.ocrWords) assert.equal(doc.text.slice(w.start, w.end), w.text);
  assert.deepEqual(doc.ocrWords[2].bbox, { x0: 5, y0: 5, x1: 25, y1: 15 });
  assert.equal(doc.ocrWords[2].conf, 70);
  assert.deepEqual(doc.regions.map((g) => [g.page, g.kind, doc.text.slice(g.start, g.end)]), [
    [0, 'text', 'Pagina con testo'], [1, 'text', 'Intestazione'], [1, 'ocr', 'Mario\nRossi'], [2, 'text', ''], [2, 'ocr', 'Fine'],
  ]);
  assert.deepEqual(ocrMap.pagesToDoc([]), { text: '', ocrWords: [], regions: [] });
});

test('boxesForPages: riquadri per pagina con `page`, etichetta solo sul primo anche tra pagine', () => {
  const pages = [
    { index: 0, text: '', ocr: [{ words: [W('Gentile', 10, 10, 60, 20), W('Mario', 70, 10, 110, 20)] }] },
    { index: 1, text: '', ocr: [{ words: [W('Rossi', 10, 10, 50, 20), W('saluti', 60, 10, 100, 20)] }] },
  ];
  const doc = ocrMap.pagesToDoc(pages);
  const span = { start: doc.text.indexOf('Mario'), end: doc.text.indexOf('Rossi') + 5, tag: '[FULLNAME_1]' };
  const boxes = ocrMap.boxesForPages(doc.ocrWords, [span], { pad: 0 });
  assert.deepEqual(boxes, [
    { page: 0, x0: 70, y0: 10, x1: 110, y1: 20, label: '[FULLNAME_1]' },
    { page: 1, x0: 10, y0: 10, x1: 50, y1: 20, label: '' },
  ]);
  // limiti della pagina da opts.sizes
  const clip = ocrMap.boxesForPages(doc.ocrWords, [span], { pad: 5, sizes: { 0: { width: 112, height: 22 } } });
  assert.deepEqual(clip[0], { page: 0, x0: 65, y0: 5, x1: 112, y1: 22, label: '[FULLNAME_1]' });
  assert.deepEqual(ocrMap.boxesForPages(doc.ocrWords, []), []);
  assert.deepEqual(ocrMap.boxesForPages([], [span]), []);
});

test('popola globalThis.PG.ocrMap', () => {
  assert.equal(globalThis.PG.ocrMap, ocrMap);
});
