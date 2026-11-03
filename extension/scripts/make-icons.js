// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 gli autori di Pseudomania
//
// Genera icons/icon{16,32,48,128}.png (attivo) e icons/off*.png (disattivato, grigio) da un SVG con Chromium (Playwright). Uso: npm run icons

const path = require('path');
const { chromium } = require('playwright');

const SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <path d="M64 6 L114 24 V60 C114 92 92 113 64 122 C36 113 14 92 14 60 V24 Z" fill="#1f5f8b"/>
  <path d="M64 16 L104 31 V60 C104 86 86 104 64 112 C42 104 24 86 24 60 V31 Z" fill="#2b7bb4"/>
  <text x="64" y="80" text-anchor="middle" font-family="DejaVu Sans Mono, monospace" font-weight="700"
        font-size="46" fill="#ffffff">[P]</text>
</svg>`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const variants = [
    ['icon', SVG],
    ['off', SVG.replace('#1f5f8b', '#6b6b6b').replace('#2b7bb4', '#9a9a9a')],
  ];
  for (const [prefix, svg] of variants) for (const size of [16, 32, 48, 128]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<html><body style="margin:0;background:transparent">` +
        svg.replace('<svg ', `<svg width="${size}" height="${size}" `) +
        `</body></html>`
    );
    await page.screenshot({ path: path.join(__dirname, '..', 'icons', `${prefix}${size}.png`), omitBackground: true });
  }
  await browser.close();
  console.log('icone generate');
})();
