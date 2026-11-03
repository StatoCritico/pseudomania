// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 gli autori di Pseudomania
//
// Personal edition: DOCX e XLSX elaborati a livello di XML, porting in JavaScript di
// server/pseudogate/files/ooxml.py e office.py.
//
// - Si lavora sui token del file XML (senza DOMParser, assente nei service worker): tutto ciò che
//   non si tocca resta identico, compresi dichiarazione XML, prefissi, spazi e parti binarie.
// - In un paragrafo Word un'entità può essere spezzata su più run ("Ma" + "rio Rossi"): il
//   paragrafo è una sequenza di «atomi» (w:t, w:tab, w:br…), le sostituzioni si applicano al testo
//   concatenato e si ridistribuiscono: il segnaposto eredita la formattazione del run in cui inizia.
// - Le formule di Excel (<f>) non si toccano; i valori in cache delle formule testuali sì.
// Limiti come nel server: testo nelle immagini, OLE binari, nomi dei fogli; inoltre le sezioni
// CDATA (rare in OOXML) non vengono elaborate.

(function (root) {
  'use strict';
  const PG = (root.PG = root.PG || {});

  const NS = {
    W: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
    X: 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
    A: 'http://schemas.openxmlformats.org/drawingml/2006/main',
    C: 'http://schemas.openxmlformats.org/drawingml/2006/chart',
    TC: 'http://schemas.microsoft.com/office/spreadsheetml/2018/threadedcomments',
    REL: 'http://schemas.openxmlformats.org/package/2006/relationships',
    DC: 'http://purl.org/dc/elements/1.1/',
    CP: 'http://schemas.openxmlformats.org/package/2006/metadata/core-properties',
    EP: 'http://schemas.openxmlformats.org/officeDocument/2006/extended-properties',
    VT: 'http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes',
    XMLNS: 'http://www.w3.org/XML/1998/namespace',
  };
  const q = (ns, local) => `{${ns}}${local}`;

  // --- XML: entità ---------------------------------------------------------------------------
  function decodeXml(s) {
    return s.replace(/&(#x[0-9a-fA-F]+|#\d+|lt|gt|amp|quot|apos);/g, (m, e) => {
      if (e === 'lt') return '<';
      if (e === 'gt') return '>';
      if (e === 'amp') return '&';
      if (e === 'quot') return '"';
      if (e === 'apos') return "'";
      const code = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return String.fromCodePoint(code);
    });
  }
  const escText = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const escAttr = (s) => escText(s).replace(/"/g, '&quot;');

  // --- XML: token e albero -------------------------------------------------------------------
  class XmlDoc {
    constructor(text) {
      this.tokens = [];
      this.elements = []; // {open, close, parent, tag:'{ns}local', ns}
      this._tokenize(text);
    }

    _tokenize(s) {
      const toks = this.tokens;
      let i = 0;
      const stack = [];
      const nsStack = [{ xml: NS.XMLNS }];
      while (i < s.length) {
        if (s[i] !== '<') {
          const j = s.indexOf('<', i);
          const end = j < 0 ? s.length : j;
          toks.push({ type: 'text', raw: s.slice(i, end), parent: stack.length ? stack[stack.length - 1] : -1 });
          i = end;
          continue;
        }
        let end;
        if (s.startsWith('<!--', i)) end = s.indexOf('-->', i) + 3;
        else if (s.startsWith('<![CDATA[', i)) end = s.indexOf(']]>', i) + 3;
        else if (s.startsWith('<?', i)) end = s.indexOf('?>', i) + 2;
        else if (s.startsWith('<!', i)) end = s.indexOf('>', i) + 1;
        else {
          let k = i + 1;
          let quote = null;
          while (k < s.length) {
            const c = s[k];
            if (quote) {
              if (c === quote) quote = null;
            } else if (c === '"' || c === "'") quote = c;
            else if (c === '>') break;
            k++;
          }
          end = k + 1;
          const raw = s.slice(i, end);
          if (raw[1] === '/') {
            const el = stack.pop();
            nsStack.pop();
            toks.push({ type: 'close', raw, el });
            if (el !== undefined) this.elements[el].close = toks.length - 1;
          } else {
            const self = /\/\s*>$/.test(raw);
            const m = raw.match(/^<([^\s/>]+)/);
            const qname = m ? m[1] : '';
            const attrs = [];
            const rx = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
            let am;
            const body = raw.slice(1 + qname.length);
            while ((am = rx.exec(body)) !== null) attrs.push({ qname: am[1], raw: am[2] !== undefined ? am[2] : am[3] });
            const nsMap = Object.assign({}, nsStack[nsStack.length - 1]);
            for (const a of attrs) {
              if (a.qname === 'xmlns') nsMap[''] = decodeXml(a.raw);
              else if (a.qname.startsWith('xmlns:')) nsMap[a.qname.slice(6)] = decodeXml(a.raw);
            }
            const [prefix, local] = qname.includes(':') ? qname.split(':', 2) : ['', qname];
            const tok = { type: 'open', raw, qname, attrs, self, nsMap };
            toks.push(tok);
            const el = {
              open: toks.length - 1, close: self ? toks.length - 1 : -1,
              parent: stack.length ? stack[stack.length - 1] : -1,
              tag: q(nsMap[prefix] || '', local),
            };
            this.elements.push(el);
            tok.el = this.elements.length - 1;
            if (!self) {
              stack.push(this.elements.length - 1);
              nsStack.push(nsMap);
            }
          }
          i = end;
          continue;
        }
        if (end <= i) end = s.length; // markup non chiuso: si conserva il resto
        toks.push({ type: 'other', raw: s.slice(i, end), parent: stack.length ? stack[stack.length - 1] : -1 });
        i = end;
      }
    }

    toString() {
      return this.tokens.map((t) => t.raw).join('');
    }

    /** Elementi con tag in `tags` (Set di '{ns}local'), in ordine di documento. */
    find(tags) {
      const out = [];
      this.elements.forEach((e, i) => {
        if (tags.has(e.tag)) out.push(i);
      });
      return out;
    }

    isDescendant(el, anc) {
      let p = this.elements[el].parent;
      while (p !== -1) {
        if (p === anc) return true;
        p = this.elements[p].parent;
      }
      return false;
    }

    /** Testo diretto (nodi di testo figli) dell'elemento. */
    text(el) {
      const e = this.elements[el];
      if (e.close === e.open) return '';
      let out = '';
      for (let t = e.open + 1; t < e.close; t++) {
        const tok = this.tokens[t];
        if (tok.type === 'text' && tok.parent === el) out += decodeXml(tok.raw);
      }
      return out;
    }

    setText(el, value) {
      const e = this.elements[el];
      const open = this.tokens[e.open];
      const needsPreserve = value !== value.trim() || value.includes('  ');
      if (needsPreserve && !open.attrs.some((a) => a.qname === 'xml:space')) {
        open.attrs.push({ qname: 'xml:space', raw: 'preserve' });
        open.dirty = true;
      }
      if (e.close === e.open) {
        // <w:t/> → <w:t>valore</w:t>
        open.self = false;
        open.dirty = true;
        this._regen(open);
        open.raw += escText(value) + `</${open.qname}>`;
        return;
      }
      let first = true;
      for (let t = e.open + 1; t < e.close; t++) {
        const tok = this.tokens[t];
        if (tok.type === 'text' && tok.parent === el) {
          tok.raw = first ? escText(value) : '';
          first = false;
        }
      }
      if (first) this.tokens[e.close].raw = escText(value) + this.tokens[e.close].raw; // <w:t></w:t>
      if (open.dirty) this._regen(open);
    }

    attr(el, qname) {
      const a = this.tokens[this.elements[el].open].attrs.find((x) => x.qname === qname);
      return a ? decodeXml(a.raw) : null;
    }

    /** Attributi per nome locale (senza prefisso). */
    attrsByLocal(el) {
      return this.tokens[this.elements[el].open].attrs.map((a) => ({ qname: a.qname, local: a.qname.split(':').pop(), value: decodeXml(a.raw) }));
    }

    setAttr(el, qname, value) {
      const open = this.tokens[this.elements[el].open];
      const a = open.attrs.find((x) => x.qname === qname);
      if (a) a.raw = escAttr(value);
      else open.attrs.push({ qname, raw: escAttr(value) });
      open.dirty = true;
      this._regen(open);
    }

    remove(el) {
      const e = this.elements[el];
      for (let t = e.open; t <= e.close; t++) this.tokens[t].raw = '';
    }

    _regen(open) {
      const attrs = open.attrs.map((a) => ` ${a.qname}="${a.raw}"`).join('');
      open.raw = `<${open.qname}${attrs}${open.self ? '/' : ''}>`;
    }
  }

  // --- Atomi, unità, riscrittura ---------------------------------------------------------------
  function atomSet(doc, atom, value) {
    if (atom.attr) doc.setAttr(atom.el, atom.attr, value);
    else doc.setText(atom.el, value);
    atom.text = value;
  }

  function unitText(u) {
    return u.atoms.map((a) => a.text).join('');
  }

  /** Porting di rewrite_unit: applica le modifiche (offset sul testo concatenato) agli atomi. */
  function rewriteUnit(doc, unit, edits) {
    if (!edits.length) return false;
    const full = unitText(unit);
    const n = full.length;
    const ranges = [];
    let pos = 0;
    for (const atom of unit.atoms) {
      ranges.push([pos, pos + atom.text.length, atom]);
      pos += atom.text.length;
    }
    const editable = ranges.filter((r) => r[2].editable);
    if (!editable.length) return false;
    const covered = new Uint8Array(n);
    const anchors = new Map();
    const tail = [];
    for (const e of [...edits].sort((a, b) => a.start - b.start)) {
      for (let p = Math.max(0, e.start); p < Math.min(n, e.end); p++) covered[p] = 1;
      let anchor = null;
      for (const [a, b] of editable) {
        if (b > a && b > e.start) {
          anchor = Math.max(a, e.start);
          break;
        }
      }
      if (anchor === null || anchor >= n) tail.push(e.text);
      else {
        if (!anchors.has(anchor)) anchors.set(anchor, []);
        anchors.get(anchor).push(e.text);
      }
    }
    let changed = false;
    for (const [a, b, atom] of editable) {
      if (b <= a) continue;
      let touched = false;
      for (let p = a; p < b && !touched; p++) if (covered[p] || anchors.has(p)) touched = true;
      if (!touched) continue;
      let out = '';
      for (let p = a; p < b; p++) {
        if (anchors.has(p)) out += anchors.get(p).join('');
        if (!covered[p]) out += full[p];
      }
      atomSet(doc, atom, out);
      changed = true;
    }
    if (tail.length) {
      const last = editable[editable.length - 1][2];
      atomSet(doc, last, last.text + tail.join(''));
      changed = true;
    }
    return changed;
  }

  function paragraphUnits(doc, container, editableTags, fixed) {
    const units = [];
    const contTag = container;
    for (const cont of doc.find(new Set([contTag]))) {
      const atoms = [];
      const e = doc.elements[cont];
      for (let i = cont + 1; i < doc.elements.length; i++) {
        const el = doc.elements[i];
        if (el.open > e.close) break;
        if (!editableTags.has(el.tag) && !(el.tag in fixed)) continue;
        // il contenitore più vicino deve essere `cont` (paragrafi annidati = unità a sé)
        let anc = el.parent;
        while (anc !== -1 && anc !== cont && doc.elements[anc].tag !== contTag) anc = doc.elements[anc].parent;
        if (anc !== cont) continue;
        if (editableTags.has(el.tag)) atoms.push({ el: i, text: doc.text(i), editable: true });
        else atoms.push({ el: i, text: fixed[el.tag], editable: false });
      }
      if (atoms.length) units.push({ doc, atoms });
    }
    return units;
  }

  function elementUnits(doc, tags) {
    return doc
      .find(new Set(tags))
      .map((el) => ({ doc, atoms: [{ el, text: doc.text(el), editable: true }] }))
      .filter((u) => u.atoms[0].text.trim());
  }

  function attributeUnits(doc, localNames) {
    const out = [];
    doc.elements.forEach((_, el) => {
      for (const a of doc.attrsByLocal(el)) {
        if (a.qname.startsWith('xmlns')) continue;
        if (localNames.has(a.local) && a.value.trim()) out.push({ doc, atoms: [{ el, text: a.value, editable: true, attr: a.qname }] });
      }
    });
    return out;
  }

  // --- Pacchetto -------------------------------------------------------------------------------
  class Package {
    constructor(bytes) {
      this.zip = PG.zip.readZip(bytes);
      this.names = this.zip.entries.map((e) => e.name);
      this.docs = new Map();
      this.modified = new Set();
      this.removed = new Set();
      this.replaced = new Map();
    }

    entry(name) {
      return this.zip.entries.find((e) => e.name === name);
    }

    async read(name) {
      return this.entry(name).data();
    }

    async doc(name) {
      if (!this.docs.has(name)) {
        let bytes = await this.read(name);
        let bom = false;
        if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
          bom = true;
          bytes = bytes.subarray(3);
        }
        const d = new XmlDoc(new TextDecoder('utf-8').decode(bytes));
        d.bom = bom;
        this.docs.set(name, d);
      }
      return this.docs.get(name);
    }

    async save() {
      const enc = new TextEncoder();
      const out = [];
      for (const e of this.zip.entries) {
        if (this.removed.has(e.name)) continue;
        if (this.replaced.has(e.name)) out.push({ name: e.name, content: this.replaced.get(e.name), time: e.time, date: e.date, externalAttr: e.externalAttr });
        else if (this.modified.has(e.name)) {
          const d = this.docs.get(e.name);
          const body = enc.encode(d.toString());
          const content = d.bom ? new Uint8Array([0xef, 0xbb, 0xbf, ...body]) : body;
          out.push({ name: e.name, content, time: e.time, date: e.date, externalAttr: e.externalAttr });
        } else out.push(e);
      }
      return PG.zip.writeZip(out);
    }
  }

  const DOCX_TEXT_PART = /^word\/(document|header\d*|footer\d*|footnotes|endnotes|comments\w*|people|glossary\/document)\.xml$/;
  const CHART_PART = /^(word|xl)\/charts\/chart\d*\.xml$/;
  const EMBED_PART = /^(word|xl)\/embeddings\/[^/]+\.(docx|xlsx)$/i;
  const RELS_PART = /^(word|xl)\/(worksheets\/)?_rels\/[^/]+\.rels$/;

  async function docprops(pkg) {
    const out = [];
    if (pkg.names.includes('docProps/core.xml')) {
      const d = await pkg.doc('docProps/core.xml');
      out.push({ part: 'docProps/core.xml', units: elementUnits(d, [
        q(NS.DC, 'creator'), q(NS.CP, 'lastModifiedBy'), q(NS.DC, 'title'), q(NS.DC, 'subject'),
        q(NS.CP, 'keywords'), q(NS.DC, 'description'), q(NS.CP, 'category'), q(NS.CP, 'contentStatus')]) });
    }
    if (pkg.names.includes('docProps/app.xml')) {
      const d = await pkg.doc('docProps/app.xml');
      out.push({ part: 'docProps/app.xml', units: elementUnits(d, [q(NS.EP, 'Company'), q(NS.EP, 'Manager'), q(NS.EP, 'HyperlinkBase')]) });
    }
    if (pkg.names.includes('docProps/custom.xml')) {
      const d = await pkg.doc('docProps/custom.xml');
      out.push({ part: 'docProps/custom.xml', units: elementUnits(d, [q(NS.VT, 'lpwstr'), q(NS.VT, 'lpstr')]) });
    }
    return out;
  }

  async function externalRels(pkg) {
    const out = [];
    for (const name of pkg.names) {
      if (!RELS_PART.test(name)) continue;
      const d = await pkg.doc(name);
      const units = d
        .find(new Set([q(NS.REL, 'Relationship')]))
        .filter((el) => d.attr(el, 'TargetMode') === 'External' && (d.attr(el, 'Target') || '').trim())
        .map((el) => ({ doc: d, atoms: [{ el, text: d.attr(el, 'Target'), editable: true, attr: 'Target' }] }));
      if (units.length) out.push({ part: name, units });
    }
    return out;
  }

  async function charts(pkg) {
    const out = [];
    for (const name of pkg.names) {
      if (!CHART_PART.test(name)) continue;
      const d = await pkg.doc(name);
      let units = paragraphUnits(d, q(NS.A, 'p'), new Set([q(NS.A, 't')]), {});
      for (const cache of d.find(new Set([q(NS.C, 'strCache')]))) {
        units = units.concat(elementUnits(d, [q(NS.C, 'v')]).filter((u) => d.isDescendant(u.atoms[0].el, cache)));
      }
      out.push({ part: name, units });
    }
    return out;
  }

  async function collectDocx(pkg) {
    const out = [];
    const fixed = { [q(NS.W, 'tab')]: '\t', [q(NS.W, 'br')]: '\n', [q(NS.W, 'cr')]: '\n', [q(NS.W, 'noBreakHyphen')]: '-' };
    for (const name of pkg.names) {
      if (!DOCX_TEXT_PART.test(name)) continue;
      const d = await pkg.doc(name);
      let units = paragraphUnits(d, q(NS.W, 'p'), new Set([q(NS.W, 't'), q(NS.W, 'delText')]), fixed);
      units = units.concat(elementUnits(d, [q(NS.W, 'instrText')]));
      units = units.concat(attributeUnits(d, new Set(['author', 'initials', 'userId', 'instr'])));
      out.push({ part: name, units });
    }
    return out.concat(await charts(pkg), await externalRels(pkg), await docprops(pkg));
  }

  async function collectXlsx(pkg) {
    const out = [];
    for (const name of pkg.names) {
      if (name === 'xl/sharedStrings.xml') {
        const d = await pkg.doc(name);
        out.push({ part: name, units: paragraphUnits(d, q(NS.X, 'si'), new Set([q(NS.X, 't')]), {}) });
      } else if (/^xl\/worksheets\/sheet\d*\.xml$/.test(name)) {
        const d = await pkg.doc(name);
        let units = paragraphUnits(d, q(NS.X, 'is'), new Set([q(NS.X, 't')]), {});
        for (const c of d.find(new Set([q(NS.X, 'c')]))) {
          if (d.attr(c, 't') !== 'str') continue;
          let v = -1;
          for (let i = c + 1; i < d.elements.length && d.elements[i].open < d.elements[c].close; i++) {
            if (d.elements[i].parent === c && d.elements[i].tag === q(NS.X, 'v')) {
              v = i;
              break;
            }
          }
          if (v >= 0 && d.text(v).trim()) units.push({ doc: d, atoms: [{ el: v, text: d.text(v), editable: true }] });
        }
        units = units.concat(elementUnits(d, ['oddHeader', 'oddFooter', 'evenHeader', 'evenFooter', 'firstHeader', 'firstFooter'].map((t) => q(NS.X, t))));
        out.push({ part: name, units });
      } else if (/^xl\/comments(?:\d*|\/[^/]+)\.xml$/.test(name)) {
        const d = await pkg.doc(name);
        const units = paragraphUnits(d, q(NS.X, 'text'), new Set([q(NS.X, 't')]), {}).concat(elementUnits(d, [q(NS.X, 'author')]));
        out.push({ part: name, units });
      } else if (/^xl\/threadedComments\/[^/]+\.xml$/.test(name)) {
        const d = await pkg.doc(name);
        out.push({ part: name, units: elementUnits(d, [q(NS.TC, 'text')]) });
      } else if (/^xl\/persons\/[^/]+\.xml$/.test(name)) {
        const d = await pkg.doc(name);
        out.push({ part: name, units: attributeUnits(d, new Set(['displayName', 'userId'])) });
      } else if (/^xl\/pivotCache\/[^/]+\.xml$/.test(name)) {
        const d = await pkg.doc(name);
        const units = d
          .find(new Set([q(NS.X, 's')]))
          .filter((el) => (d.attr(el, 'v') || '').trim())
          .map((el) => ({ doc: d, atoms: [{ el, text: d.attr(el, 'v'), editable: true, attr: 'v' }] }));
        out.push({ part: name, units });
      }
    }
    return out.concat(await charts(pkg), await externalRels(pkg), await docprops(pkg));
  }

  async function dropThumbnail(pkg) {
    const thumbs = pkg.names.filter((n) => /^docProps\/thumbnail\.\w+$/.test(n));
    if (!thumbs.length || !pkg.names.includes('_rels/.rels')) return false;
    const rels = await pkg.doc('_rels/.rels');
    for (const el of rels.find(new Set([q(NS.REL, 'Relationship')]))) {
      if (thumbs.includes((rels.attr(el, 'Target') || '').replace(/^\//, ''))) rels.remove(el);
    }
    pkg.modified.add('_rels/.rels');
    if (pkg.names.includes('[Content_Types].xml')) {
      const ct = await pkg.doc('[Content_Types].xml');
      ct.elements.forEach((e, el) => {
        if (thumbs.includes((ct.attr(el, 'PartName') || '').replace(/^\//, ''))) ct.remove(el);
      });
      pkg.modified.add('[Content_Types].xml');
    }
    thumbs.forEach((t) => pkg.removed.add(t));
    return true;
  }

  /**
   * Applica `transform(texts) → edits per testo` (una sola chiamata) a tutto il pacchetto.
   * @returns {Promise<Uint8Array>} nuovo file (o lo stesso oggetto se nulla è cambiato)
   */
  async function transformOffice(bytes, kind, transform, depth) {
    depth = depth || 0;
    const pkg = new Package(bytes);
    const collected = kind === 'docx' ? await collectDocx(pkg) : await collectXlsx(pkg);
    const flat = [];
    for (const pu of collected) for (const u of pu.units) flat.push([pu.part, u]);
    let changed = false;
    if (flat.length) {
      const edits = await transform(flat.map(([, u]) => unitText(u)));
      flat.forEach(([part, unit], i) => {
        const ed = edits[i];
        if (ed && ed.length && rewriteUnit(unit.doc, unit, ed)) {
          pkg.modified.add(part);
          changed = true;
        }
      });
    }
    if (changed) await dropThumbnail(pkg);
    if (depth < 2) {
      for (const e of pkg.zip.entries) {
        const m = e.name.match(EMBED_PART);
        if (!m) continue;
        const inner = await e.data();
        const newInner = await transformOffice(inner, m[2].toLowerCase(), transform, depth + 1);
        if (newInner !== inner) {
          pkg.replaced.set(e.name, newInner);
          changed = true;
        }
      }
    }
    return changed ? pkg.save() : bytes;
  }

  /** 'docx' | 'xlsx' | null dal contenuto (non dall'estensione del nome). */
  async function detectOfficeKind(bytes) {
    let pkg;
    try {
      pkg = new Package(bytes);
    } catch (_) {
      return null;
    }
    if (!pkg.names.includes('[Content_Types].xml')) return null;
    const ct = new TextDecoder().decode(await pkg.read('[Content_Types].xml'));
    if (/vnd\.ms-word\.document\.macroEnabled|vnd\.ms-excel\.sheet\.macroEnabled/.test(ct)) return null;
    if (pkg.names.includes('word/document.xml')) return 'docx';
    if (pkg.names.includes('xl/workbook.xml')) return 'xlsx';
    return null;
  }

  const api = { XmlDoc, NS, rewriteUnit, transformOffice, detectOfficeKind, decodeXml };
  PG.ooxml = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
