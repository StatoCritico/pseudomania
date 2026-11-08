// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 gli autori di Pseudomania
//
// Motore PDF del documento offscreen (PDF-CONTRATTO.md, sezione A), con MuPDF.js (src/vendor/mupdf/,
// stesso motore di PyMuPDF). Porting in JavaScript di server/pseudogate/vendor/rizzo_pdf/pdf_export.py
// (redact_pdf, restore_pdf e pulizie) e pdf_text.py (testo leggibile), usati dalla Server edition:
// stessa logica, stessi limiti. Le differenze dovute all'API di MuPDF.js sono segnalate con «DIFF:».
//
// Messaggi (instradati da ocr.js, serializzati con le altre richieste):
//   pdf:prepare {b64, imagePolicy, maxOcrPages=30} → {pageCount, truncated, pages:[{index, width, height,
//               text, textChars, images:[{x0,y0,x1,y1}], ocr: OcrLine[]|null}]}
//   pdf:redact  {b64, mapping:{chiave:valore}, ocrBoxes:[{page,x0,y0,x1,y1,label}], imagePolicy}
//               → {b64, report:{redacted, skipped, residual, imagesRemoved, ocrBoxes, ...}}
//   pdf:restore {b64, mapping:{tag:valore}} → {b64, report:{restored, unknown, ...}}
// Coordinate: punti PDF, origine in alto a sinistra (spazio pagina di MuPDF, come PyMuPDF).
//
// mapping di pdf:redact: lo stesso segnaposto può avere più valori; le chiavi successive sono il tag
// seguito da spazi ('[FULLNAME_1] '). Il segnaposto scritto nel PDF è key.trim(); nel report
// (skipped/residual/byPlaceholder) si restituisce la chiave così com'è.

const MUPDF_URL = '../vendor/mupdf/mupdf.js';

// Opzioni dello structured text equivalenti a TEXTFLAGS_RAWDICT / TEXTFLAGS_DICT / TEXTFLAGS_TEXT di
// PyMuPDF (ligature e spazi conservati, ritaglio alla pagina, immagini, CID per l'unicode ignoto).
// DIFF: in MuPDF.js «mediabox-clip» è deprecato e si chiama «clip».
const STEXT_OPTS = 'preserve-ligatures,preserve-whitespace,preserve-images,clip,use-cid-for-unknown-unicode';

// Colore della casella di redazione (pdf_export.REDACT_FILL / REDACT_TEXT): viola pieno, segnaposto bianco.
const REDACT_FILL = [0.486, 0.227, 0.62];
const REDACT_TEXT = [1, 1, 1];

// Rendering per l'OCR delle zone immagine (stessi valori del vecchio ocr:pdf).
const OCR_SCALE = 2;
const OCR_MAX_SIDE = 3000;
const DEFAULT_MAX_OCR_PAGES = 30;

// Metriche di Helvetica usate da Shape.insert_textbox di PyMuPDF (fontdict di «helv»).
const HELV_ASCENDER = 1.075;
const HELV_DESCENDER = -0.299;

// Nomi delle risorse font aggiunte alle pagine per i segnaposto e le righe ripristinate.
const FONT_RES = { helv: 'PGHelv', hebo: 'PGHeBo' };

const PRODUCER = 'Pseudomania';

/**
 * Crea i gestori pdf:* con le dipendenze del documento offscreen (niente import circolari con ocr.js).
 * @param {{OffscreenError: Function, ocrSource: Function, b64ToBytes: Function, bytesToB64: Function}} deps
 */
export function createPdfEngine(deps) {
  const { OffscreenError, ocrSource, b64ToBytes, bytesToB64 } = deps;

  // ------------------------------------------------------------ caricamento di MuPDF (al primo uso)

  // DIFF (organizzativa): mupdf.js usa un top-level await per istanziare il wasm (10 MB); con un import
  // statico ocr.js registrerebbe il listener dei messaggi solo a wasm pronto, anche per le richieste OCR
  // di immagini. Lo carichiamo quindi con import() al primo messaggio pdf:*. Il file
  // mupdf-wasm.wasm è trovato accanto a mupdf-wasm.js (new URL('mupdf-wasm.wasm', import.meta.url)),
  // cioè chrome-extension://<id>/src/vendor/mupdf/; il manifest consente 'wasm-unsafe-eval'.
  let mupdfPromise = null;
  function getMupdf() {
    if (!mupdfPromise) {
      mupdfPromise = import(MUPDF_URL).catch((e) => {
        mupdfPromise = null;
        throw new OffscreenError('pdf', 'MuPDF non caricato: ' + ((e && e.message) || e));
      });
    }
    return mupdfPromise;
  }

  // ------------------------------------------------------------ geometria (fitz.Rect)

  const R = (x0, y0, x1, y1) => ({ x0, y0, x1, y1 });
  const rectFromArr = (a) => R(a[0], a[1], a[2], a[3]);
  const isEmpty = (r) => !(r.x1 > r.x0 && r.y1 > r.y0);
  const area = (r) => (isEmpty(r) ? 0 : (r.x1 - r.x0) * (r.y1 - r.y0));
  const union = (a, b) => R(Math.min(a.x0, b.x0), Math.min(a.y0, b.y0), Math.max(a.x1, b.x1), Math.max(a.y1, b.y1));
  const intersect = (a, b) => R(Math.max(a.x0, b.x0), Math.max(a.y0, b.y0), Math.min(a.x1, b.x1), Math.min(a.y1, b.y1));
  const quadBounds = (q) =>
    R(Math.min(q[0], q[2], q[4], q[6]), Math.min(q[1], q[3], q[5], q[7]), Math.max(q[0], q[2], q[4], q[6]), Math.max(q[1], q[3], q[5], q[7]));
  const toPlain = (r) => ({ x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1 });

  // ------------------------------------------------------------ regex (porting di re Python)

  // DIFF: in JavaScript \w è solo ASCII anche con il flag «u»; il \w di Python sulle str è Unicode
  // (lettere, cifre, underscore). Lo emuliamo con classi \p{...}.
  const W = '[\\p{L}\\p{N}_]';
  const NW = '[^\\p{L}\\p{N}_]';
  const reEscape = (c) => c.replace(/[\\^$.*+?()[\]{}|/]/g, '\\$&');

  /** _norm: spazi compressi + casefold. DIFF: toLowerCase() al posto di casefold() (ß resta ß). */
  function norm(s) {
    return String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
  }

  // Sillabazione a fine riga (_HYPHEN_BREAK): trattino morbido, U+2010 o «-», poi a-capo.
  const HYPHEN_BREAK = '(?:[\\u00ad\\u2010\\-]?[ \\t]*\\n[ \\t]*)?';
  const UNANCHORED_MIN_ALNUM = 4;
  const alnumOf = (s) => s.replace(/[^\p{L}\p{N}]+/gu, '');

  /** _value_pattern: caratteri esatti con confini di parola, sillabazione e spazi flessibili. */
  function valuePattern(value) {
    const v = norm(value);
    let core = v.replace(new RegExp('^' + NW + '+', 'u'), '');
    core = core.replace(new RegExp(NW + '+$', 'u'), '');
    let toks = core.split(' ').filter(Boolean);
    if (!toks.length) return null;
    let left;
    let right;
    if (alnumOf(core).length >= UNANCHORED_MIN_ALNUM) {
      left = new RegExp('^' + NW, 'u').test(v) ? '' : '(?<!' + W + ')';
      right = new RegExp(NW + '$', 'u').test(v) ? '' : '(?!' + W + ')';
    } else {
      toks = v.split(' ').filter(Boolean);
      left = '(?<!' + W + ')';
      right = '(?!' + W + ')';
    }
    const body = toks.map((tok) => Array.from(tok).map(reEscape).join(HYPHEN_BREAK)).join('\\s*');
    // DIFF: re.IGNORECASE di Python → flag «i» con «u» (case folding semplice di Unicode).
    return new RegExp(left + body + right, 'giu');
  }

  /** _too_noisy: meno di 2 caratteri alfanumerici, o 2 sole cifre. */
  function tooNoisy(value) {
    const a = alnumOf(norm(value));
    return a.length < 2 || (a.length === 2 && /^\p{Nd}+$/u.test(a));
  }

  /** _sub_all: applica tutte le (regex, segnaposto). Ritorna [nuova, n]. */
  function subAll(patterns, s) {
    let n = 0;
    let out = String(s);
    for (const [pat, ph] of patterns) {
      pat.lastIndex = 0;
      out = out.replace(pat, () => {
        n += 1;
        return ph;
      });
    }
    return [out, n];
  }

  // ------------------------------------------------------------ Helvetica (testo dei segnaposto)

  let fonts = null;
  function getFonts(mupdf) {
    if (!fonts) fonts = { helv: new mupdf.Font('Helvetica'), hebo: new mupdf.Font('Helvetica-Bold') };
    return fonts;
  }

  // WinAnsiEncoding (codifica «Latin» di addSimpleFont): Latin-1 più i caratteri tipografici 0x80–0x9F.
  const WINANSI_EXTRA = {
    0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88,
    0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93,
    0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b,
    0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
  };
  const LIGATURES = { 'ﬀ': 'ff', 'ﬁ': 'fi', 'ﬂ': 'fl', 'ﬃ': 'ffi', 'ﬄ': 'ffl', ' ': ' ' };

  /** Testo → [caratteri unicode effettivamente scritti, byte WinAnsi]; i non codificabili diventano «?». */
  function winAnsi(text) {
    const s = String(text).normalize('NFC').replace(/[ﬀ-ﬄ ]/g, (c) => LIGATURES[c]);
    const chars = [];
    const bytes = [];
    for (const ch of s) {
      const cp = ch.codePointAt(0);
      let b = null;
      if ((cp >= 0x20 && cp <= 0x7e) || (cp >= 0xa1 && cp <= 0xff)) b = cp;
      else if (WINANSI_EXTRA[cp]) b = WINANSI_EXTRA[cp];
      else if (cp === 0x09) b = 0x20;
      if (b == null) {
        chars.push('?');
        bytes.push(0x3f);
      } else {
        chars.push(b === 0x20 && cp === 0x09 ? ' ' : ch);
        bytes.push(b);
      }
    }
    return { chars, bytes };
  }

  /** fitz.get_text_length per Helvetica / Helvetica-Bold. */
  function textLength(mupdf, text, fontname, fontsize) {
    const font = getFonts(mupdf)[fontname === 'hebo' ? 'hebo' : 'helv'];
    let w = 0;
    for (const c of winAnsi(text).chars) w += font.advanceGlyph(font.encodeCharacter(c));
    return w * fontsize;
  }

  /** Stringa letterale PDF dai byte WinAnsi. */
  function pdfString(bytes) {
    let s = '(';
    for (const b of bytes) {
      if (b === 0x28 || b === 0x29 || b === 0x5c) s += '\\' + String.fromCharCode(b);
      else if (b < 0x20 || b > 0x7e) s += '\\' + b.toString(8).padStart(3, '0');
      else s += String.fromCharCode(b);
    }
    return s + ')';
  }

  const num = (n) => {
    const r = Math.round(n * 1000) / 1000;
    return Object.is(r, -0) ? '0' : String(r);
  };

  /** _fit_fontsize: corpo per far stare `text` in `rect` (0 = non ci sta). */
  function fitFontsize(mupdf, text, rect, maxFs = 10, minFs = 4) {
    let w10;
    try {
      w10 = textLength(mupdf, text, 'helv', 10);
    } catch (_) {
      return 0;
    }
    if (w10 <= 0) return 0;
    const fs = Math.min(maxFs, (rect.y1 - rect.y0) * 0.82, (10 * Math.max(rect.x1 - rect.x0 - 2, 0)) / w10);
    return fs >= minFs ? Math.round(fs * 10) / 10 : 0;
  }

  /** _covered: `rect` è già (quasi) tutto dentro una redazione precedente. */
  function covered(rect, taken, thr = 0.85) {
    const a = area(rect);
    if (a <= 0) return true;
    for (const t of taken) {
      const inter = intersect(rect, t);
      if (!isEmpty(inter) && area(inter) / a >= thr) return true;
    }
    return false;
  }

  // ------------------------------------------------------------ scrittura nel content stream

  /**
   * Prepara la pagina per aggiungere contenuto: font Helvetica nelle risorse e contenuto originale
   * racchiuso in q/Q. Restituisce una funzione che accoda un blocco di operatori espressi nelle
   * coordinate di pagina MuPDF (origine in alto a sinistra).
   *
   * DIFF: PyMuPDF scrive il testo di copertura dentro apply_redactions() (Shape.draw_rect +
   * insert_textbox) e insert_text(); MuPDF.js non ha né l'uno né l'altro. Aggiungiamo noi un content
   * stream alla pagina con il riquadro pieno e il testo in Helvetica (font semplice WinAnsi), come fa
   * Shape.commit(): stesso risultato nel PDF (testo vero, estraibile), nessuna annotazione.
   */
  function pageWriter(mupdf, doc, page) {
    const pageObj = page.getObject();
    let res = pageObj.get('Resources');
    if (!res || !res.isDictionary()) {
      const inh = pageObj.getInheritable('Resources');
      res = inh && inh.isDictionary() ? inh : doc.newDictionary();
      pageObj.put('Resources', res);
    }
    let fontDict = res.get('Font');
    if (!fontDict || !fontDict.isDictionary()) fontDict = res.put('Font', doc.newDictionary());
    const f = getFonts(mupdf);
    if (!fontDict.get(FONT_RES.helv).isDictionary()) fontDict.put(FONT_RES.helv, doc.addSimpleFont(f.helv, 'Latin'));
    if (!fontDict.get(FONT_RES.hebo).isDictionary()) fontDict.put(FONT_RES.hebo, doc.addSimpleFont(f.hebo, 'Latin'));
    // Da spazio pagina MuPDF a spazio utente PDF: inversa di getTransform() (gestisce anche /Rotate).
    const inv = mupdf.Matrix.invert(page.getTransform());
    const ops = [];
    return {
      fillRect(r, color) {
        ops.push(`${color.map(num).join(' ')} rg ${num(r.x0)} ${num(r.y0)} ${num(r.x1 - r.x0)} ${num(r.y1 - r.y0)} re f`);
      },
      text(x, y, text, fontname, fontsize, color) {
        const { bytes } = winAnsi(text);
        // Tm con -1 sulla y: lo spazio è capovolto dalla cm, i glifi restano dritti.
        ops.push(`BT /${FONT_RES[fontname] || FONT_RES.helv} ${num(fontsize)} Tf ${color.map(num).join(' ')} rg 1 0 0 -1 ${num(x)} ${num(y)} Tm ${pdfString(bytes)} Tj ET`);
      },
      commit() {
        if (!ops.length) return;
        const body = `Q\nq\n${inv.map(num).join(' ')} cm\n${ops.join('\n')}\nQ\n`;
        const head = doc.addStream('q\n', doc.newDictionary());
        const tail = doc.addStream(body, doc.newDictionary());
        const old = pageObj.get('Contents');
        const arr = doc.newArray();
        arr.push(head);
        if (old.isArray()) for (let i = 0; i < old.length; i++) arr.push(old.get(i));
        else if (!old.isNull()) arr.push(old);
        arr.push(tail);
        pageObj.put('Contents', arr);
      },
    };
  }

  /**
   * Testo centrato nel riquadro come Page.apply_redactions() di PyMuPDF: center_rect() calcola un
   * sotto-riquadro centrato in verticale, poi insert_textbox(align=center) riprova scendendo di 0,5 pt
   * finché il testo non entra (non sotto 4 pt).
   * DIFF: insert_textbox andrebbe a capo carattere per carattere se il testo fosse più largo del
   * riquadro; qui il corpo scende anche per la larghezza (i segnaposto sono una sola «parola», e
   * _fit_fontsize garantisce già che entrino).
   */
  function drawCenteredLabel(mupdf, writer, rect, text, fontsize, color) {
    const width = rect.x1 - rect.x0;
    if (!text || width <= 1e-5) return;
    let trect = { ...rect };
    const tw = textLength(mupdf, text, 'helv', fontsize);
    const h = Math.ceil(tw / width) * fontsize * 1.2;
    if (h < rect.y1 - rect.y0) trect.y0 = (rect.y0 + rect.y1 - h) * 0.5;
    const lhf = HELV_ASCENDER - HELV_DESCENDER > 1 ? HELV_ASCENDER - HELV_DESCENDER : 1.2;
    let fs = fontsize;
    while (fs >= 4) {
      const w = textLength(mupdf, text, 'helv', fs);
      const textHeight = fs * lhf - HELV_DESCENDER * fs;
      if (textHeight - (trect.y1 - trect.y0) <= 1e-5 && w <= width + 1e-5) {
        const x = trect.x0 + (width - w) / 2;
        const y = trect.y0 + fs * HELV_ASCENDER;
        writer.text(x, y, text, 'helv', fs, color);
        return;
      }
      fs -= 0.5;
    }
  }

  /**
   * Applica le redazioni della pagina e poi disegna riquadri e segnaposto (equivalente di
   * _add_redact_annot + page.apply_redactions()).
   * redacts: [{rect, text|null, fontsize, fill, textColor}]
   * DIFF: le annotazioni Redact di MuPDF.js hanno solo il rettangolo: testo, corpo e colori li teniamo
   * in JavaScript e li disegniamo dopo applyRedactions(black_boxes=false), come fa PyMuPDF.
   */
  function applyRedactions(mupdf, doc, page, redacts, imageMethod, lineArtMethod, textMethod) {
    if (!redacts.length) return;
    for (const r of redacts) {
      const a = page.createAnnotation('Redact');
      a.setRect([r.rect.x0, r.rect.y0, r.rect.x1, r.rect.y1]);
    }
    page.applyRedactions(false, imageMethod, lineArtMethod, textMethod);
    const writer = pageWriter(mupdf, doc, page);
    for (const r of redacts) {
      if (r.fill) writer.fillRect(r.rect, r.fill);
      if (r.text) drawCenteredLabel(mupdf, writer, r.rect, r.text, r.fontsize, r.textColor);
    }
    writer.commit();
  }

  // ------------------------------------------------------------ structured text

  /**
   * Structured text della pagina con annotazioni e widget visibili.
   * DIFF: page.get_text() di PyMuPDF esegue fz_run_page (contenuto + annotazioni + widget), mentre
   * Page.toStructuredText() di MuPDF.js legge solo il contenuto: passiamo da toDisplayList(true).
   */
  function stextOf(page) {
    const dl = page.toDisplayList(true);
    try {
      return dl.toStructuredText(STEXT_OPTS);
    } finally {
      dl.destroy();
    }
  }

  /**
   * _page_char_index: (testo, [bbox per carattere]) con «\n» (bbox null) a fine riga; più le immagini.
   * DIFF: il bbox del carattere è il rettangolo che contiene il quad (rawdict di PyMuPDF fa lo stesso
   * per il testo orizzontale).
   */
  function pageIndex(page) {
    const st = stextOf(page);
    const chars = [];
    const boxes = [];
    const images = [];
    try {
      st.walk({
        onImageBlock(bbox) {
          images.push(rectFromArr(bbox));
        },
        onChar(c, _origin, _font, _size, quad) {
          for (const cc of c) {
            chars.push(cc);
            boxes.push(quadBounds(quad));
          }
        },
        endLine() {
          chars.push('\n');
          boxes.push(null);
        },
      });
    } finally {
      st.destroy();
    }
    return { text: chars.join(''), boxes, images };
  }

  /** _match_rects: bbox dei caratteri del match, uniti per riga (sovrapposizione verticale). */
  function matchRects(boxes, start, end) {
    const rects = [];
    let cur = null;
    for (let i = start; i < end; i++) {
      const b = boxes[i];
      if (!b || isEmpty(b)) continue;
      if (!cur) cur = { ...b };
      else if (b.y0 < cur.y1 && b.y1 > cur.y0) cur = union(cur, b);
      else {
        rects.push(cur);
        cur = { ...b };
      }
    }
    if (cur && !isEmpty(cur)) rects.push(cur);
    return rects;
  }

  /**
   * Indici dei caratteri del testo JS → offset per pageIndex. Il testo è costruito con for..of sui code
   * point ma indicizzato in unità UTF-16 dalle regex: costruiamo boxes per unità UTF-16.
   */
  function utf16Boxes(text, boxes) {
    let k = 0;
    const out = [];
    for (const ch of text) {
      const b = boxes[k++];
      out.push(b);
      if (ch.length === 2) out.push(b);
    }
    return out;
  }

  // ------------------------------------------------------------ apertura / salvataggio

  function openPdf(mupdf, b64) {
    let bytes;
    try {
      bytes = b64ToBytes(b64);
    } catch (e) {
      throw new OffscreenError('pdf', 'base64 non valido');
    }
    let doc;
    try {
      doc = mupdf.Document.openDocument(bytes, 'application/pdf');
    } catch (e) {
      throw new OffscreenError('pdf', 'File PDF non valido o danneggiato: ' + ((e && e.message) || e));
    }
    const pdf = doc.asPDF && doc.asPDF();
    if (!pdf) {
      doc.destroy();
      throw new OffscreenError('pdf', 'Il file non è un PDF.');
    }
    if (pdf.needsPassword()) {
      pdf.destroy();
      throw new OffscreenError('encrypted', 'PDF protetto da password: rimuovi la protezione e riprova.');
    }
    let n;
    try {
      n = pdf.countPages();
    } catch (e) {
      pdf.destroy();
      throw new OffscreenError('pdf', 'File PDF non valido o danneggiato: ' + ((e && e.message) || e));
    }
    if (!(n > 0)) {
      pdf.destroy();
      throw new OffscreenError('pdf', 'PDF senza pagine.');
    }
    return pdf;
  }

  /** doc.tobytes(garbage=3, deflate=True) → saveToBuffer('garbage=3,compress'). */
  function saveB64(doc) {
    const buf = doc.saveToBuffer('garbage=3,compress');
    try {
      return bytesToB64(buf.asUint8Array().slice());
    } finally {
      buf.destroy();
    }
  }

  // ------------------------------------------------------------ pulizie (ciò che le redazioni non toccano)

  /**
   * _scrub_metadata: metadati classici e XMP.
   * DIFF: PyMuPDF set_metadata azzera le chiavi standard; qui sostituiamo l'intero dizionario /Info
   * (sparisce anche ogni chiave personalizzata) e togliamo /Metadata (XMP) dal catalogo, come
   * del_xml_metadata(). Creator/Producer = «Pseudomania» invece di «rizzo-pii».
   */
  function scrubMetadata(doc) {
    try {
      const trailer = doc.getTrailer();
      const info = doc.newDictionary();
      info.put('Creator', doc.newString(PRODUCER));
      info.put('Producer', doc.newString(PRODUCER));
      trailer.put('Info', doc.addObject(info));
    } catch (_) { /* come in Python: si prosegue */ }
    try {
      const root = doc.getTrailer().get('Root');
      if (root && root.isDictionary()) root.delete('Metadata');
    } catch (_) { /* idem */ }
  }

  /**
   * _scrub_annots: contenuto, oggetto e autore delle annotazioni (escluse le Redact).
   * DIFF: annot.info di PyMuPDF ↔ getContents/getSubject/getAuthor (title = /T = autore) di MuPDF.js.
   */
  function scrubAnnots(page, patterns) {
    let done = 0;
    let annots;
    try {
      annots = page.getAnnotations();
    } catch (_) {
      return 0;
    }
    for (const a of annots) {
      try {
        if (a.getType() === 'Redact') continue;
        let hit = 0;
        const c = a.getContents();
        if (c) {
          const [n, k] = subAll(patterns, c);
          if (k) {
            a.setContents(n);
            hit += k;
          }
        }
        if (a.hasSubject()) {
          const s = a.getSubject();
          if (s) {
            const [n, k] = subAll(patterns, s);
            if (k) {
              a.setSubject(n);
              hit += k;
            }
          }
        }
        if (a.hasAuthor()) {
          const t = a.getAuthor();
          if (t) {
            const [n, k] = subAll(patterns, t);
            if (k) {
              a.setAuthor(n);
              hit += k;
            }
          }
        }
        if (hit) {
          a.update();
          done += hit;
        }
      } catch (_) {
        continue;
      }
    }
    return done;
  }

  /**
   * _scrub_widgets: valore dei campi modulo.
   * DIFF: w.field_value = … ↔ setTextValue (campi di testo) / setChoiceValue (elenchi) di MuPDF.js.
   */
  function scrubWidgets(page, patterns) {
    let done = 0;
    let widgets;
    try {
      widgets = page.getWidgets();
    } catch (_) {
      return 0;
    }
    for (const w of widgets) {
      try {
        const val = w.getValue();
        if (typeof val !== 'string' || !val) continue;
        const [n, hit] = subAll(patterns, val);
        if (!hit) continue;
        if (w.isText()) w.setTextValue(n);
        else if (w.isChoice()) w.setChoiceValue(n);
        else continue;
        w.update();
        done += hit;
      } catch (_) {
        continue;
      }
    }
    return done;
  }

  /** Visita in profondità dei segnalibri con l'iteratore di MuPDF.js. */
  function walkOutline(doc, fn) {
    let it;
    try {
      it = doc.outlineIterator();
    } catch (_) {
      return;
    }
    const visit = (depth) => {
      if (depth > 64) return;
      for (;;) {
        const item = it.item();
        if (item) {
          fn(item, it);
          if (it.down() === 0) {
            visit(depth + 1);
            it.up();
          }
        }
        if (it.next() !== 0) break;
      }
    };
    try {
      visit(0);
    } finally {
      it.destroy();
    }
  }

  /**
   * _scrub_toc: titoli dei segnalibri.
   * DIFF: PyMuPDF rilegge e riscrive tutto l'indice (get_toc/set_toc); con MuPDF.js aggiorniamo il
   * solo titolo di ogni voce (OutlineIterator.update), così destinazioni e stato restano intatti.
   */
  function scrubToc(doc, patterns) {
    let done = 0;
    walkOutline(doc, (item, it) => {
      const [title, hit] = subAll(patterns, item.title || '');
      if (hit) {
        try {
          it.update({ title, uri: item.uri, open: item.open });
          done += hit;
        } catch (_) { /* voce non aggiornabile */ }
      }
    });
    return done;
  }

  /**
   * _strip_embedded: allegati incorporati, tutti rimossi.
   * DIFF (più severo): oltre all'albero /EmbeddedFiles (embfile_names/embfile_del) togliamo anche le
   * annotazioni FileAttachment, che contengono a loro volta un file incorporato.
   */
  function stripEmbedded(doc) {
    let removed = 0;
    try {
      for (const name of Object.keys(doc.getEmbeddedFiles())) {
        try {
          doc.deleteEmbeddedFile(name);
          removed += 1;
        } catch (_) {
          continue;
        }
      }
    } catch (_) { /* nessun allegato */ }
    const n = doc.countPages();
    for (let i = 0; i < n; i++) {
      try {
        const page = doc.loadPage(i);
        for (const a of page.getAnnotations().slice()) {
          if (a.getType() === 'FileAttachment') {
            page.deleteAnnotation(a);
            removed += 1;
          }
        }
      } catch (_) {
        continue;
      }
    }
    return removed;
  }

  /**
   * Firme digitali (non presenti nel Python, che non le trattava). Un PDF firmato contiene nel
   * dizionario /Sig il certificato del firmatario (nome, codice fiscale in chiaro nel CMS di /Contents),
   * il nome (/Name), il luogo e il motivo; spesso anche un riquadro visibile con il nome. Qualsiasi
   * modifica del PDF invalida comunque la firma: si tolgono i campi firma (widget e /Fields), /SigFlags,
   * /Perms e /DSS (archivio di certificati, OCSP e CRL delle firme PAdES); gli oggetti /Sig rimasti
   * senza riferimenti spariscono al salvataggio (garbage). Restituisce il numero di firme tolte.
   */
  function isSigField(obj) {
    try {
      const o = obj.resolve();
      const ft = o.getInheritable('FT');
      return Boolean(ft && !ft.isNull() && ft.asName() === 'Sig');
    } catch (_) {
      return false;
    }
  }

  function stripFieldArray(arr) {
    let removed = 0;
    if (!arr || arr.isNull() || !arr.isArray()) return 0;
    for (let j = arr.length - 1; j >= 0; j--) {
      const f = arr.get(j);
      if (isSigField(f)) {
        arr.delete(j);
        removed += 1;
        continue;
      }
      try {
        removed += stripFieldArray(f.resolve().get('Kids'));
      } catch (_) { /* campo senza figli */ }
    }
    return removed;
  }

  function stripSignatures(doc) {
    let removed = 0;
    const n = doc.countPages();
    for (let i = 0; i < n; i++) {
      try {
        const page = doc.loadPage(i);
        const annots = page.getObject().get('Annots');
        if (annots && !annots.isNull() && annots.resolve().isArray()) {
          const arr = annots.resolve();
          for (let j = arr.length - 1; j >= 0; j--) {
            const a = arr.get(j).resolve();
            const sub = a.get('Subtype');
            if (sub && !sub.isNull() && sub.asName() === 'Widget' && isSigField(a)) {
              arr.delete(j);
              removed += 1;
            }
          }
        }
        page.destroy();
      } catch (_) {
        continue;
      }
    }
    const root = doc.getTrailer().get('Root');
    try {
      const af = root.get('AcroForm');
      if (af && !af.isNull()) {
        const form = af.resolve();
        removed += stripFieldArray(form.get('Fields'));
        form.delete('SigFlags');
      }
    } catch (_) { /* nessun modulo */ }
    for (const key of ['Perms', 'DSS']) {
      try {
        const v = root.get(key);
        if (v && !v.isNull()) {
          root.delete(key);
          removed += 1;
        }
      } catch (_) { /* assente */ }
    }
    return removed;
  }

  /** Conta ciò che resta di firme digitali (campi /Sig, /Perms, /DSS): deve essere 0 prima dell'invio. */
  function countSignatures(doc) {
    let left = 0;
    const n = doc.countPages();
    for (let i = 0; i < n; i++) {
      const page = doc.loadPage(i);
      try {
        const annots = page.getObject().get('Annots');
        if (annots && !annots.isNull()) annots.resolve().forEach((a) => { if (isSigField(a)) left += 1; });
      } finally {
        page.destroy();
      }
    }
    const root = doc.getTrailer().get('Root');
    for (const key of ['Perms', 'DSS']) {
      const v = root.get(key);
      if (v && !v.isNull()) left += 1;
    }
    return left;
  }

  /** pdf_text.collect_readable_text: pagine + annotazioni + campi modulo + segnalibri. */
  function readableText(doc) {
    const parts = [];
    const n = doc.countPages();
    for (let i = 0; i < n; i++) {
      const page = doc.loadPage(i);
      try {
        const st = stextOf(page);
        try {
          parts.push(st.asText() || '');
        } finally {
          st.destroy();
        }
      } catch (_) { /* pagina illeggibile */ }
      try {
        for (const a of page.getAnnotations()) {
          if (a.getType() === 'Redact') continue;
          parts.push(String(a.getContents() || ''));
          parts.push(a.hasSubject() ? String(a.getSubject() || '') : '');
          parts.push(a.hasAuthor() ? String(a.getAuthor() || '') : '');
        }
      } catch (_) { /* come in Python */ }
      try {
        for (const w of page.getWidgets()) {
          const v = w.getValue();
          if (typeof v === 'string' && v) parts.push(v);
        }
      } catch (_) { /* idem */ }
    }
    walkOutline(doc, (item) => parts.push(String(item.title || '')));
    return parts.join('\n');
  }

  /** _verify_residuals: chiavi il cui valore è ancora leggibile nell'output (stesso pattern). */
  function verifyResiduals(mupdf, b64, items) {
    const doc = openPdf(mupdf, b64);
    let text;
    try {
      text = readableText(doc);
    } finally {
      doc.destroy();
    }
    const residual = [];
    for (const [key, val] of items) {
      const pat = valuePattern(val);
      if (!pat) continue;
      pat.lastIndex = 0;
      if (pat.test(text)) residual.push(key);
    }
    return residual;
  }

  // ------------------------------------------------------------ pdf:prepare

  /** Pixmap RGB di MuPDF → OffscreenCanvas (per ocrSource). */
  function pixmapToCanvas(pix) {
    const w = pix.getWidth();
    const h = pix.getHeight();
    const n = pix.getNumberOfComponents() + (pix.getAlpha() ? 1 : 0);
    const src = pix.getPixels();
    const stride = pix.getStride();
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      let s = y * stride;
      let d = y * w * 4;
      for (let x = 0; x < w; x++, s += n, d += 4) {
        rgba[d] = src[s];
        rgba[d + 1] = src[s + 1];
        rgba[d + 2] = src[s + 2];
        rgba[d + 3] = 255;
      }
    }
    const canvas = new OffscreenCanvas(w, h);
    canvas.getContext('2d').putImageData(new ImageData(rgba, w, h), 0, 0);
    return canvas;
  }

  const inside = (x, y, r) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;

  /** OCR delle zone immagine: render (scala 2, lato max 3000 px), Tesseract, bbox in punti. */
  async function ocrPage(mupdf, page, images) {
    const b = rectFromArr(page.getBounds());
    const side = Math.max(b.x1 - b.x0, b.y1 - b.y0);
    const scale = Math.min(OCR_SCALE, OCR_MAX_SIDE / side);
    let pix;
    try {
      pix = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false, true);
    } catch (e) {
      throw new OffscreenError('pdf', 'Pagina non renderizzabile: ' + ((e && e.message) || e));
    }
    let canvas;
    let ox;
    let oy;
    try {
      canvas = pixmapToCanvas(pix);
      ox = pix.getX();
      oy = pix.getY();
    } finally {
      pix.destroy();
    }
    const lines = await ocrSource(canvas, OCR_MAX_SIDE);
    const toPt = (bb) => ({ x0: (bb.x0 + ox) / scale, y0: (bb.y0 + oy) / scale, x1: (bb.x1 + ox) / scale, y1: (bb.y1 + oy) / scale });
    const out = [];
    for (const line of lines) {
      const words = [];
      for (const w of line.words) {
        const bb = toPt(w.bbox);
        const cx = (bb.x0 + bb.x1) / 2;
        const cy = (bb.y0 + bb.y1) / 2;
        if (images.some((r) => inside(cx, cy, r))) words.push({ text: w.text, bbox: bb, conf: w.conf });
      }
      if (words.length) out.push({ words });
    }
    return out;
  }

  async function prepare(msg) {
    const mupdf = await getMupdf();
    const policy = ['ocr', 'remove', 'keep'].includes(msg.imagePolicy) ? msg.imagePolicy : 'ocr';
    const maxOcr = Math.max(0, Number.isFinite(Number(msg.maxOcrPages)) && msg.maxOcrPages != null ? Number(msg.maxOcrPages) : DEFAULT_MAX_OCR_PAGES);
    const doc = openPdf(mupdf, msg.b64);
    try {
      const pageCount = doc.countPages();
      const pages = [];
      let ocrDone = 0;
      let truncated = false;
      for (let i = 0; i < pageCount; i++) {
        let page;
        let idx;
        try {
          page = doc.loadPage(i);
          idx = pageIndex(page);
        } catch (e) {
          throw new OffscreenError('pdf', 'Pagina ' + (i + 1) + ' illeggibile: ' + ((e && e.message) || e));
        }
        const b = rectFromArr(page.getBounds());
        const images = idx.images.filter((r) => !isEmpty(intersect(r, b)));
        let ocr = null;
        if (policy === 'ocr' && images.length) {
          if (ocrDone < maxOcr) {
            ocr = await ocrPage(mupdf, page, images);
            ocrDone += 1;
          } else {
            truncated = true;
          }
        }
        pages.push({
          index: i,
          width: b.x1 - b.x0,
          height: b.y1 - b.y0,
          text: idx.text,
          textChars: idx.text.replace(/\s+/g, '').length,
          images: images.map(toPlain),
          ocr,
        });
        page.destroy();
      }
      return { pageCount, truncated, pages };
    } finally {
      doc.destroy();
    }
  }

  // ------------------------------------------------------------ pdf:redact (redact_pdf)

  async function redact(msg) {
    const mupdf = await getMupdf();
    const policy = ['ocr', 'remove', 'keep'].includes(msg.imagePolicy) ? msg.imagePolicy : 'ocr';
    const mapping = msg.mapping && typeof msg.mapping === 'object' ? msg.mapping : {};
    // DIFF: Python rifiuta un dizionario vuoto (PdfError); qui si prosegue comunque, perché le pulizie
    // (metadati, allegati…), gli ocrBoxes e la rimozione delle immagini servono anche senza testo da coprire.
    const items = Object.entries(mapping).filter(([k, v]) => typeof k === 'string' && k.trim() && typeof v === 'string' && v.trim());
    // valori lunghi per primi (sort stabile, come items.sort(key=-len) in Python)
    items.sort((a, b) => b[1].length - a[1].length);

    const skipped = [];
    const usable = [];
    for (const [key, val] of items) {
      if (tooNoisy(val)) {
        skipped.push(key);
        continue;
      }
      const pat = valuePattern(val);
      if (pat) usable.push([key, val, pat]);
      else skipped.push(key);
    }
    const byPh = {};
    for (const [key] of usable) byPh[key] = 0;
    // Per annotazioni/widget/TOC: si sostituisce con il segnaposto vero (key.trim()).
    const patterns = usable.map(([key, , pat]) => [pat, key.trim()]);

    // ocrBoxes per pagina
    const boxesByPage = new Map();
    for (const bx of Array.isArray(msg.ocrBoxes) ? msg.ocrBoxes : []) {
      if (!bx || !Number.isInteger(bx.page)) continue;
      const r = R(Number(bx.x0), Number(bx.y0), Number(bx.x1), Number(bx.y1));
      if (![r.x0, r.y0, r.x1, r.y1].every(Number.isFinite) || isEmpty(r)) continue;
      if (!boxesByPage.has(bx.page)) boxesByPage.set(bx.page, []);
      boxesByPage.get(bx.page).push({ rect: r, label: bx.label != null ? String(bx.label).trim() : '' });
    }

    // Metodo per le immagini delle redazioni di testo/OCR: Python usa il predefinito (PIXELS, cioè i
    // pixel sotto il riquadro sono cancellati). Con 'keep' le immagini devono restare intatte.
    const imageMethod = policy === 'keep' ? mupdf.PDFPage.REDACT_IMAGE_NONE : mupdf.PDFPage.REDACT_IMAGE_PIXELS;

    const doc = openPdf(mupdf, msg.b64);
    let total = 0;
    let nAnnots = 0;
    let nWidgets = 0;
    let nOcr = 0;
    let imagesRemoved = 0;
    let out;
    try {
      // Firme digitali tolte prima di tutto: contengono il certificato del firmatario e spesso un
      // riquadro visibile con il nome, che la redazione del content stream non raggiunge.
      const nSig = stripSignatures(doc);
      const n = doc.countPages();
      for (let i = 0; i < n; i++) {
        const page = doc.loadPage(i);
        const { text, boxes: rawBoxes, images } = pageIndex(page);
        const boxes = utf16Boxes(text, rawBoxes);
        const taken = [];
        const redacts = [];
        if (text.trim()) {
          for (const [key, , pat] of usable) {
            const ph = key.trim();
            pat.lastIndex = 0;
            let m;
            while ((m = pat.exec(text)) !== null) {
              if (m[0].length === 0) {
                pat.lastIndex += 1;
                continue;
              }
              const rects = matchRects(boxes, m.index, m.index + m[0].length);
              let placedAny = false;
              let labeled = false;
              for (const r of rects) {
                if (covered(r, taken)) continue;
                const fs = labeled ? 0 : fitFontsize(mupdf, ph, r);
                redacts.push({ rect: r, text: fs ? ph : null, fontsize: fs || 6, fill: REDACT_FILL, textColor: REDACT_TEXT });
                taken.push({ ...r });
                placedAny = true;
                labeled = labeled || Boolean(fs);
              }
              if (placedAny) {
                byPh[key] += 1;
                total += 1;
              }
            }
          }
        }
        // Zone OCR (dati letti nelle immagini): non ci sono in Python (non fa OCR). Stessa redazione,
        // con i pixel delle immagini cancellati (REDACT_IMAGE_PIXELS) e il segnaposto sopra.
        if (policy !== 'keep') {
          for (const bx of boxesByPage.get(i) || []) {
            const fs = bx.label ? fitFontsize(mupdf, bx.label, bx.rect) : 0;
            redacts.push({ rect: bx.rect, text: fs ? bx.label : null, fontsize: fs || 6, fill: REDACT_FILL, textColor: REDACT_TEXT });
            nOcr += 1;
          }
        }
        // rimozione VERA dal content stream (line art: REMOVE_IF_COVERED, testo: REMOVE, come Python)
        applyRedactions(mupdf, doc, page, redacts, imageMethod, mupdf.PDFPage.REDACT_LINE_ART_REMOVE_IF_COVERED, mupdf.PDFPage.REDACT_TEXT_REMOVE);

        // 'remove': tutte le immagini tolte (seconda passata: solo immagini, testo e grafica intatti).
        if (policy === 'remove' && images.length) {
          for (const r of images) {
            const a = page.createAnnotation('Redact');
            a.setRect([r.x0, r.y0, r.x1, r.y1]);
          }
          page.applyRedactions(false, mupdf.PDFPage.REDACT_IMAGE_REMOVE, mupdf.PDFPage.REDACT_LINE_ART_NONE, mupdf.PDFPage.REDACT_TEXT_NONE);
          let left = 0;
          const st = stextOf(page);
          try {
            st.walk({ onImageBlock() { left += 1; } });
          } finally {
            st.destroy();
          }
          imagesRemoved += Math.max(0, images.length - left);
        }

        // dopo le redazioni: annotazioni e campi modulo non sono content stream
        nAnnots += scrubAnnots(page, patterns);
        nWidgets += scrubWidgets(page, patterns);
        page.destroy();
      }
      const nToc = scrubToc(doc, patterns);
      const nEmb = stripEmbedded(doc);
      scrubMetadata(doc);
      out = saveB64(doc);
      const checked = items.filter(([key]) => Object.prototype.hasOwnProperty.call(byPh, key));
      const residual = verifyResiduals(mupdf, out, checked);
      // Verifica sul file salvato: nessuna firma digitale deve sopravvivere (altrimenti: bloccato).
      const check = openPdf(mupdf, out);
      try {
        if (countSignatures(check) > 0) residual.push('[FIRMA_DIGITALE]');
      } finally {
        check.destroy();
      }
      return {
        b64: out,
        report: {
          redacted: total,
          skipped,
          residual,
          imagesRemoved,
          ocrBoxes: nOcr,
          byPlaceholder: byPh,
          notFound: Object.keys(byPh).filter((k) => byPh[k] === 0),
          annots: nAnnots,
          widgets: nWidgets,
          toc: nToc,
          embedded: nEmb,
          signatures: nSig,
        },
      };
    } finally {
      doc.destroy();
    }
  }

  // ------------------------------------------------------------ pdf:restore (restore_pdf)

  async function restore(msg) {
    const mupdf = await getMupdf();
    const mapping = msg.mapping && typeof msg.mapping === 'object' ? msg.mapping : {};
    const items = {};
    for (const [k, v] of Object.entries(mapping)) if (typeof k === 'string' && k.trim() && typeof v === 'string') items[k] = v;
    if (!Object.keys(items).length) throw new OffscreenError('pdf', 'Dizionario vuoto: carica il dizionario della sessione.');
    const keys = Object.keys(items);
    const tagRx = /\[[A-Z]+(?:_[A-Z]+)*_\d+\]/g;
    const byPh = {};
    for (const k of keys) byPh[k] = 0;
    const unknown = new Set();
    let total = 0;
    let nLines = 0;
    let nShrunk = 0;

    const doc = openPdf(mupdf, msg.b64);
    try {
      const n = doc.countPages();
      for (let i = 0; i < n; i++) {
        const page = doc.loadPage(i);
        // Righe come page.get_text("dict"): testo, bbox, origine/corpo/colore/grassetto del primo carattere.
        // DIFF: «dict» di PyMuPDF raggruppa in span; MuPDF.js dà i caratteri: i dati dello «span» sono
        // quelli del primo carattere della riga, come first = spans[0] in Python.
        const lines = [];
        let cur = null;
        const st = stextOf(page);
        try {
          st.walk({
            beginLine(bbox) {
              cur = { rect: rectFromArr(bbox), text: '', first: null };
            },
            onChar(c, origin, font, size, _quad, color) {
              if (!cur) return;
              if (!cur.first) {
                let bold = false;
                try {
                  bold = font.isBold() || /bold|black|heavy/i.test(font.getName());
                } catch (_) { /* font senza nome */ }
                cur.first = { origin, size, bold, color };
              }
              cur.text += c;
            },
            endLine() {
              if (cur && cur.text) lines.push(cur);
              cur = null;
            },
          });
        } finally {
          st.destroy();
        }
        const rewrites = [];
        for (const line of lines) {
          const text = line.text;
          if (!keys.some((ph) => text.includes(ph))) {
            for (const t of text.match(tagRx) || []) if (!(t in items)) unknown.add(t);
            continue;
          }
          const restored = text.replace(tagRx, (ph) => {
            if (Object.prototype.hasOwnProperty.call(items, ph)) {
              byPh[ph] += 1;
              total += 1;
              return items[ph];
            }
            unknown.add(ph);
            return ph;
          });
          const f = line.first;
          rewrites.push({
            rect: line.rect,
            origin: f.origin,
            size: Number(f.size) || 10,
            font: f.bold ? 'hebo' : 'helv',
            color: Array.isArray(f.color) && f.color.length === 3 ? f.color : [0, 0, 0],
            text: restored,
          });
        }
        if (!rewrites.length) {
          page.destroy();
          continue;
        }
        // Righe rimosse con una redazione bianca (fill (1,1,1), nessun testo), poi riscritte.
        applyRedactions(
          mupdf, doc, page,
          rewrites.map((w) => ({ rect: w.rect, text: null, fontsize: 6, fill: [1, 1, 1], textColor: [0, 0, 0] })),
          mupdf.PDFPage.REDACT_IMAGE_PIXELS, mupdf.PDFPage.REDACT_LINE_ART_REMOVE_IF_COVERED, mupdf.PDFPage.REDACT_TEXT_REMOVE,
        );
        const right = rectFromArr(page.getBounds()).x1 - 28;
        const writer = pageWriter(mupdf, doc, page);
        for (const w of rewrites) {
          let fs = w.size;
          const width = textLength(mupdf, w.text, w.font, fs);
          const avail = Math.max(right - w.origin[0], w.rect.x1 - w.rect.x0);
          if (width > avail) {
            fs = Math.max(5, Math.round(((fs * avail) / width) * 10) / 10);
            nShrunk += 1;
          }
          writer.text(w.origin[0], w.origin[1], w.text, w.font, fs, w.color);
          nLines += 1;
        }
        writer.commit();
        page.destroy();
      }
      const out = nLines ? saveB64(doc) : String(msg.b64);
      return {
        b64: out,
        report: {
          restored: total,
          unknown: [...unknown].sort(),
          byPlaceholder: byPh,
          notFound: keys.filter((k) => byPh[k] === 0),
          lines: nLines,
          shrunk: nShrunk,
        },
      };
    } finally {
      doc.destroy();
    }
  }

  return {
    'pdf:prepare': prepare,
    'pdf:redact': redact,
    'pdf:restore': restore,
    // per le prove
    _internals: { valuePattern, tooNoisy, fitFontsize, covered, norm },
  };
}
