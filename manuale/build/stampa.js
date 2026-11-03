// SPDX-License-Identifier: AGPL-3.0-or-later
// Uso: node stampa.js svg2png <in.svg> <out.png>   |   node stampa.js pdf <in.html> <out.pdf>
'use strict';
const path = require('path');
const { chromium } = require('playwright');

async function main() {
  const [modo, ingresso, uscita] = process.argv.slice(2);
  const browser = await chromium.launch();
  try {
    if (modo === 'svg2png') {
      const page = await browser.newPage({ viewport: { width: 960, height: 520 }, deviceScaleFactor: 2 });
      await page.goto('file://' + path.resolve(ingresso));
      await page.screenshot({ path: uscita, clip: { x: 0, y: 0, width: 960, height: 520 } });
    } else if (modo === 'pdf') {
      const page = await browser.newPage();
      await page.goto('file://' + path.resolve(ingresso), { waitUntil: 'load' });
      await page.pdf({
        path: uscita,
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
        displayHeaderFooter: true,
        headerTemplate: '<div></div>',
        footerTemplate:
          '<div style="font-size:8px;width:100%;padding:0 18mm;color:#666;display:flex;justify-content:space-between;">' +
          '<span>Pseudomania – ' + (process.env.PIEDE || 'Manuale utente (bozza 0.1)') + '</span>' +
          '<span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
      });
    } else {
      throw new Error('modo sconosciuto: ' + modo);
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
