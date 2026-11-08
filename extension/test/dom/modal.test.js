// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Finestre di conferma (src/content/ui.js): focus iniziale sicuro, Esc, trappola del focus,
// attributi ARIA e ritorno del focus. Chromium headless via Playwright (vedi restore.test.js).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..', '..');
const SCRIPTS = ['src/shared/strings.js', 'src/shared/tags.js', 'src/content/ui.js'];

let browser;
let page;

test.before(async () => {
  browser = await chromium.launch();
  page = await browser.newPage();
});
test.after(async () => browser && browser.close());

async function setup() {
  await page.setContent('<html><body><textarea id="composer"></textarea><button id="other">x</button></body></html>');
  // Le shadow root sono chiuse: per ispezionarle nel test si conserva il riferimento.
  await page.evaluate(() => {
    const orig = Element.prototype.attachShadow;
    window.shadows = [];
    Element.prototype.attachShadow = function (o) {
      const s = orig.call(this, o);
      window.shadows.push(s);
      return s;
    };
  });
  for (const s of SCRIPTS) await page.addScriptTag({ path: path.join(ROOT, s) });
  await page.focus('#composer');
}

/** Apre una finestra e restituisce una funzione che attende il risultato. */
async function open(expr) {
  await page.evaluate((expr) => {
    window.result = undefined;
    // eslint-disable-next-line no-eval
    (0, eval)(expr).then((v) => { window.result = v; });
  }, expr);
  await page.waitForSelector('pg-ui[data-pg-ui="modal"]', { state: 'attached' });
}
const result = async () => {
  await page.waitForFunction(() => window.result !== undefined);
  return page.evaluate(() => window.result);
};
const isOpen = async () => !!(await page.$('pg-ui[data-pg-ui="modal"]'));
const activeText = () => page.evaluate(() => {
  const s = window.shadows[window.shadows.length - 1];
  return s.activeElement ? s.activeElement.textContent : null;
});

const RISKY = {
  confirmUnprotected: { expr: 'PG.ui.confirmUnprotected({})', danger: 'confermaInvia' },
  confirmOff: { expr: 'PG.ui.confirmOff()', danger: 'offConferma' },
};

for (const [name, cfg] of Object.entries(RISKY)) {
  test(`${name}: Invio subito = Annulla`, async () => {
    await setup();
    await open(cfg.expr);
    assert.equal(await activeText(), 'Annulla');
    await page.keyboard.press('Enter');
    assert.equal(await result(), false);
    assert.equal(await isOpen(), false);
    // il focus torna alla casella di scrittura
    assert.equal(await page.evaluate(() => document.activeElement.id), 'composer');
  });

  test(`${name}: Esc annulla`, async () => {
    await setup();
    await open(cfg.expr);
    await page.keyboard.press('Escape');
    assert.equal(await result(), false);
    assert.equal(await isOpen(), false);
  });

  test(`${name}: Tab e Maiusc+Tab restano dentro la finestra`, async () => {
    await setup();
    await open(cfg.expr);
    const danger = await page.evaluate((k) => PG.strings[k], cfg.danger);
    const seen = [];
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab');
      seen.push(await activeText());
      assert.equal(await page.evaluate(() => document.activeElement.tagName), 'PG-UI', 'il focus resta nella finestra');
    }
    assert.deepEqual(seen, [danger, 'Annulla', danger, 'Annulla', danger]);
    await page.keyboard.press('Shift+Tab');
    assert.equal(await activeText(), 'Annulla');
    await page.keyboard.press('Shift+Tab');
    assert.equal(await activeText(), danger);
    // Invio sul pulsante rischioso, raggiunto di proposito, conferma
    await page.keyboard.press('Enter');
    assert.equal(await result(), true);
  });

  test(`${name}: ruolo alertdialog, aria-modal, aria-labelledby → titolo, aria-describedby`, async () => {
    await setup();
    await open(cfg.expr);
    const a = await page.evaluate(() => {
      const s = window.shadows[window.shadows.length - 1];
      const d = s.querySelector('.dialog');
      const t = s.getElementById(d.getAttribute('aria-labelledby'));
      const desc = (d.getAttribute('aria-describedby') || '').split(' ').filter(Boolean).map((id) => s.getElementById(id));
      return {
        role: d.getAttribute('role'),
        modal: d.getAttribute('aria-modal'),
        titleTag: t && t.tagName,
        title: t && t.textContent,
        desc: desc.length && desc.every((e) => e && e.tagName === 'P'),
      };
    });
    assert.equal(a.role, 'alertdialog');
    assert.equal(a.modal, 'true');
    assert.equal(a.titleTag, 'H2');
    assert.ok(a.title.length > 0);
    assert.ok(a.desc);
    await page.keyboard.press('Escape');
  });
}

test('confirmImage: focus su Annulla, Invio = nessun invio', async () => {
  await setup();
  await open("PG.ui.confirmImage(new File(['x'], 'a.png', { type: 'image/png' }))");
  assert.equal(await activeText(), 'Annulla');
  await page.keyboard.press('Enter');
  assert.equal(await result(), false);
});

test('confirmImageOcr: focus su Annulla anche con pulsante primario', async () => {
  await setup();
  await open("PG.ui.confirmImageOcr({ redacted: new File(['x'], 'a.png', { type: 'image/png' }), entities: [], ocr: { covered: 0 } })");
  assert.equal(await activeText(), 'Annulla');
  assert.equal(await page.evaluate(() => window.shadows.at(-1).querySelector('.dialog').getAttribute('role')), 'alertdialog');
  await page.keyboard.press('Enter');
  assert.equal(await result(), false);
});

test('preview (testo già pseudonimizzato): focus su «Invia», ruolo dialog, Esc annulla', async () => {
  await setup();
  await open("PG.ui.preview('Ciao Mario', 'Ciao [FULLNAME_1]', [{ start: 5, end: 10, tag: '[FULLNAME_1]' }])");
  const invia = await page.evaluate(() => PG.strings.anteprimaInvia);
  assert.equal(await activeText(), invia);
  assert.equal(await page.evaluate(() => window.shadows.at(-1).querySelector('.dialog').getAttribute('role')), 'dialog');
  await page.keyboard.press('Escape');
  assert.equal(await result(), false);
});

test('il focus non sfugge: un focus programmatico sulla pagina torna nella finestra', async () => {
  await setup();
  await open('PG.ui.confirmOff()');
  await page.evaluate(() => document.getElementById('other').focus());
  assert.equal(await page.evaluate(() => document.activeElement.tagName), 'PG-UI');
  assert.equal(await activeText(), 'Annulla');
  await page.keyboard.press('Escape');
  assert.equal(await result(), false);
});

test('confirmSpecial: focus su Annulla, invio disabilitato finché non si spunta la casella', async () => {
  await setup();
  await open("PG.ui.confirmSpecial({ label: 'dati relativi a condanne penali e reati' })");
  const q = (sel, prop) => page.evaluate(([s, p]) => window.shadows.at(-1).querySelector(s)[p], [sel, prop]);
  assert.equal(await activeText(), 'Annulla');
  assert.equal(await page.evaluate(() => window.shadows.at(-1).querySelector('.dialog').getAttribute('role')), 'alertdialog');
  assert.match(await q('.dialog', 'textContent'), /condanne penali e reati/);
  assert.equal(await q('[data-pg-special-send]', 'disabled'), true);
  // Tab da «Annulla»: il pulsante disabilitato non è raggiungibile, si torna alla casella
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => window.shadows.at(-1).activeElement.type), 'checkbox');
  await page.keyboard.press('Space');
  assert.equal(await q('[data-pg-special-send]', 'disabled'), false);
  await page.keyboard.press('Space'); // togliere la spunta lo disabilita di nuovo
  assert.equal(await q('[data-pg-special-send]', 'disabled'), true);
  await page.keyboard.press('Space');
  await page.keyboard.press('Tab'); // Annulla
  await page.keyboard.press('Tab'); // Invia pseudonimizzato
  assert.equal(await activeText(), 'Invia pseudonimizzato');
  await page.keyboard.press('Enter');
  assert.equal(await result(), true);
});

test('confirmSpecial: Invio subito = Annulla', async () => {
  await setup();
  await open("PG.ui.confirmSpecial({ label: 'x', fileName: 'nota.txt' })");
  await page.keyboard.press('Enter');
  assert.equal(await result(), false);
  assert.equal(await isOpen(), false);
});
