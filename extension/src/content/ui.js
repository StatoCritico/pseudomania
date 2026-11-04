// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 gli autori di Pseudomania
//
// Interfaccia nella pagina: barra di stato sopra la casella di scrittura, banner, finestre di
// conferma/anteprima, contrassegni «dati protetti». Tutto vive in shadow root CHIUSE dentro
// elementi <pg-ui>, così gli script del sito non leggono i testi originali mostrati in anteprima.

(function (root) {
  'use strict';
  const PG = (root.PG = root.PG || {});
  const S = PG.strings;

  const BASE_CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
    .bar { height: 4px; border-radius: 2px; margin: 0 8px 4px; }
    .bar.on { background: #2e7d32; } .bar.off { background: #ef6c00; } .bar.warn { background: #ef6c00; }
    .label { font-size: 11px; margin: 0 10px 2px; color: #555; display: flex; align-items: center; gap: 6px; }
    .dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
    .dot.on { background: #2e7d32; } .dot.off { background: #ef6c00; } .dot.warn { background: #ef6c00; }
    .banner { margin: 4px 8px 6px; padding: 10px 12px; border-radius: 8px; font-size: 13px; line-height: 1.4;
              display: flex; gap: 10px; align-items: flex-start; }
    .banner.error { background: #fdecea; color: #611a15; border: 1px solid #f5c2bd; }
    .banner.warn { background: #fff4e5; color: #663c00; border: 1px solid #ffd8a8; }
    .banner.info { background: #e8f4fd; color: #0d3c61; border: 1px solid #b6dcf7; }
    .banner b { display: block; margin-bottom: 2px; }
    .banner .msg { flex: 1; white-space: pre-wrap; }
    .act { margin-top: 8px; display: flex; gap: 8px; flex-wrap: wrap; }
    .x { background: none; border: none; cursor: pointer; font-size: 16px; color: inherit; line-height: 1; }
    .overlay { position: fixed; inset: 0; background: rgba(0,0,0,.45); display: flex; align-items: center;
               justify-content: center; z-index: 2147483647; }
    .dialog { background: #fff; color: #222; border-radius: 12px; max-width: 760px; width: calc(100% - 32px);
              max-height: 85vh; overflow: auto; padding: 20px; box-shadow: 0 10px 40px rgba(0,0,0,.3); font-size: 14px; }
    .dialog h2 { font-size: 17px; margin: 0 0 10px; }
    .dialog ul { margin: 6px 0 10px 18px; padding: 0; }
    .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    @media (max-width: 600px) { .cols { grid-template-columns: 1fr; } }
    .col h3 { font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: #666; margin: 0 0 6px; }
    .txt { white-space: pre-wrap; word-break: break-word; background: #f6f6f6; border-radius: 8px; padding: 10px;
           font-size: 13px; line-height: 1.45; max-height: 50vh; overflow: auto; }
    mark.o { background: #ffe0b2; border-radius: 3px; padding: 0 1px; }
    mark.t { background: #c8e6c9; border-radius: 3px; padding: 0 1px; font-family: ui-monospace, monospace; font-size: 12px; }
    .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
    button.btn { border-radius: 8px; padding: 8px 14px; font-size: 14px; cursor: pointer; border: 1px solid #bbb; background: #fff; color: #222; }
    button.btn.primary { background: #2e7d32; border-color: #2e7d32; color: #fff; }
    button.btn.danger { background: #c62828; border-color: #c62828; color: #fff; }
    .badge { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; padding: 2px 8px; border-radius: 10px;
             background: #e8f5e9; color: #1b5e20; border: 1px solid #c8e6c9; cursor: pointer; margin-top: 4px; }
    .badge:hover { background: #c8e6c9; }
    .toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); background: #333; color: #fff;
             padding: 10px 16px; border-radius: 8px; font-size: 13px; z-index: 2147483647; }
  `;

  // Le finestre con testi originali (anteprima) usano shadow root CHIUSE; la barra di stato e i banner
  // no (non contengono più di ciò che la pagina già vede). I pulsanti dei banner accettano solo
  // clic reali (isTrusted): gli script della pagina non possono «premere» «Continua senza protezione».
  function host(tag, mode) {
    const el = document.createElement('pg-ui');
    el.setAttribute('data-pg-ui', tag || '');
    const shadow = el.attachShadow({ mode: mode || 'closed' });
    const style = document.createElement('style');
    style.textContent = BASE_CSS;
    shadow.appendChild(style);
    return { el, shadow };
  }

  function h(tag, attrs, ...children) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') e.className = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    }
    for (const c of children.flat()) if (c != null) e.append(c.nodeType ? c : document.createTextNode(String(c)));
    return e;
  }

  /** Testo con intervalli evidenziati ([{start,end}]) → frammento DOM. */
  function highlighted(text, ranges, cls) {
    const frag = document.createDocumentFragment();
    let cur = 0;
    for (const r of [...ranges].sort((a, b) => a.start - b.start)) {
      if (r.start < cur) continue;
      frag.append(text.slice(cur, r.start));
      frag.append(h('mark', { class: cls, title: r.title || '' }, text.slice(r.start, r.end)));
      cur = r.end;
    }
    frag.append(text.slice(cur));
    return frag;
  }

  function tagRanges(text) {
    return PG.tags.findTags(text).map((t) => ({ start: t.start, end: t.end }));
  }

  // --- Barra di stato + banner sopra la casella di scrittura ------------------------------------
  class StatusArea {
    constructor() {
      const { el, shadow } = host('status', 'open');
      this.el = el;
      this.bar = h('div', { class: 'bar on' });
      this.dot = h('span', { class: 'dot on' });
      this.text = h('span', {}, S.statoAttivo);
      this.label = h('div', { class: 'label' }, this.dot, this.text);
      this.banners = h('div', {});
      shadow.append(this.banners, this.bar, this.label);
      this.state = 'on';
    }

    /** Inserisce l'area subito prima del contenitore della casella; da richiamare se il sito la rimuove. */
    attach(anchor) {
      if (!anchor || !anchor.parentElement) return;
      if (this.el.isConnected && this.el.nextElementSibling === anchor) return;
      anchor.parentElement.insertBefore(this.el, anchor);
    }

    setState(state, text) {
      this.state = state;
      const cls = state === 'on' ? 'on' : state === 'off' ? 'off' : 'warn';
      this.bar.className = 'bar ' + cls;
      this.dot.className = 'dot ' + cls;
      this.text.textContent = text;
    }

    banner(kind, title, msg, opts) {
      opts = opts || {};
      if (opts.replace !== false) this.banners.textContent = '';
      const link = opts.link && /^https:\/\//.test(opts.link.href)
        ? h('a', { href: opts.link.href, target: '_blank', rel: 'noopener noreferrer' }, opts.link.text)
        : null;
      const actions = (opts.actions || (opts.action ? [opts.action] : [])).map((a) => {
        const btn = h('button', { class: 'btn' + (a.primary ? ' primary' : ''), type: 'button' }, a.text);
        btn.addEventListener('click', async (ev) => {
          if (!ev.isTrusted) return;
          btn.disabled = true;
          const done = await a.onClick();
          if (typeof done === 'string' && opts.action) btn.textContent = done;
          else btn.disabled = false;
        });
        return btn;
      });
      const action = actions.length ? actions : null;
      const b = h('div', { class: 'banner ' + kind, role: kind === 'error' ? 'alert' : 'status' },
        h('div', { class: 'msg' }, title ? h('b', {}, title) : null, msg, link ? ' ' : null, link,
          action ? h('div', { class: 'act' }, ...action) : null),
        h('button', { class: 'x', title: S.chiudi, 'aria-label': S.chiudi, onclick: () => b.remove() }, '×'));
      this.banners.append(b);
      if (opts.timeout) setTimeout(() => b.remove(), opts.timeout);
      return b;
    }

    clearBanners() {
      this.banners.textContent = '';
    }
  }

  function modal(build) {
    return new Promise((resolve) => {
      const { el, shadow } = host('modal');
      const done = (v) => {
        el.remove();
        document.removeEventListener('keydown', onKey, true);
        resolve(v);
      };
      const onKey = (e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          done(false);
        }
      };
      const dlg = h('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true' });
      build(dlg, done);
      shadow.append(h('div', { class: 'overlay' }, dlg));
      document.documentElement.append(el);
      document.addEventListener('keydown', onKey, true);
      const btn = dlg.querySelector('button.primary') || dlg.querySelector('button.danger') || dlg.querySelector('button');
      if (btn) btn.focus();
    });
  }

  /** Conferma in modalità personale quando il server non risponde. */
  function confirmUnprotected(localFindings, opts) {
    opts = opts || {};
    return modal((dlg, done) => {
      const items = Object.entries(localFindings || {});
      dlg.append(
        h('h2', {}, opts.title || S.confermaTitolo),
        opts.extra ? h('p', {}, opts.extra) : null,
        h('p', {}, S.confermaTesto),
        items.length
          ? h('div', {}, h('p', {}, S.confermaRilevati),
            h('ul', {}, items.map(([t, n]) => h('li', {}, `${n} ${PG.detectorLite.LABELS[t] || t}`))))
          : h('p', {}, S.confermaNessuno),
        h('div', { class: 'actions' },
          h('button', { class: 'btn', onclick: () => done(false) }, S.annulla),
          h('button', { class: 'btn danger', onclick: () => done(true) }, S.confermaInvia))
      );
    });
  }

  /** Primo spegnimento in una conversazione che contiene già dati protetti. */
  function confirmOff() {
    return modal((dlg, done) => {
      dlg.append(
        h('h2', {}, S.offTitolo),
        h('p', {}, S.offTesto),
        h('div', { class: 'actions' },
          h('button', { class: 'btn', onclick: () => done(false) }, S.annulla),
          h('button', { class: 'btn danger', onclick: () => done(true) }, S.offConferma))
      );
    });
  }

  /** Anteprima Ctrl+Maiusc+Invio: originale e testo inviato affiancati. */
  function preview(original, sent, entities) {
    return modal((dlg, done) => {
      const origRanges = (entities || []).map((e) => ({ start: e.start, end: e.end, title: e.tag }));
      dlg.append(
        h('h2', {}, S.anteprimaTitolo),
        h('div', { class: 'cols' },
          h('div', { class: 'col' }, h('h3', {}, S.anteprimaOriginale), h('div', { class: 'txt' }, highlighted(original, origRanges, 'o'))),
          h('div', { class: 'col' }, h('h3', {}, S.anteprimaInviato), h('div', { class: 'txt' }, highlighted(sent, tagRanges(sent), 't')))),
        h('div', { class: 'actions' },
          h('button', { class: 'btn', onclick: () => done(false) }, S.annulla),
          h('button', { class: 'btn primary', onclick: () => done(true) }, S.anteprimaInvia))
      );
    });
  }

  function badge(count, onClick) {
    const { el, shadow } = host('badge');
    el.style.display = 'block';
    const b = h('button', { class: 'badge', title: S.badgeTitolo, type: 'button' },
      '🛡 ', count > 0 ? S.datiProtetti(count) : S.nessunDato);
    b.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    });
    shadow.append(b);
    return el;
  }

  function toast(msg, ms) {
    const { el, shadow } = host('toast');
    shadow.append(h('div', { class: 'toast', role: 'status' }, msg));
    document.documentElement.append(el);
    setTimeout(() => el.remove(), ms || 3500);
  }

  PG.ui = { StatusArea, confirmUnprotected, confirmOff, preview, badge, toast, highlighted, tagRanges, h };
})(typeof globalThis !== 'undefined' ? globalThis : this);
