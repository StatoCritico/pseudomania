// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 gli autori di Pseudomania
//
// Ripristino dei valori reali nel DOM di claude.ai, anche durante lo streaming.
// Idea di partenza: Privacy Guardrail (DFKI), response-observer.ts / de-anonymizer.ts; qui il
// ripristino avviene in linea, nodo per nodo.
//
// Principi:
//  - Si modifica solo `nodeValue` dei nodi di testo esistenti, mai la struttura: React/ProseMirror
//    continuano a possedere i propri nodi. Se il sito riscrive un nodo, lo si rielabora.
//  - Per ogni nodo modificato si ricorda {raw, rendered}: se il nodo contiene ancora `rendered`,
//    il suo testo «vero» è `raw` (con i segnaposto). Così l'elaborazione è idempotente e i
//    segnaposto spezzati fra più nodi (es. "[FULL" + "NAME_1]") vengono ricomposti.
//  - L'evidenziazione usa la CSS Custom Highlight API (nessun elemento aggiunto).

(function (root) {
  'use strict';
  const PG = (root.PG = root.PG || {});

  const BLOCK_TAGS = new Set([
    'P', 'LI', 'UL', 'OL', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'TD', 'TH', 'TR', 'TABLE', 'PRE',
    'BLOCKQUOTE', 'DIV', 'SECTION', 'ARTICLE', 'MAIN', 'BODY', 'DD', 'DT', 'DL', 'FIGCAPTION',
    'SUMMARY', 'DETAILS', 'HEADER', 'FOOTER', 'NAV', 'ASIDE', 'FORM', 'FIELDSET',
  ]);

  function closestBlock(node) {
    let el = node.nodeType === 1 ? node : node.parentElement;
    while (el && !BLOCK_TAGS.has(el.tagName)) el = el.parentElement;
    return el;
  }

  class RestoreEngine {
    /**
     * @param {object} o
     * @param {object} o.adapter               adattatore del sito
     * @param {Document} o.doc
     * @param {()=>string[]} [o.excludeTexts]  testi da non toccare (istruzione fissa)
     * @param {(info:{turn:Element, raw:string, unknown:string[]})=>void} [o.onResponseComplete]
     * @param {(tags:string[])=>void} [o.onUnknown]
     * @param {(restoredTags:string[])=>void} [o.onProcessed]  dopo ogni elaborazione
     */
    constructor(o) {
      this.adapter = o.adapter;
      this.doc = o.doc;
      this.excludeTexts = o.excludeTexts || (() => []);
      this.onResponseComplete = o.onResponseComplete || (() => {});
      this.onUnknown = o.onUnknown || (() => {});
      this.onProcessed = o.onProcessed || (() => {});
      this.entries = {};
      this.unrecoverable = [];
      this.state = new WeakMap(); // Text -> {raw, rendered}
      this.highlights = new Map(); // Text -> [{start,end,kind,tag}]
      this.observer = null;
      this.pending = new Set();
      this.flushScheduled = false;
      this.hlScheduled = false;
      this.completed = new WeakMap(); // turn -> raw già segnalato
      this.completeTimers = new WeakMap();
      this.unknownSeen = new Set();
      this.enabled = true;
    }

    setEntries(entries, unrecoverable) {
      this.entries = entries || {};
      if (unrecoverable) this.unrecoverable = unrecoverable;
      this.processAll();
    }

    setEnabled(on) {
      this.enabled = on;
      if (!on) this.revertAll();
      else this.processAll();
    }

    start() {
      if (this.observer) return;
      this.observer = new MutationObserver((records) => this.onMutations(records));
      this.observer.observe(this.doc.body || this.doc.documentElement, {
        childList: true, subtree: true, characterData: true, attributes: true,
        attributeFilter: ['data-is-streaming'],
      });
      this.processAll();
    }

    stop() {
      if (this.observer) this.observer.disconnect();
      this.observer = null;
    }

    isExcludedNode(textNode) {
      const p = textNode.parentElement;
      if (!p) return true;
      return Boolean(p.closest(this.adapter.SELECTORS.noRestore));
    }

    rawOf(node) {
      const st = this.state.get(node);
      return st && node.data === st.rendered ? st.raw : node.data;
    }

    textNodesIn(el) {
      const out = [];
      const walker = this.doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walker.nextNode())) {
        if (!this.isExcludedNode(n)) out.push(n);
      }
      return out;
    }

    onMutations(records) {
      if (!this.enabled) return;
      for (const r of records) {
        if (r.type === 'characterData') this.pending.add(closestBlock(r.target));
        else if (r.type === 'childList') {
          for (const n of r.addedNodes) {
            if (n.nodeType === 3) this.pending.add(closestBlock(n));
            else if (n.nodeType === 1 && !(n.closest && n.closest('pg-ui, [data-pg-ui]'))) this.pending.add(n);
          }
          if (r.target && r.target.nodeType === 1) this.pending.add(closestBlock(r.target));
        } else if (r.type === 'attributes') {
          this.scheduleComplete(r.target);
        }
      }
      this.scheduleFlush();
    }

    scheduleFlush() {
      if (this.flushScheduled) return;
      this.flushScheduled = true;
      Promise.resolve().then(() => {
        this.flushScheduled = false;
        const blocks = [...this.pending].filter(Boolean);
        this.pending.clear();
        // Elabora solo i blocchi più esterni fra quelli in coda.
        const outer = blocks.filter((b) => b.isConnected && !blocks.some((o) => o !== b && o.contains(b)));
        for (const b of outer) this.processElement(b);
        this.checkTurns(outer);
      });
    }

    processAll() {
      if (!this.doc.body) return;
      if (!this.enabled) return;
      this.processElement(this.doc.body);
      this.checkTurns([this.doc.body]);
    }

    /** Rielabora tutti i nodi di testo dell'elemento. */
    processElement(el) {
      if (!el || !el.isConnected) return;
      const nodes = this.textNodesIn(el);
      if (!nodes.length) return;
      let prevBlock = null;
      const segments = nodes.map((n) => {
        const b = closestBlock(n);
        const seg = { raw: this.rawOf(n), sep: prevBlock !== null && b !== prevBlock };
        prevBlock = b;
        return seg;
      });
      const plan = PG.tags.planRewrite(segments, this.entries, { excludeTexts: this.excludeTexts(), unrecoverable: this.unrecoverable });
      plan.segments.forEach((s, i) => {
        const node = nodes[i];
        const raw = segments[i].raw;
        if (s.rendered !== raw) {
          if (node.data !== s.rendered) node.data = s.rendered;
          this.state.set(node, { raw, rendered: s.rendered });
        } else {
          if (this.state.has(node)) {
            if (node.data !== raw) node.data = raw;
            this.state.delete(node);
          }
        }
        if (s.highlights.length) this.highlights.set(node, s.highlights);
        else this.highlights.delete(node);
      });
      this.markInstruction(nodes);
      this.onProcessed(plan.restored);
      if (plan.unknown.length) {
        const fresh = plan.unknown.filter((t) => !this.unknownSeen.has(t));
        if (fresh.length) {
          fresh.forEach((t) => this.unknownSeen.add(t));
          this.onUnknown(fresh);
        }
      }
      this.scheduleHighlights();
    }

    /**
     * Segna il paragrafo che contiene solo l'istruzione fissa sui segnaposto, così il foglio di
     * stile lo riduce a un'etichetta. Si aggiunge solo un attributo: la struttura resta del sito.
     */
    markInstruction(nodes) {
      const instr = this.excludeTexts().map((s) => String(s).replace(/\s+/g, ' ').trim()).filter(Boolean);
      if (!instr.length) return;
      const seen = new Set();
      for (const n of nodes) {
        const b = closestBlock(n);
        if (!b || seen.has(b) || b.hasAttribute('data-pg-instr')) continue;
        seen.add(b);
        if (b.isContentEditable) continue;
        const txt = (b.textContent || '').replace(/\s+/g, ' ').trim();
        if (instr.includes(txt)) b.setAttribute('data-pg-instr', '');
      }
    }

    /** Riporta tutti i nodi al testo con segnaposto (estensione disattivata). */
    revertAll() {
      if (!this.doc.body) return;
      const walker = this.doc.createTreeWalker(this.doc.body, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walker.nextNode())) {
        const st = this.state.get(n);
        if (st && n.data === st.rendered) n.data = st.raw;
        this.state.delete(n);
      }
      this.highlights.clear();
      this.scheduleHighlights();
    }

    scheduleHighlights() {
      if (this.hlScheduled) return;
      this.hlScheduled = true;
      const run = () => {
        this.hlScheduled = false;
        this.applyHighlights();
      };
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
      else setTimeout(run, 0);
    }

    applyHighlights() {
      if (typeof CSS === 'undefined' || !CSS.highlights || typeof Highlight === 'undefined') return;
      const restored = [];
      const unknown = [];
      const unrec = [];
      for (const [node, list] of this.highlights) {
        if (!node.isConnected) {
          this.highlights.delete(node);
          continue;
        }
        for (const h of list) {
          if (h.end > node.data.length) continue;
          const r = this.doc.createRange();
          r.setStart(node, h.start);
          r.setEnd(node, h.end);
          (h.kind === 'restored' ? restored : h.kind === 'unrecoverable' ? unrec : unknown).push(r);
        }
      }
      CSS.highlights.set('pg-restored', new Highlight(...restored));
      CSS.highlights.set('pg-unknown', new Highlight(...unknown));
      CSS.highlights.set('pg-unrecoverable', new Highlight(...unrec));
    }

    /** Testo «vero» (con segnaposto) di un elemento: per ispezione, eventi e confronto dei badge. */
    rawTextOf(el) {
      const nodes = this.textNodesIn(el);
      let out = '';
      let prevBlock = null;
      for (const n of nodes) {
        const b = closestBlock(n);
        if (prevBlock !== null && b !== prevBlock) out += '\n';
        out += this.rawOf(n);
        prevBlock = b;
      }
      return out.replace(/\n{3,}/g, '\n\n').trim();
    }

    // --- Fine risposta: segnalazione response_received e segnaposto sconosciuti ---------------

    checkTurns(roots) {
      const msgs = this.adapter.getAssistantMessages(this.doc);
      for (const m of msgs) {
        if (roots.some((r) => r.contains(m) || m.contains(r))) this.scheduleComplete(m);
      }
    }

    scheduleComplete(el) {
      if (!el || el.nodeType !== 1) return;
      const turn = this.adapter.assistantTurn(el);
      const prev = this.completeTimers.get(turn);
      if (prev) clearTimeout(prev);
      this.completeTimers.set(
        turn,
        setTimeout(() => {
          this.completeTimers.delete(turn);
          if (!turn.isConnected || this.adapter.isStreaming(turn)) return;
          const msgs = this.adapter.getAssistantMessages(this.doc).filter((m) => turn.contains(m) || m === turn);
          const target = msgs[0] || turn;
          const raw = this.rawTextOf(target);
          if (!raw || this.completed.get(turn) === raw) return;
          this.completed.set(turn, raw);
          const unknown = PG.tags
            .findTags(raw)
            .filter((t) => PG.tags.isKnownType(t.type) && !Object.prototype.hasOwnProperty.call(this.entries, t.tag) && !this.unrecoverable.includes(t.tag))
            .map((t) => t.tag);
          this.onResponseComplete({ turn, raw, unknown: [...new Set(unknown)] });
        }, 1200)
      );
    }
  }

  PG.RestoreEngine = RestoreEngine;
  PG.restoreInternals = { closestBlock };
})(typeof globalThis !== 'undefined' ? globalThis : this);
