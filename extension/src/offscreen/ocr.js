// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 gli autori di Pseudomania
//
// Documento offscreen (vedi OCR-CONTRATTO.md, sezione 2, e PDF-CONTRATTO.md, sezione A): OCR locale
// con Tesseract.js e trattamento dei PDF con MuPDF.js (pdf-engine.js). Tutto resta nel PC: le
// librerie, il modello «ita» e i motori WebAssembly sono file dell'estensione (src/vendor/), nessuna
// richiesta di rete.
//
// Messaggi accettati (solo con msg.target === 'pg-offscreen'):
//   ocr:image  {b64, mime}                       → {ok, data:{width, height, lines}}
//   ocr:redact {b64, mime, boxes, outMime}       → {ok, data:{b64, mime}}
//   pdf:prepare / pdf:redact / pdf:restore       → vedi pdf-engine.js e PDF-CONTRATTO.md, sezione A
// Le richieste sono servite una alla volta; il worker Tesseract è unico e creato al primo uso.
// Richiede: ../vendor/tesseract/tesseract.min.js (globale Tesseract) e ../shared/ocr-map.js (PG.ocrMap)
// caricati con <script> prima di questo modulo.

import { createPdfEngine } from './pdf-engine.js';

const TARGET = 'pg-offscreen';
const MAX_OCR_SIDE = 4000; // lato massimo dell'immagine passata a Tesseract

const url = (p) => chrome.runtime.getURL(p);

/** Errore con codice da riportare nella risposta ({ok:false, error: code}). */
class OffscreenError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

// ---------------------------------------------------------------- utilità

function b64ToBytes(b64) {
  const bin = atob(String(b64 || ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function blobToB64(blob) {
  return bytesToB64(new Uint8Array(await blob.arrayBuffer()));
}

function bytesToB64(bytes) {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  return btoa(bin);
}

/** Decodifica i byte di un'immagine (orientamento EXIF applicato dal browser). */
async function decodeImage(b64, mime) {
  try {
    const bytes = b64ToBytes(b64);
    return await createImageBitmap(new Blob([bytes], { type: mime || 'application/octet-stream' }));
  } catch (e) {
    throw new OffscreenError('decode', (e && e.message) || 'immagine non decodificabile');
  }
}

// ---------------------------------------------------------------- Tesseract

let workerPromise = null;

/** Worker Tesseract unico, creato al primo uso (in caso di errore si riprova alla richiesta seguente). */
function getWorker() {
  if (!workerPromise) {
    const T = globalThis.Tesseract;
    if (!T || typeof T.createWorker !== 'function') {
      return Promise.reject(new OffscreenError('ocr', 'Tesseract non caricato'));
    }
    // corePath è una cartella: con OEM 1 (solo LSTM) tesseract.js sceglie
    // tesseract-core-simd-lstm.wasm.js o tesseract-core-lstm.wasm.js a seconda del supporto SIMD.
    // La lingua è letta da `${langPath}/ita.traineddata.gz` (gzip: true).
    workerPromise = T.createWorker('ita', 1, {
      workerPath: url('src/vendor/tesseract/worker.min.js'),
      corePath: url('src/vendor/tesseract/core'),
      langPath: url('src/vendor/tesseract/lang'),
      workerBlobURL: false,
      gzip: true,
      cacheMethod: 'none',
    }, {
      // Il modello «ita» chiede il file facoltativo ita.special-words (user_words_suffix), che non
      // esiste: Tesseract scriverebbe in console «failed to load ./ita.special-words», mostrato da
      // Chrome come errore dell'estensione. Senza effetti sul riconoscimento.
      user_words_suffix: '',
    }).catch((e) => {
      workerPromise = null;
      throw e;
    });
  }
  return workerPromise;
}

/** Righe OCR ({words:[{text,bbox,conf}]}) dal risultato di recognize con output {blocks:true}. */
function linesFromBlocks(blocks, scale) {
  const lines = [];
  const k = scale || 1;
  const sc = (b) => ({ x0: b.x0 * k, y0: b.y0 * k, x1: b.x1 * k, y1: b.y1 * k });
  for (const block of blocks || []) {
    for (const par of (block && block.paragraphs) || []) {
      for (const line of (par && par.lines) || []) {
        const words = [];
        for (const w of (line && line.words) || []) {
          const text = String((w && w.text) || '').trim();
          if (!text || !w.bbox) continue;
          words.push({ text, bbox: sc(w.bbox), conf: Number(w.confidence) || 0 });
        }
        if (words.length) lines.push({ words });
      }
    }
  }
  return lines;
}

/**
 * OCR di un'immagine già decodificata (ImageBitmap o OffscreenCanvas). Se il lato più lungo supera
 * maxSide si legge una copia ridotta e i bbox sono riportati alla scala originale.
 */
async function ocrSource(source, maxSide) {
  const w = source.width;
  const h = source.height;
  const r = Math.min(1, (maxSide || MAX_OCR_SIDE) / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * r));
  const ch = Math.max(1, Math.round(h * r));
  const canvas = new OffscreenCanvas(cw, ch);
  const ctx = canvas.getContext('2d');
  // Fondo bianco: le parti trasparenti (PNG/WebP) diventerebbero nere per Tesseract.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, cw, ch);
  ctx.drawImage(source, 0, 0, cw, ch);
  const worker = await getWorker();
  let res;
  try {
    // Passiamo un PNG: Leptonica nel wasm non legge tutti i formati che il browser sa decodificare.
    const png = await canvas.convertToBlob({ type: 'image/png' });
    res = await worker.recognize(png, {}, { text: false, blocks: true });
  } catch (e) {
    throw new OffscreenError('ocr', (e && e.message) || String(e));
  }
  const k = r < 1 ? w / cw : 1;
  return linesFromBlocks(res && res.data && res.data.blocks, k);
}

// ---------------------------------------------------------------- gestori

async function ocrImage(msg) {
  const bmp = await decodeImage(msg.b64, msg.mime);
  try {
    const lines = await ocrSource(bmp, MAX_OCR_SIDE);
    return { width: bmp.width, height: bmp.height, lines };
  } finally {
    bmp.close();
  }
}

async function redactImage(msg) {
  const bmp = await decodeImage(msg.b64, msg.mime);
  const outMime = msg.outMime === 'image/jpeg' ? 'image/jpeg' : 'image/png';
  try {
    const canvas = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = canvas.getContext('2d');
    if (outMime === 'image/jpeg') {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, bmp.width, bmp.height);
    }
    ctx.drawImage(bmp, 0, 0);
    globalThis.PG.ocrMap.drawRedactions(ctx, Array.isArray(msg.boxes) ? msg.boxes : []);
    // Sempre ri-codificata: i metadati (EXIF, ecc.) dell'originale non sopravvivono.
    const blob = await canvas.convertToBlob({ type: outMime, quality: 0.92 });
    return { b64: await blobToB64(blob), mime: blob.type || outMime };
  } finally {
    bmp.close();
  }
}

// PDF (PDF-CONTRATTO.md, sezione A): MuPDF.js in pdf-engine.js, con lo stesso worker Tesseract e la
// stessa coda seriale delle richieste OCR.
const pdfEngine = createPdfEngine({ OffscreenError, ocrSource, b64ToBytes, bytesToB64 });

const HANDLERS = {
  'ocr:image': ocrImage,
  'ocr:redact': redactImage,
  'pdf:prepare': pdfEngine['pdf:prepare'],
  'pdf:redact': pdfEngine['pdf:redact'],
  'pdf:restore': pdfEngine['pdf:restore'],
};

// ---------------------------------------------------------------- coda e messaggi

let queue = Promise.resolve();

/** Serve una richiesta (in coda dopo le precedenti) e restituisce la risposta del contratto. */
function handle(msg) {
  const run = async () => {
    const fn = msg && HANDLERS[msg.type];
    if (!fn) return { ok: false, error: 'ocr', message: 'richiesta sconosciuta: ' + (msg && msg.type) };
    try {
      return { ok: true, data: await fn(msg) };
    } catch (e) {
      return { ok: false, error: (e && e.code) || 'ocr', message: (e && e.message) || String(e) };
    }
  };
  const p = queue.then(run, run);
  queue = p.catch(() => {});
  return p;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.target !== TARGET) return false;
  handle(msg).then(sendResponse);
  return true;
});

export { OffscreenError, ocrSource, b64ToBytes, bytesToB64, handle };

globalThis.PGOffscreen = { handle };
