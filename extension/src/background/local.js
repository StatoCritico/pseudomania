// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 gli autori di Pseudomania
//
// Personal edition: estensione AUTONOMA, senza server Pseudomania. Parla direttamente con
// Rizzo-PII desktop (http://127.0.0.1:5005) e offre agli script di contenuto la stessa interfaccia
// di messaggi della Server edition (pg:pseudonymize, pg:pseudonymizeFile, pg:dictionary…).
//
// - Tag stabili per scope assegnati qui; dizionario in IndexedDB, valori cifrati con una chiave
//   AES-GCM locale NON estraibile; l'indice valore→tag usa un HMAC con una chiave locale non
//   estraibile (nessun valore in chiaro su disco).
// - Registro locale (azioni, conteggi, hash; mai testi) cifrato con la stessa chiave.
// - Allowlist e categorie particolari incluse nell'estensione (policy-data.js).
// - Durate: chat 30 giorni dall'ultimo uso, scope pending 24 ore, progetti finché l'utente non li
//   elimina; registro 90 giorni.

(function (root) {
  'use strict';
  const PG = (root.PG = root.PG || {});
  const te = new TextEncoder();
  const td = new TextDecoder();
  const DAY = 86400000;
  const TAG_RX = /^\[([A-Z]+(?:_[A-Z]+)*)_(\d+)\]$/;

  let keysP = null;
  let policyCache = null;

  class Blocked extends Error {
    constructor(reason, category, special) {
      super(reason);
      this.category = category;
      // Solo i blocchi per categoria particolare (artt. 9-10 GDPR) possono essere superati
      // dall'utente con una conferma esplicita (decisione dell'8/11/2026, solo Personal edition).
      this.special = special || null;
    }
  }

  const b64 = (buf) => PG.keys.b64(buf);
  const unb64 = (s) => PG.keys.unb64(s);
  const scopeKey = (s) => `${s.type}:${s.id}`;

  // --- Esclusione reciproca per scope -----------------------------------------------------------
  // Ogni operazione che legge, modifica e riscrive il record pdict di uno scope (assign, dictionary
  // che aggiorna lastUsed, rebind, deleteScope, cleanup) passa da una catena di promise per chiave di
  // scope. Senza, due elaborazioni contemporanee sulla stessa conversazione (due schede, un messaggio
  // mentre si carica un file) leggono lo stesso record, calcolano lo stesso contatore e assegnano lo
  // stesso segnaposto (es. [FULLNAME_1]) a valori diversi: l'ultima scrittura vince e il ripristino
  // mostra la persona sbagliata. Le transazioni IndexedDB non bastano: fra get e put ci sono
  // operazioni asincrone (HMAC, cifratura). Il service worker è unico per l'estensione e local.js
  // gira solo lì, quindi una coda in memoria è sufficiente (se il SW viene terminato, le code muoiono
  // con lui insieme alle operazioni in corso).
  // Più chiavi (rebind) vengono accodate insieme e in modo sincrono, in ordine: niente attese
  // incrociate. NON richiamare withScopes per una chiave già tenuta dalla stessa operazione (stallo).
  const scopeChains = new Map();
  function withScopes(keys, fn) {
    const ks = [...new Set(keys)].sort();
    const prev = Promise.all(ks.map((k) => scopeChains.get(k) || Promise.resolve()));
    const run = prev.then(() => fn());
    const tail = run.then(() => {}, () => {});
    for (const k of ks) scopeChains.set(k, tail);
    tail.then(() => {
      for (const k of ks) if (scopeChains.get(k) === tail) scopeChains.delete(k);
    });
    return run;
  }

  function policy() {
    if (!policyCache) policyCache = PG.policy.fromBundled();
    return policyCache;
  }

  // Tipi che l'utente ha scelto di NON mascherare (impostazione keepTypes, solo Personal edition).
  // Doppio controllo: solo i tipi a basso rischio ammessi da config.js (ripiego: elenco fisso uguale).
  const KEEPABLE_FALLBACK = ['DATE', 'TIME', 'AMOUNT', 'AGE', 'GENDER', 'ORG'];
  function keepSet(cfg) {
    const allowed = (PG.config && PG.config.KEEPABLE_TYPES) || KEEPABLE_FALLBACK;
    const want = cfg && Array.isArray(cfg.keepTypes) ? cfg.keepTypes : [];
    return new Set(want.map((t) => String(t).toUpperCase()).filter((t) => allowed.includes(t)));
  }

  /**
   * Toglie le rilevazioni dei tipi da non mascherare. Va applicato PRIMA di clean(): se un'entità
   * mantenuta (es. ORG «Studio Mario Rossi») si sovrappone a una da mascherare (FULLNAME «Mario Rossi»),
   * quest'ultima deve sopravvivere. `stats.kept` conta le rilevazioni lasciate in chiaro (mai i valori).
   */
  function dropKept(cfg, dets, stats) {
    const keep = keepSet(cfg);
    if (!keep.size || !Array.isArray(dets)) return dets;
    const out = dets.filter((d) => !keep.has(String(d.label).toUpperCase()));
    if (stats) stats.kept = (stats.kept || 0) + (dets.length - out.length);
    return out;
  }

  function rizzo(cfg) {
    const keep = [...keepSet(cfg)];
    return new PG.rizzo.RizzoClient(cfg.rizzoUrl, keep.length ? { excludeTags: keep } : undefined);
  }

  async function localKeys() {
    if (keysP) return keysP;
    keysP = (async () => {
      let rec = await PG.idb.get('meta', 'localKeys');
      if (!rec) {
        rec = {
          id: 'localKeys',
          aes: await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']),
          hmac: await crypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256' }, false, ['sign']),
          createdAt: Date.now(),
        };
        await PG.idb.put('meta', rec);
      }
      return rec;
    })();
    try {
      return await keysP;
    } catch (e) {
      keysP = null;
      throw e;
    }
  }

  async function hmac(value) {
    const k = await localKeys();
    return b64(await crypto.subtle.sign('HMAC', k.hmac, te.encode(value)));
  }

  async function enc(aadStr, value) {
    const k = await localKeys();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: te.encode(aadStr) }, k.aes, te.encode(value));
    return { iv: b64(iv), ct: b64(ct) };
  }

  async function dec(aadStr, rec) {
    const k = await localKeys();
    return td.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(rec.iv), additionalData: te.encode(aadStr) }, k.aes, unb64(rec.ct)));
  }

  // --- Dizionario ------------------------------------------------------------------------------
  async function loadScope(scope, create) {
    const key = scopeKey(scope);
    let rec = await PG.idb.get('pdict', key);
    if (!rec && create) rec = { scopeKey: key, type: scope.type, id: scope.id, createdAt: Date.now(), lastUsed: Date.now(), entries: {}, index: {} };
    return rec || null;
  }

  /** dets [{label, value}] → Map(valoreNormalizzato → {tag, type}). */
  function assign(scope, dets) {
    return withScopes([scopeKey(scope)], () => assignLocked(scope, dets));
  }

  async function assignLocked(scope, dets) {
    const rec = await loadScope(scope, true);
    const out = new Map();
    const counters = {};
    for (const tag of Object.keys(rec.entries)) {
      const m = TAG_RX.exec(tag);
      if (m) counters[m[1]] = Math.max(counters[m[1]] || 0, Number(m[2]));
    }
    for (const d of dets) {
      const n = PG.policy.normalize(d.value);
      if (!n || out.has(n)) continue;
      const h = await hmac(`${scopeKey(scope)}|${n}`);
      let tag = rec.index[h];
      if (!tag) {
        const type = String(d.label).toUpperCase();
        counters[type] = (counters[type] || 0) + 1;
        tag = `[${type}_${counters[type]}]`;
        rec.index[h] = tag;
        rec.entries[tag] = Object.assign({ type }, await enc(`${scope.type}|${scope.id}|${tag}`, d.value.trim()));
      }
      out.set(n, { tag, type: rec.entries[tag].type });
    }
    rec.lastUsed = Date.now();
    await PG.idb.put('pdict', rec);
    return out;
  }

  async function replacementsFor(scope, dets) {
    if (!dets.length) return [];
    const map = await assign(scope, dets);
    return dets.map((d) => {
      const a = map.get(PG.policy.normalize(d.value));
      return { start: d.start, end: d.end, tag: a.tag, type: a.type, value: d.value };
    });
  }

  /** Rilevamento con Rizzo-PII: tipi mantenuti tolti (keepTypes), allowlist, sovrapposizioni. */
  async function detect(cfg, text, stats) {
    const raw = dropKept(cfg, await rizzo(cfg).analyzeText(text), stats);
    return PG.rizzo.clean(policy().allowlist.filter(text, raw));
  }

  /**
   * Categorie particolari (artt. 9-10 GDPR). Senza conferma: lancia Blocked (special = {label}).
   * Con `ov.allow` (msg.allowSpecial, inviato dallo script di contenuto dopo la conferma
   * esplicita dell'utente) non blocca e annota la categoria in `ov.category` per il registro.
   */
  function checkSpecial(text, ov) {
    const hit = policy().special.firstBlock(text);
    if (!hit) return;
    if (ov && ov.allow) {
      if (!ov.category) ov.category = hit.category;
      return;
    }
    throw new Blocked(policy().special.reason(hit, PG.strings && PG.strings.bloccoSpecialePersonal), hit.category, { label: hit.label });
  }

  /** Oggetto di controllo per checkSpecial a partire dalla richiesta. */
  const overrideFor = (msg) => ({ allow: msg.allowSpecial === true, category: null });

  /** Annota nel registro l'invio confermato di una categoria particolare (solo la categoria). */
  function withOverride(entry, ov) {
    if (ov && ov.category) entry.specialOverride = { category: ov.category };
    return entry;
  }

  /** Campi della risposta per un blocco: canOverride solo per le categorie particolari. */
  function blockFields(reason, category, special) {
    const f = { blocked: true, blockReason: reason, blockCategory: category, canOverride: Boolean(special) };
    if (special) f.blockLabel = special.label;
    return f;
  }

  function failure(e) {
    if (e && (e.code === 'detector_down' || e.code === 'cors')) return { ok: false, error: e.code, message: e.message };
    if (e && e.code === 'detector_rejected') return { ok: false, error: 'http', status: 400, message: e.message };
    return { ok: false, error: 'internal', message: String(e && e.message) };
  }

  const uniqueEntities = (reps) => {
    const seen = new Set();
    return reps.filter((r) => !seen.has(r.tag) && seen.add(r.tag)).map((r) => ({ tag: r.tag, type: r.type }));
  };

  const PDF_MAX_OCR_PAGES = 30;
  const PDF_POLICIES = ['ocr', 'remove', 'keep'];
  /** Testo da PG.strings (funzione o stringa) con ripiego se manca. */
  const str = (name, args, fallback) => {
    const v = PG.strings && PG.strings[name];
    if (typeof v === 'function') return v(...args);
    return v || fallback;
  };
  const pdfSenzaTesto = (name) =>
    (typeof PG.strings.pdfSenzaTesto === 'function' ? PG.strings.pdfSenzaTesto(name) : PG.strings.pdfSenzaTesto) ||
    'Il PDF non contiene testo leggibile (forse è una scansione che non è stato possibile leggere): non è stato inviato.';

  async function sha256(text) {
    return b64(await crypto.subtle.digest('SHA-256', te.encode(text)));
  }

  /** Annota nel registro quante rilevazioni sono state lasciate in chiaro (keepTypes): solo il numero. */
  function withKept(entry, stats) {
    if (stats && stats.kept) entry.kept = stats.kept;
    return entry;
  }

  function counts(reps) {
    const c = {};
    for (const r of reps) c[r.type] = (c[r.type] || 0) + 1;
    return c;
  }

  // --- Registro locale cifrato -----------------------------------------------------------------
  async function log(entry) {
    try {
      const ts = Date.now();
      const body = await enc(`log|${ts}`, JSON.stringify(entry));
      await PG.idb.add('plog', { ts, iv: body.iv, ct: body.ct });
    } catch (e) {
      console.warn('[Pseudomania] registro locale non scritto:', e && e.message);
    }
  }

  async function readLog() {
    const out = [];
    for (const r of await PG.idb.all('plog')) {
      try {
        out.push(Object.assign({ ts: new Date(r.ts).toISOString() }, JSON.parse(await dec(`log|${r.ts}`, r))));
      } catch (_) { /* voce illeggibile */ }
    }
    return out;
  }

  // --- Operazioni (stessa forma delle risposte del server) -------------------------------------
  async function pseudonymize(cfg, msg) {
    const traceId = crypto.randomUUID();
    const scope = msg.scope;
    const ov = overrideFor(msg);
    const hit = policy().special.firstBlock(msg.text);
    if (hit && !ov.allow) {
      await log({ action: 'pseudonymize', kind: msg.kind, scopeType: scope.type, blocked: true, category: hit.category, traceId });
      return { ok: true, data: Object.assign({ text: '', entities: [], newEntries: [], traceId }, blockFields(policy().special.reason(hit, PG.strings && PG.strings.bloccoSpecialePersonal), hit.category, { label: hit.label })) };
    }
    if (hit) ov.category = hit.category;
    try {
      const stats = { kept: 0 };
      const dets = await detect(cfg, msg.text, stats);
      const reps = await replacementsFor(scope, dets);
      const text = PG.rizzo.applyReplacements(msg.text, reps);
      await log(withOverride(withKept({ action: 'pseudonymize', kind: msg.kind, scopeType: scope.type, counts: counts(reps), sha256: await sha256(text), traceId }, stats), ov));
      return {
        ok: true,
        data: { text, entities: reps.map((r) => ({ tag: r.tag, type: r.type, start: r.start, end: r.end })), newEntries: [], blocked: false, blockReason: null, traceId },
      };
    } catch (e) {
      return failure(e);
    }
  }

  async function pseudonymizeName(cfg, scope, filename, stats) {
    const m = filename.match(/^(.*?)(\.[^.]*)?$/);
    const stem = m[1];
    const ext = m[2] || '';
    const readable = stem.replace(/_/g, ' ');
    if (!readable.trim()) return { name: filename, reps: [] };
    const dets = await detect(cfg, readable, stats);
    if (!dets.length) return { name: filename, reps: [] };
    const reps = await replacementsFor(scope, dets.map((d) => Object.assign({}, d, { value: stem.slice(d.start, d.end).replace(/_/g, ' ') })));
    return { name: PG.rizzo.applyReplacements(stem, reps) + ext, reps };
  }

  /**
   * Divide gli span rilevati sul testo complessivo del PDF (pagesToDoc) fra testo di pagina e OCR.
   * - mapping {chiave: valore}: per ogni pezzo di span che cade nel testo di una pagina, il valore è la
   *   stringa ESATTA del testo estratto (quella che pdf:redact cercherà nella pagina). Uno span a
   *   cavallo fra pagine o fra testo e OCR produce più pezzi; se lo stesso tag ha più valori distinti,
   *   i successivi usano come chiave il tag seguito da uno o più spazi (segnaposto identico a vista,
   *   le chiavi di un oggetto devono essere uniche). `keyTag` riporta ogni chiave al suo tag.
   * - ocrBoxes: riquadri (in punti, con `page`) delle sole parole OCR toccate dagli span; etichetta = tag
   *   sul primo riquadro dello span, vuota se lo span ha già un pezzo nel testo di pagina prima dell'OCR.
   */
  function pdfTargets(doc, reps, pages) {
    const mapping = {};
    const keyTag = {};
    const seen = {}; // tag -> Set(valori normalizzati)
    const sizes = {};
    for (const p of pages || []) if (p && typeof p.index === 'number') sizes[p.index] = { width: p.width, height: p.height };
    const ocrBoxes = [];
    for (const r of reps) {
      let textBefore = false;
      let firstOcrStart = Infinity;
      for (const w of doc.ocrWords) if (w.start < r.end && w.end > r.start) firstOcrStart = Math.min(firstOcrStart, w.start);
      for (const g of doc.regions) {
        if (g.kind !== 'text') continue;
        const a = Math.max(r.start, g.start);
        const b = Math.min(r.end, g.end);
        if (b <= a) continue;
        let v = doc.text.slice(a, b);
        const lead = v.length - v.replace(/^\s+/, '').length;
        v = v.trim();
        if (!v) continue;
        if (a + lead < firstOcrStart) textBefore = true;
        const n = PG.policy.normalize(v);
        const set = (seen[r.tag] = seen[r.tag] || new Set());
        if (set.has(n)) continue;
        let key = r.tag;
        while (Object.prototype.hasOwnProperty.call(mapping, key)) key += ' ';
        set.add(n);
        mapping[key] = v;
        keyTag[key] = r.tag;
      }
      const boxes = PG.ocrMap.boxesForPages(doc.ocrWords, [{ start: r.start, end: r.end, tag: r.tag }], { pad: 2, sizes });
      if (textBefore && boxes.length) boxes[0].label = '';
      ocrBoxes.push(...boxes);
    }
    return { mapping, keyTag, ocrBoxes };
  }

  /**
   * Ramo PDF di pseudonymizeFile (Personal). Restituisce {b64, reps, notice, log}, oppure null se
   * il PDF va trattato con il ripiego in .txt. Lancia Blocked per i casi da bloccare.
   */
  async function pseudonymizePdf(cfg, scope, msg, stats, ov) {
    const imagePolicy = PDF_POLICIES.includes(cfg.pdfImagePolicy) ? cfg.pdfImagePolicy : 'ocr';
    const protetto = () => new Blocked(str('pdfProtetto', [], 'il PDF è protetto da password: togli la protezione e allegalo di nuovo.'), 'encrypted');
    let prep;
    try {
      prep = await PG.ocrClient.pdfPrepare(msg.b64, { imagePolicy, maxOcrPages: PDF_MAX_OCR_PAGES });
    } catch (e) {
      if (e && e.code === 'encrypted') throw protetto();
      console.warn('[Pseudomania] PDF non preparato, ripiego in .txt:', e && e.code);
      return null;
    }
    const pages = Array.isArray(prep && prep.pages) ? prep.pages : [];
    const doc = PG.ocrMap.pagesToDoc(pages);
    if (!doc.text.trim()) throw new Blocked(pdfSenzaTesto(msg.name), 'unreadable');
    checkSpecial(doc.text, ov);
    const reps = await replacementsFor(scope, await detect(cfg, doc.text, stats));
    const { mapping, keyTag, ocrBoxes } = pdfTargets(doc, reps, pages);
    let red;
    try {
      red = await PG.ocrClient.pdfRedact(msg.b64, mapping, ocrBoxes, imagePolicy);
    } catch (e) {
      if (e && e.code === 'encrypted') throw protetto();
      console.warn('[Pseudomania] redazione del PDF non riuscita, ripiego in .txt:', e && e.code);
      return null;
    }
    const report = (red && red.report) || {};
    const tagsOf = (keys) => [...new Set((Array.isArray(keys) ? keys : []).map((k) => keyTag[k] || String(k).trim()))];
    const residual = tagsOf(report.residual);
    if (residual.length) {
      throw new Blocked(str('pdfResidui', [residual.length], `nel PDF restavano leggibili ${residual.length} dati personali: non è stato inviato.`), 'pdf_residual');
    }
    if (!red || typeof red.b64 !== 'string' || !red.b64) return null;
    const skipped = tagsOf(report.skipped).length;
    const images = pages.reduce((n, p) => n + (p && Array.isArray(p.images) ? p.images.length : 0), 0);
    const imagesRemoved = Number(report.imagesRemoved) || 0;
    const ocrPages = pages.filter((p) => p && Array.isArray(p.ocr)).length;
    const truncated = Boolean(prep.truncated);
    const parts = [];
    const signatures = Number(report.signatures) || 0;
    if (signatures) parts.push(str('pdfFirmaRimossa', [], 'Il PDF era firmato digitalmente: la firma, con il certificato del firmatario, è stata tolta. Il PDF inviato a Claude non è firmato.'));
    if (skipped) parts.push(str('pdfValoriNonCoperti', [skipped], `Attenzione: ${skipped} dati molto brevi non sono stati coperti nel PDF e restano leggibili.`));
    if (imagePolicy === 'keep' && images) parts.push(str('pdfImmaginiLasciate', [images], `Il PDF contiene ${images} immagini lasciate senza controlli.`));
    if (imagePolicy === 'remove' && imagesRemoved) parts.push(str('pdfImmaginiTolte', [imagesRemoved], `${imagesRemoved} immagini sono state tolte dal PDF.`));
    if (ocrPages) parts.push(str('pdfImmaginiOcr', [ocrPages, truncated], `Le immagini di ${ocrPages} pagine sono state lette con OCR: la lettura può contenere errori.`));
    else if (truncated) parts.push(str('pdfImmaginiOcr', [0, true], 'Sono state lette con OCR solo le immagini delle prime pagine.'));
    return {
      b64: red.b64,
      reps,
      notice: parts.length ? parts.join(' ') : null,
      log: { pages: Number(prep.pageCount) || pages.length, imagePolicy, images, imagesRemoved, ocrPages, skipped, signatures },
    };
  }

  async function pseudonymizeFile(cfg, msg) {
    const traceId = crypto.randomUUID();
    const scope = msg.scope;
    const bytes = unb64(msg.b64);
    const ov = overrideFor(msg);
    const blocked = async (reason, category, special) => {
      await log({ action: 'pseudonymize_file', kind: msg.kind, scopeType: scope.type, blocked: true, category, traceId });
      return { ok: true, data: Object.assign({ filename: msg.name, mime: '', contentB64: '', entities: [], newEntries: [], traceId }, blockFields(reason, category, special)) };
    };
    const fk = await PG.textfile.detectKind(msg.name, bytes);
    if (!fk.kind) return blocked(fk.reason, 'unsupported_format');
    const stats = { kept: 0 };
    const all = [];
    let out;
    let mime = PG.textfile.MIME[fk.kind];
    let outName = msg.name;
    let notice = null;
    let outB64 = null;
    let pdfLog = null;
    try {
      if (fk.kind === 'txt' || fk.kind === 'md' || fk.kind === 'csv') {
        const dt = PG.textfile.decodeText(bytes);
        checkSpecial(dt.text, ov);
        const reps = await replacementsFor(scope, await detect(cfg, dt.text, stats));
        all.push(...reps);
        out = PG.textfile.encodeText(dt, PG.rizzo.applyReplacements(dt.text, reps));
      } else if (fk.kind === 'docx' || fk.kind === 'xlsx') {
        out = await PG.ooxml.transformOffice(bytes, fk.kind, async (texts) => {
          checkSpecial(texts.join('\n'), ov);
          const per = await PG.rizzo.detectUnits(texts, (big) => detect(cfg, big, stats), policy().allowlist);
          const flat = per.flat();
          const reps = await replacementsFor(scope, flat);
          all.push(...reps);
          let i = 0;
          return per.map((dets) => dets.map(() => {
            const r = reps[i++];
            return { start: r.start, end: r.end, text: r.tag };
          }));
        });
      } else {
        // PDF (PDF-CONTRATTO.md, sezione B): resta un PDF, trattato con MuPDF.js nel documento offscreen.
        // Se la preparazione o la redazione non riescono si ripiega sul .txt pseudonimizzato via Rizzo-PII.
        let res = null;
        if (PG.ocrClient && PG.ocrClient.pdfPrepare && PG.ocrMap && PG.ocrMap.pagesToDoc) {
          res = await pseudonymizePdf(cfg, scope, msg, stats, ov);
        }
        if (res) {
          all.push(...res.reps);
          outB64 = res.b64;
          mime = 'application/pdf';
          notice = res.notice;
          pdfLog = res.log;
        } else {
          const res2 = await rizzo(cfg).analyzeFile(msg.name, bytes, 'application/pdf');
          const text = res2.text || '';
          // Niente file vuoti: un PDF senza testo leggibile (scansione non letta) viene bloccato.
          if (!text.trim()) throw new Blocked(pdfSenzaTesto(msg.name), 'unreadable');
          checkSpecial(text, ov);
          const reps = await replacementsFor(scope, PG.rizzo.clean(policy().allowlist.filter(text, dropKept(cfg, res2.detections, stats))));
          all.push(...reps);
          out = te.encode(PG.rizzo.applyReplacements(text, reps));
          mime = 'text/plain';
          outName = msg.name.replace(/\.pdf$/i, '') + '.txt';
          notice = str('pdfRipiegoTesto', [msg.name], null) || str('pdfConvertito', [msg.name], null);
          pdfLog = { fallback: 'txt' };
        }
      }
    } catch (e) {
      if (e instanceof Blocked) return blocked(e.message, e.category, e.special);
      if (e instanceof PG.zip.ZipError) return blocked('File Office non valido o danneggiato: ' + e.message, 'invalid_file');
      if (e && e.code === 'detector_rejected') return blocked('Il file non può essere analizzato: ' + e.message, 'unreadable');
      return failure(e);
    }
    let nameRes;
    try {
      nameRes = await pseudonymizeName(cfg, scope, outName, stats);
    } catch (e) {
      return failure(e);
    }
    all.push(...nameRes.reps);
    const entry = withOverride(withKept({ action: 'pseudonymize_file', kind: msg.kind, format: fk.kind, scopeType: scope.type, counts: counts(all), traceId }, stats), ov);
    if (pdfLog) entry.pdf = pdfLog;
    await log(entry);
    return {
      ok: true,
      data: { filename: nameRes.name, mime, contentB64: outB64 != null ? outB64 : b64(out), entities: uniqueEntities(all), newEntries: [], blocked: false, blockReason: null, traceId, notice },
    };
  }

  // --- Immagini: OCR locale + riquadri neri (Personal edition) ------------------------------------
  const pad2 = (n) => String(n).padStart(2, '0');
  function genericImageName(ext, d) {
    d = d || new Date();
    return `immagine-${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}${ext}`;
  }

  /**
   * Legge il testo dell'immagine con OCR locale, rileva i dati personali e li copre con riquadri
   * neri che riportano il segnaposto. Stessa forma di risposta di pseudonymizeFile, più `ocr`.
   * Il nome del file in uscita è generico (immagine-AAAAMMGGhhmmss.ext) e non viene analizzato.
   */
  async function pseudonymizeImage(cfg, msg) {
    const traceId = crypto.randomUUID();
    const scope = msg.scope;
    const ov = overrideFor(msg);
    const blocked = async (reason, category, special) => {
      await log({ action: 'pseudonymize_image', kind: msg.kind, scopeType: scope.type, blocked: true, category, traceId });
      return { ok: true, data: Object.assign({ filename: msg.name, mime: '', contentB64: '', entities: [], newEntries: [], traceId, ocr: null }, blockFields(reason, category, special)) };
    };
    let img;
    try {
      img = await PG.ocrClient.image(msg.b64, msg.mime);
    } catch (e) {
      if (e && e.code === 'decode') {
        return blocked(PG.strings.immagineNonLeggibile || 'L\'immagine non può essere letta (formato non supportato o file danneggiato): non è stata inviata.', 'unsupported_format');
      }
      return { ok: false, error: 'ocr', code: (e && e.code) || 'ocr', message: String(e && e.message) };
    }
    const { text, words } = PG.ocrMap.buildText(img.lines || []);
    const stats = { kept: 0 };
    const q = PG.ocrMap.quality(words);
    let reps;
    try {
      checkSpecial(text, ov);
      reps = text.trim() ? await replacementsFor(scope, await detect(cfg, text, stats)) : [];
    } catch (e) {
      if (e instanceof Blocked) return blocked(e.message, e.category, e.special);
      return failure(e);
    }
    const boxes = PG.ocrMap.boxesForSpans(words, reps.map((r) => ({ start: r.start, end: r.end, tag: r.tag })), { width: img.width, height: img.height });
    const jpeg = /^image\/(jpeg|jpg|pjpeg)$/i.test(String(msg.mime || ''));
    const outMime = jpeg ? 'image/jpeg' : 'image/png';
    let red;
    try {
      // Sempre ri-codificata, anche senza riquadri: i metadati (EXIF, GPS…) vengono rimossi.
      red = await PG.ocrClient.redact(msg.b64, msg.mime, boxes, outMime);
    } catch (e) {
      if (e && e.code === 'decode') {
        return blocked(PG.strings.immagineNonLeggibile || 'L\'immagine non può essere letta (formato non supportato o file danneggiato): non è stata inviata.', 'unsupported_format');
      }
      return { ok: false, error: 'ocr', code: (e && e.code) || 'ocr', message: String(e && e.message) };
    }
    const mime = (red && red.mime) || outMime;
    const filename = genericImageName(mime === 'image/jpeg' ? '.jpg' : '.png');
    await log(withOverride(withKept({ action: 'pseudonymize_image', kind: msg.kind, scopeType: scope.type, counts: counts(reps), ocr: { wordCount: q.wordCount, meanConf: q.meanConf }, traceId }, stats), ov));
    return {
      ok: true,
      data: {
        filename, mime, contentB64: red.b64, entities: uniqueEntities(reps), newEntries: [], blocked: false, blockReason: null, blockCategory: null, traceId,
        ocr: { wordCount: q.wordCount, meanConf: q.meanConf, lowConf: q.lowConf, noText: q.noText, covered: reps.length },
      },
    };
  }

  function dictionary(scope) {
    return withScopes([scopeKey(scope)], () => dictionaryLocked(scope));
  }

  async function dictionaryLocked(scope) {
    const rec = await loadScope(scope, false);
    const entries = {};
    const unrecoverable = [];
    if (rec) {
      for (const [tag, e] of Object.entries(rec.entries)) {
        try {
          entries[tag] = await dec(`${e.aad || `${rec.type}|${rec.id}`}|${tag}`, e);
        } catch (_) {
          unrecoverable.push(tag);
        }
      }
      rec.lastUsed = Date.now();
      await PG.idb.put('pdict', rec);
    }
    const expiresAt = rec && rec.type === 'conversation' ? new Date((rec ? rec.lastUsed : Date.now()) + 30 * DAY).toISOString() : null;
    return { ok: true, data: { entries, unrecoverable, expiresAt, confirmBy: null } };
  }

  function findTagEdits(text, entries) {
    const edits = [];
    const unknown = [];
    const rx = /\\?\[([A-Z][A-Z]*(?:\\?_[A-Z]+)*)\\?_(\d{1,6})\\?\]/g;
    let m;
    while ((m = rx.exec(text)) !== null) {
      const tag = m[0].replace(/\\/g, '');
      if (Object.prototype.hasOwnProperty.call(entries, tag)) edits.push({ start: m.index, end: m.index + m[0].length, text: entries[tag] });
      else if (!unknown.includes(tag)) unknown.push(tag);
    }
    return { edits, unknown };
  }

  async function reidentifyFile(cfg, msg) {
    const bytes = unb64(msg.b64);
    const entries = (await dictionary(msg.scope)).data.entries;
    const fk = await PG.textfile.detectKind(msg.name, bytes);
    const unknownTags = new Set();
    let out;
    if (fk.kind === 'txt' || fk.kind === 'md' || fk.kind === 'csv') {
      const dt = PG.textfile.decodeText(bytes);
      const { edits, unknown } = findTagEdits(dt.text, entries);
      unknown.forEach((t) => unknownTags.add(t));
      out = PG.textfile.encodeText(dt, PG.rizzo.applyReplacements(dt.text, edits.map((e) => ({ start: e.start, end: e.end, tag: e.text }))));
    } else if (fk.kind === 'docx' || fk.kind === 'xlsx') {
      out = await PG.ooxml.transformOffice(bytes, fk.kind, async (texts) =>
        texts.map((t) => {
          const r = findTagEdits(t, entries);
          r.unknown.forEach((x) => unknownTags.add(x));
          return r.edits;
        }));
    } else if (fk.kind === 'pdf') {
      // PDF: ripristino locale con MuPDF.js (impaginazione conservata); se non riesce, /restore/pdf di
      // Rizzo-PII; se manca anche quello, Rizzo-PII ne estrae il testo e si genera un PDF di solo testo.
      if (PG.ocrClient && PG.ocrClient.pdfRestore) {
        try {
          const r = await PG.ocrClient.pdfRestore(msg.b64, entries);
          if (r && typeof r.b64 === 'string' && r.b64) {
            const unknown = (r.report && Array.isArray(r.report.unknown)) ? r.report.unknown : [];
            return { ok: true, data: { filename: msg.name, mime: 'application/pdf', contentB64: r.b64, entities: [], unknownTags: [...new Set(unknown)], traceId: null } };
          }
        } catch (e) {
          console.warn('[Pseudomania] ripristino locale del PDF non riuscito, si prova Rizzo-PII:', e && e.code);
        }
      }
      try {
        const same = await rizzo(cfg).restorePdf(msg.name, bytes, entries);
        if (same) {
          return { ok: true, data: { filename: msg.name, mime: 'application/pdf', contentB64: b64(same), entities: [], unknownTags: [], traceId: null } };
        }
      } catch (e) {
        return failure(e);
      }
      let text;
      try {
        text = (await rizzo(cfg).analyzeFile(msg.name, bytes, 'application/pdf')).text || '';
      } catch (e) {
        return failure(e);
      }
      const { edits, unknown } = findTagEdits(text, entries);
      unknown.forEach((t) => unknownTags.add(t));
      const restored = PG.rizzo.applyReplacements(text, edits.map((e) => ({ start: e.start, end: e.end, tag: e.text })));
      out = PG.pdfwrite.textToPdf(restored);
      return { ok: true, data: { filename: msg.name, mime: 'application/pdf', contentB64: b64(out), entities: [], unknownTags: [...unknownTags], traceId: null, notice: PG.strings.pdfRipristinatoTesto } };
    } else {
      return { ok: false, error: 'http', status: 415, message: 'Ripristino non disponibile per questo formato nella Personal edition.' };
    }
    return { ok: true, data: { filename: msg.name, mime: msg.mime, contentB64: b64(out), entities: [], unknownTags: [...unknownTags], traceId: null } };
  }

  function rebind(msg) {
    return withScopes([scopeKey(msg.from), scopeKey(msg.to)], () => rebindLocked(msg));
  }

  async function rebindLocked(msg) {
    const from = await loadScope(msg.from, false);
    if (!from) return { ok: true, status: 204, data: null };
    const to = await loadScope(msg.to, true);
    // Conflitto: stesso tag con valore diverso, o stesso valore con tag diverso.
    for (const [h, tag] of Object.entries(from.index)) {
      if (to.index[h] && to.index[h] !== tag) return { ok: false, error: 'conflict', status: 409 };
    }
    const toByTag = new Set(Object.values(to.index));
    for (const [h, tag] of Object.entries(from.index)) {
      if (toByTag.has(tag) && to.index[h] !== tag) return { ok: false, error: 'conflict', status: 409 };
    }
    // L'indice HMAC dipende dallo scope: si ricalcola sui valori decifrati.
    for (const [tag, e] of Object.entries(from.entries)) {
      const aadStr = `${e.aad || `${from.type}|${from.id}`}`;
      const value = await dec(`${aadStr}|${tag}`, e);
      to.index[await hmac(`${scopeKey(msg.to)}|${PG.policy.normalize(value)}`)] = tag;
      to.entries[tag] = Object.assign({}, e, { aad: aadStr });
    }
    to.lastUsed = Date.now();
    await PG.idb.put('pdict', to);
    await PG.idb.del('pdict', from.scopeKey);
    return { ok: true, status: 204, data: null };
  }

  async function deleteScope(msg) {
    const key = scopeKey(msg.scope);
    await withScopes([key], () => PG.idb.del('pdict', key));
    await log({ action: 'scope_delete', scopeType: msg.scope.type });
    return { ok: true };
  }

  async function event(body) {
    const d = Object.assign({}, body.details || {});
    // Nessun testo nel registro: per le risposte si conserva solo l'hash.
    if (typeof d.textPseudonymized === 'string') {
      d.textSha256 = await sha256(d.textPseudonymized);
      delete d.textPseudonymized;
    }
    await log({ event: body.event, scopeType: body.scope ? body.scope.type : null, traceId: body.traceId || null, details: d });
    return { ok: true, status: 204 };
  }

  async function cleanup() {
    const now = Date.now();
    const stale = (rec) => {
      const pending = String(rec.id).startsWith('pending:');
      return (pending && now - rec.lastUsed > DAY) || (!pending && rec.type === 'conversation' && now - rec.lastUsed > 30 * DAY);
    };
    for (const rec of await PG.idb.all('pdict')) {
      if (!stale(rec)) continue;
      // Si ricontrolla dentro la coda: un assign appena concluso può aver aggiornato lastUsed.
      await withScopes([rec.scopeKey], async () => {
        const cur = await PG.idb.get('pdict', rec.scopeKey);
        if (cur && stale(cur)) await PG.idb.del('pdict', rec.scopeKey);
      });
    }
    for (const r of await PG.idb.all('plog')) if (now - r.ts > 90 * DAY) await PG.idb.del('plog', r.id);
  }

  async function health(cfg) {
    const state = await rizzo(cfg).health();
    return { ok: state === 'ok', detector: state, keys: 'local', version: null, checked: Date.now() };
  }

  PG.local = { withScopes, pseudonymize, pseudonymizeFile, pseudonymizeImage, dictionary, reidentifyFile, rebind, deleteScope, event, cleanup, health, readLog, Blocked };
})(typeof globalThis !== 'undefined' ? globalThis : this);
