#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 gli autori di Pseudomania
//
// Verifica dei selettori e degli endpoint interni di src/sites/claude.js sul sito REALE claude.ai.
// Da eseguire a mano da un amministratore, con un profilo Chrome in cui ha già fatto l'accesso a
// claude.ai (con un account di prova). Vedi README.md nella stessa cartella.
//
// Per impostazione predefinita NON invia alcun messaggio: osserva la pagina e le richieste che
// l'amministratore stesso genera nei passaggi guidati. Con --invia scrive e invia UN messaggio di prova
// innocuo per osservare l'endpoint di completamento, lo streaming e i pulsanti della risposta.
//
// Il rapporto contiene solo nomi di attributi/selettori, percorsi (con gli UUID sostituiti) e NOMI dei
// campi JSON: mai il contenuto dei messaggi.

'use strict';
const path = require('path');
const fs = require('fs');
const readline = require('readline');

const ROOT = path.join(__dirname, '..', '..');
const ADAPTER_FILE = path.join(ROOT, 'src', 'sites', 'claude.js');
const adapter = require(ADAPTER_FILE);
const ADAPTER_SRC = fs.readFileSync(ADAPTER_FILE, 'utf8');

const MESSAGGIO_PROVA = 'Messaggio di prova di Pseudomania: rispondi soltanto con la parola OK.';
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

// --- argomenti ---------------------------------------------------------------------------------
function parseArgs(argv) {
  const a = { profilo: null, chat: null, progetto: null, invia: false, interattivo: true, json: null, chrome: false, simula: false };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    const next = () => argv[++i];
    if (k === '--profilo') a.profilo = next();
    else if (k === '--chat') a.chat = next();
    else if (k === '--progetto') a.progetto = next();
    else if (k === '--invia') a.invia = true;
    else if (k === '--non-interattivo') a.interattivo = false;
    else if (k === '--json') a.json = next();
    else if (k === '--chrome') a.chrome = true;
    else if (k === '--simula') a.simula = true;
    else if (k === '--help' || k === '-h') a.help = true;
    else {
      console.error(`Argomento sconosciuto: ${k}`);
      a.help = true;
    }
  }
  return a;
}

const AIUTO = `
Uso: node dev/verifica-sito-reale/verifica.js --profilo <cartella-profilo> [opzioni]

  --profilo <dir>     profilo Chrome persistente con accesso a claude.ai già effettuato (obbligatorio)
  --chat <url>        URL di una conversazione ESISTENTE di prova (https://claude.ai/chat/<uuid>)
  --progetto <url>    URL di un progetto di prova (https://claude.ai/project/<uuid>)
  --invia             invia UN messaggio di prova innocuo (senza: nessun invio)
  --non-interattivo   salta i passaggi guidati che richiedono azioni manuali
  --json <file>       salva il rapporto anche in formato JSON
  --chrome            usa Google Chrome installato invece di Chromium di Playwright
  --simula            prova dello script senza claude.ai: serve la pagina finta dev/fixture (solo manutenzione)
`;

// --- rapporto ----------------------------------------------------------------------------------
const report = { data: new Date().toISOString(), adapter: 'src/sites/claude.js', voci: [], rete: [], richiesteNonCoperte: [] };

function voce(pagina, chiave, esito, dettagli, suggerimenti) {
  report.voci.push({ pagina, chiave, esito, dettagli: dettagli || '', suggerimenti: suggerimenti || [] });
  const sigla = { trovato: 'TROVATO    ', mancante: 'NON TROVATO', parziale: 'PARZIALE   ', saltato: 'SALTATO    ', info: 'INFO       ' }[esito] || esito;
  console.log(`  [${sigla}] ${chiave}${dettagli ? ' – ' + dettagli : ''}`);
  for (const s of suggerimenti || []) console.log(`                suggerimento: ${s}`);
}

function ask(rl, domanda) {
  return new Promise((r) => rl.question(`\n>>> ${domanda}\n    (premi Invio per continuare, "s" per saltare) `, (x) => r(x.trim().toLowerCase() !== 's')));
}

// --- funzioni eseguite nella pagina -------------------------------------------------------------
async function inject(page) {
  // Runtime.evaluate non è soggetto alla CSP della pagina.
  await page.evaluate(`${ADAPTER_SRC}; void 0;`);
  await page.evaluate(() => {
    window.__pgDescribe = (el) => {
      if (!el) return null;
      const attrs = [];
      for (const n of ['data-testid', 'aria-label', 'role', 'type', 'contenteditable', 'name', 'data-is-streaming']) {
        if (el.hasAttribute(n)) attrs.push(`[${n}="${String(el.getAttribute(n)).slice(0, 60)}"]`);
      }
      const cls = typeof el.className === 'string' ? el.className.split(/\s+/).filter(Boolean).slice(0, 3).map((c) => '.' + c).join('') : '';
      return el.tagName.toLowerCase() + attrs.join('') + (attrs.length ? '' : cls);
    };
  });
}

async function checkList(page, pagina, chiave, list, opts) {
  opts = opts || {};
  const res = await page.evaluate(({ list }) => {
    return list.map((sel) => {
      try {
        const els = Array.from(document.querySelectorAll(sel)).filter((e) => !e.closest('pg-ui, [data-pg-ui]'));
        return { sel, n: els.length, esempio: els[0] ? window.__pgDescribe(els[0]) : null };
      } catch (e) {
        return { sel, n: -1, errore: String(e.message) };
      }
    });
  }, { list });
  const primo = res.find((r) => r.n > 0);
  const dett = res.map((r) => `${r.sel} → ${r.n < 0 ? 'selettore non valido' : r.n}`).join(' | ');
  if (primo) {
    const esito = res[0].n > 0 ? 'trovato' : 'parziale';
    voce(pagina, chiave, esito, `usato: ${primo.sel} (${primo.n}), elemento: ${primo.esempio}`,
      esito === 'parziale' ? [`il primo selettore non trova nulla; valutare di portare in testa "${primo.sel}"`] : []);
  } else {
    const sugg = opts.candidati ? await page.evaluate(opts.candidati) : [];
    voce(pagina, chiave, opts.facoltativo ? 'info' : 'mancante', opts.facoltativo ? `nessun elemento (${opts.facoltativo})` : dett, sugg.slice(0, 6));
  }
  return primo;
}

const CANDIDATI = {
  composer: () => Array.from(document.querySelectorAll('[contenteditable="true"], textarea')).map((e) => window.__pgDescribe(e)),
  bottoniVicini: () => {
    const c = PG.sites.claude.findComposer(document) || document.querySelector('[contenteditable="true"], textarea');
    let scope = c;
    for (let i = 0; i < 5 && scope && scope.parentElement; i++) scope = scope.parentElement;
    return Array.from((scope || document).querySelectorAll('button')).map((b) => window.__pgDescribe(b));
  },
  messaggi: () => {
    const out = new Set();
    for (const e of document.querySelectorAll('[data-testid*="message" i], [class*="message" i], [data-is-streaming]')) out.add(window.__pgDescribe(e));
    return [...out];
  },
  bottoniRisposta: () => {
    const out = new Set();
    for (const b of document.querySelectorAll('main button')) if (b.getAttribute('aria-label') || b.getAttribute('data-testid')) out.add(window.__pgDescribe(b));
    return [...out];
  },
  dialoghi: () => Array.from(document.querySelectorAll('[role="dialog"], dialog')).map((d) => window.__pgDescribe(d) + ' titolo: ' + ((d.querySelector('h1,h2,h3,[role="heading"]') || {}).textContent || '').slice(0, 60)),
  linkProgetto: () => Array.from(document.querySelectorAll('a[href^="/project/"]')).map((a) => window.__pgDescribe(a) + ' dentro ' + window.__pgDescribe(a.closest('header, nav, aside, main'))),
};

async function adapterChecks(page, pagina, info) {
  const r = await page.evaluate((info) => {
    const a = PG.sites.claude;
    const c = a.findComposer(document);
    const cont = c ? a.composerContainer(c) : null;
    return {
      composer: c ? window.__pgDescribe(c) : null,
      container: cont ? window.__pgDescribe(cont) : null,
      check: a.selfCheck(document, info),
      pageInfo: a.pageInfo(document, location.href),
      fileInputs: Array.from(document.querySelectorAll('input[type="file"]')).map((i) => ({
        el: window.__pgDescribe(i), accept: i.getAttribute('accept') || '', nelComposer: Boolean(cont && cont.contains(i)),
      })),
    };
  }, info);
  voce(pagina, 'adapter.findComposer', r.composer ? 'trovato' : 'mancante', r.composer || '');
  voce(pagina, 'adapter.composerContainer', r.container ? 'trovato' : 'mancante', r.container || '');
  voce(pagina, 'adapter.selfCheck', r.check.ok ? 'trovato' : 'mancante', r.check.ok ? 'ok' : 'mancano: ' + r.check.missing.join(', '));
  voce(pagina, 'adapter.pageInfo', 'info', JSON.stringify({ page: r.pageInfo.page, haConversazione: Boolean(r.pageInfo.conversationId), haProgetto: Boolean(r.pageInfo.projectId) }));
  voce(pagina, 'input[type=file]', r.fileInputs.length ? 'trovato' : 'mancante', r.fileInputs.map((f) => `${f.el} accept="${f.accept}" ${f.nelComposer ? '(nel contenitore della casella)' : '(fuori dalla casella)'}`).join(' | '));
  return r;
}

// --- osservazione della rete ---------------------------------------------------------------------
function normalizzaPercorso(p) {
  return p.replace(UUID_RE, '<uuid>').replace(/\/organizations\/[^/]+/, '/organizations/<org>');
}

function chiaviJson(obj, prefix, out, depth) {
  if (!obj || typeof obj !== 'object' || depth > 3) return out;
  for (const [k, v] of Object.entries(obj)) {
    if (Array.isArray(v)) {
      out.push(prefix + k + '[]');
      if (v[0] && typeof v[0] === 'object') chiaviJson(v[0], prefix + k + '.*.', out, depth + 1);
    } else if (v && typeof v === 'object') {
      out.push(prefix + k + '{}');
      chiaviJson(v, prefix + k + '.', out, depth + 1);
    } else out.push(prefix + k);
  }
  return out;
}

function campoPresente(obj, field) {
  let refs = [obj];
  for (const p of field.split('.')) {
    const next = [];
    for (const r of refs) {
      if (r == null || typeof r !== 'object') continue;
      if (p === '*') { if (Array.isArray(r)) next.push(...r); } else if (p in r) next.push(r[p]);
    }
    refs = next;
  }
  return refs.length > 0;
}

function osservaRete(page) {
  page.on('request', (req) => {
    let u;
    try {
      u = new URL(req.url());
    } catch (_) {
      return;
    }
    if (u.hostname !== 'claude.ai' || !u.pathname.startsWith('/api/')) return;
    const method = req.method();
    if (!/^(POST|PUT|PATCH)$/.test(method)) return;
    const ct = req.headers()['content-type'] || '';
    const percorso = normalizzaPercorso(u.pathname);
    const regola = adapter.NETWORK_RULES.find((r) => r.methods.includes(method) && new RegExp(r.path).test(u.pathname));
    const voceRete = { metodo: method, percorso, tipo: req.resourceType(), contentType: ct.split(';')[0], regola: regola ? regola.id : null };
    if (ct.includes('json')) {
      try {
        const body = JSON.parse(req.postData() || '{}');
        voceRete.campi = chiaviJson(body, '', [], 0);
        if (regola && regola.fields) voceRete.campiRegola = regola.fields.map((f) => ({ campo: f, presente: campoPresente(body, f) }));
      } catch (_) { voceRete.campi = ['(JSON non leggibile)']; }
    } else if (ct.includes('multipart')) {
      voceRete.campi = ['(multipart: file)'];
    }
    const dup = report.rete.find((x) => x.metodo === method && x.percorso === percorso);
    if (!dup) {
      report.rete.push(voceRete);
      const cov = regola ? `regola "${regola.id}"` : 'NESSUNA REGOLA';
      console.log(`  [RETE] ${method} ${percorso} (${voceRete.tipo}, ${voceRete.contentType || '-'}) → ${cov}`);
      if (voceRete.campiRegola) for (const c of voceRete.campiRegola) console.log(`         campo ${c.campo}: ${c.presente ? 'presente' : 'ASSENTE'}`);
      if (!regola && voceRete.campi && voceRete.campi.length) console.log(`         campi: ${voceRete.campi.slice(0, 15).join(', ')}`);
    }
  });
}

// --- passaggi ------------------------------------------------------------------------------------
async function verificaNuovaChat(page, rl, args) {
  console.log('\n== Pagina «nuova chat» (https://claude.ai/new) ==');
  await page.goto('https://claude.ai/new', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  await inject(page);
  const S = adapter.SELECTORS;
  await checkList(page, 'new', 'SELECTORS.composer', S.composer, { candidati: CANDIDATI.composer });
  await checkList(page, 'new', 'SELECTORS.composerContainer', S.composerContainer);
  await checkList(page, 'new', 'SELECTORS.micButton', S.micButton, { candidati: CANDIDATI.bottoniVicini });
  await adapterChecks(page, 'new', { page: 'new' });

  // Il pulsante di invio spesso compare solo con del testo: si scrive e poi si cancella (nessun invio).
  const scritto = await page.evaluate(() => {
    const c = PG.sites.claude.findComposer(document);
    if (!c) return false;
    c.focus();
    return document.execCommand('insertText', false, 'prova');
  });
  await page.waitForTimeout(800);
  await checkList(page, 'new', 'SELECTORS.sendButton', S.sendButton, { candidati: CANDIDATI.bottoniVicini });
  const send = await page.evaluate(() => {
    const a = PG.sites.claude;
    const c = a.findComposer(document);
    const b = c ? a.findSendButton(document, c) : null;
    return { b: b ? window.__pgDescribe(b) : null, isSend: b ? a.isSendButton(b) : false };
  });
  voce('new', 'adapter.findSendButton', send.b ? 'trovato' : 'mancante', send.b ? `${send.b} (isSendButton=${send.isSend})` : 'nessun pulsante vicino alla casella', send.b ? [] : await page.evaluate(CANDIDATI.bottoniVicini));
  const letto = await page.evaluate(() => {
    const a = PG.sites.claude;
    const c = a.findComposer(document);
    return c ? a.getComposerText(c) : null;
  });
  voce('new', 'adapter.getComposerText', letto === 'prova' ? 'trovato' : 'parziale', `letto: ${JSON.stringify(letto)} (atteso "prova", scritto=${scritto})`);

  // Sostituzione completa come fa l'estensione: incolla sintetico.
  const sostituito = await page.evaluate(async () => {
    const a = PG.sites.claude;
    const c = a.findComposer(document);
    if (!c) return null;
    c.focus();
    const r = document.createRange();
    r.selectNodeContents(c);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    const dt = new DataTransfer();
    dt.setData('text/plain', 'riga uno\nriga [FULLNAME_1]');
    c.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    await new Promise((x) => setTimeout(x, 300));
    return a.getComposerText(c);
  });
  const okIncolla = sostituito && sostituito.replace(/\s+/g, ' ').trim() === 'riga uno riga [FULLNAME_1]';
  voce('new', 'sostituzione con incolla sintetico', okIncolla ? 'trovato' : 'mancante', `risultato: ${JSON.stringify(sostituito)}`,
    okIncolla ? [] : ['l\'editor non accetta l\'incolla sintetico: verificare il ripiego execCommand in src/content/dom-input.js']);
  // Pulizia della casella
  await page.evaluate(() => {
    const c = PG.sites.claude.findComposer(document);
    if (!c) return;
    c.focus();
    const r = document.createRange();
    r.selectNodeContents(c);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    document.execCommand('delete');
  });

  if (args.invia) {
    console.log('\n== Invio del messaggio di prova (--invia) ==');
    await page.evaluate((t) => {
      const c = PG.sites.claude.findComposer(document);
      c.focus();
      document.execCommand('insertText', false, t);
    }, MESSAGGIO_PROVA);
    await page.waitForTimeout(500);
    const ok = await page.evaluate(() => {
      const a = PG.sites.claude;
      const b = a.findSendButton(document, a.findComposer(document));
      if (b && !b.disabled) {
        b.click();
        return true;
      }
      return false;
    });
    if (!ok) await page.keyboard.press('Enter');
    let visto = false;
    for (let i = 0; i < 150 && !visto; i++) {
      await page.waitForTimeout(80);
      visto = await page.evaluate(() => Boolean(document.querySelector(PG.sites.claude.SELECTORS.streaming.join(','))));
    }
    voce('new', 'SELECTORS.streaming (durante la risposta)', visto ? 'trovato' : 'mancante', visto ? adapter.SELECTORS.streaming.join(', ') : 'attributo di streaming non osservato',
      visto ? [] : await page.evaluate(CANDIDATI.messaggi));
    await page.waitForTimeout(8000);
    await verificaMessaggi(page, 'chat (dopo invio)');
    const info = await page.evaluate(() => PG.sites.claude.parseUrl(location.href));
    voce('new', 'URL dopo il primo invio', info.page === 'chat' ? 'trovato' : 'mancante', `pagina riconosciuta come "${info.page}" (atteso "chat": serve al rebind dello scope pending)`);
  }
}

async function verificaMessaggi(page, pagina) {
  await inject(page);
  const S = adapter.SELECTORS;
  await checkList(page, pagina, 'SELECTORS.userMessage', S.userMessage, { candidati: CANDIDATI.messaggi });
  await checkList(page, pagina, 'SELECTORS.assistantMessage', S.assistantMessage, { candidati: CANDIDATI.messaggi });
  await checkList(page, pagina, 'SELECTORS.assistantTurn', S.assistantTurn, { candidati: CANDIDATI.messaggi });
  // I pulsanti della risposta compaiono spesso al passaggio del mouse.
  await page.evaluate(() => {
    const m = PG.sites.claude.getAssistantMessages(document).pop();
    if (m) m.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  });
  await page.waitForTimeout(500);
  await checkList(page, pagina, 'SELECTORS.retryButton', S.retryButton, { candidati: CANDIDATI.bottoniRisposta });
  const copia = await page.evaluate(() => Array.from(document.querySelectorAll('main button')).filter((b) => /copy|copia/i.test((b.getAttribute('aria-label') || '') + (b.getAttribute('data-testid') || ''))).map((b) => window.__pgDescribe(b)).slice(0, 3));
  voce(pagina, 'pulsante Copia (informativo)', copia.length ? 'info' : 'info', copia.length ? copia.join(' | ') : 'non individuato: la patch di navigator.clipboard non dipende da selettori');
}

async function verificaChat(page, rl, args) {
  if (!args.chat) {
    voce('chat', 'conversazione esistente', 'saltato', 'usare --chat <url> per verificare messaggi, intestazione e modifica');
    return;
  }
  console.log('\n== Conversazione esistente ==');
  await page.goto(args.chat, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  await verificaMessaggi(page, 'chat');
  await adapterChecks(page, 'chat', adapter.parseUrl(args.chat));
  await checkList(page, 'chat', 'SELECTORS.projectLinkInChat', adapter.SELECTORS.projectLinkInChat, {
    candidati: CANDIDATI.linkProgetto, facoltativo: 'normale se la chat non appartiene a un progetto',
  });
  if (args.interattivo && (await ask(rl, 'Apri la MODIFICA di un tuo messaggio (icona matita) senza salvare.'))) {
    await inject(page);
    const r = await page.evaluate(() => {
      const a = PG.sites.claude;
      const ta = Array.from(document.querySelectorAll('textarea, [contenteditable="true"]')).find((t) => !a.isComposer(t));
      if (!ta) return { campo: null };
      const save = ta.tagName === 'TEXTAREA' && a.isEditField(ta) ? a.findEditSave(ta) : null;
      return {
        campo: window.__pgDescribe(ta), isEditField: ta.tagName === 'TEXTAREA' ? a.isEditField(ta) : false,
        save: save ? window.__pgDescribe(save) + ' testo: ' + (save.textContent || '').trim().slice(0, 20) : null,
        bottoni: Array.from((ta.closest('form') || ta.parentElement.parentElement || document).querySelectorAll('button')).map((b) => window.__pgDescribe(b) + ' «' + (b.textContent || '').trim().slice(0, 20) + '»'),
      };
    });
    voce('chat', 'adapter.isEditField (modifica messaggio)', r.isEditField ? 'trovato' : 'mancante', r.campo || 'nessun campo di modifica trovato',
      r.isEditField ? [] : ['se il campo è un contenteditable occorre estendere isEditField e la scrittura in handleEditSend']);
    voce('chat', 'adapter.findEditSave', r.save ? 'trovato' : 'mancante', r.save || '', r.save ? [] : (r.bottoni || []).slice(0, 6));
    await ask(rl, 'Annulla la modifica (non salvare).');
  }
}

async function verificaProgetto(page, rl, args) {
  if (!args.progetto) {
    voce('project', 'pagina di progetto', 'saltato', 'usare --progetto <url> per verificare istruzioni e conoscenze');
    return;
  }
  console.log('\n== Pagina di progetto ==');
  await page.goto(args.progetto, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  await inject(page);
  await adapterChecks(page, 'project', adapter.parseUrl(args.progetto));
  if (args.interattivo && (await ask(rl, 'Apri la finestra delle ISTRUZIONI del progetto (non salvare).'))) {
    await inject(page);
    const r = await page.evaluate(() => {
      const f = PG.sites.claude.findInstructionsDialog(document);
      return f ? { dialog: window.__pgDescribe(f.dialog), field: window.__pgDescribe(f.field), save: f.save ? window.__pgDescribe(f.save) + ' «' + f.save.textContent.trim().slice(0, 30) + '»' : null } : null;
    });
    voce('project', 'adapter.findInstructionsDialog', r ? (r.save ? 'trovato' : 'parziale') : 'mancante',
      r ? `finestra ${r.dialog}, campo ${r.field}, salva ${r.save || 'NON TROVATO'}` : 'finestra non riconosciuta',
      r ? [] : await page.evaluate(CANDIDATI.dialoghi));
    await ask(rl, 'Chiudi la finestra senza salvare.');
  }
  if (args.interattivo) {
    await ask(rl, 'Facoltativo: carica nel progetto un file di prova SENZA dati personali (es. un .txt con «prova»), poi premi Invio: si osserva solo la richiesta di rete.');
    await page.waitForTimeout(2000);
  }
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.profilo) {
    console.log(AIUTO);
    process.exit(args.help ? 0 : 1);
  }
  const { chromium } = require('playwright');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log('Verifica dei selettori di src/sites/claude.js sul sito reale.');
  console.log(args.invia ? 'ATTENZIONE: verrà inviato UN messaggio di prova innocuo.' : 'Nessun messaggio verrà inviato (manca --invia).');

  const context = await chromium.launchPersistentContext(path.resolve(args.profilo), {
    headless: args.simula ? true : false,
    channel: args.chrome ? 'chrome' : undefined,
    viewport: null,
  });
  if (args.simula) {
    const fixture = fs.readFileSync(path.join(ROOT, 'dev', 'fixture', 'claude-like.html'), 'utf8');
    await context.route('https://claude.ai/**', (route) => {
      const u = new URL(route.request().url());
      if (u.pathname.startsWith('/api/')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: route.request().postData() || '{}' });
      }
      return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: fixture });
    });
  }
  const page = context.pages()[0] || (await context.newPage());
  osservaRete(page);

  try {
    await page.goto('https://claude.ai/new', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    if (!/claude\.ai\/(new|chat|project|$)/.test(page.url()) || /login/.test(page.url())) {
      console.log(`\nLa pagina è ${page.url()}: sembra che l'accesso non sia stato effettuato.`);
      if (args.interattivo) await ask(rl, 'Effettua l\'accesso a claude.ai nella finestra aperta, poi premi Invio.');
    }
    await verificaNuovaChat(page, rl, args);
    await verificaChat(page, rl, args);
    await verificaProgetto(page, rl, args);
  } catch (e) {
    console.error('\nErrore durante la verifica:', e.message);
    report.errore = e.message;
  }

  // Regole di rete mai osservate
  console.log('\n== Regole di rete (NETWORK_RULES) ==');
  for (const r of adapter.NETWORK_RULES) {
    const viste = report.rete.filter((x) => x.regola === r.id);
    voce('rete', `NETWORK_RULES.${r.id}`, viste.length ? 'trovato' : 'info',
      viste.length ? viste.map((v) => `${v.metodo} ${v.percorso}`).join(' | ') : 'non osservata in questa sessione (non necessariamente un errore)');
    for (const v of viste) {
      for (const c of v.campiRegola || []) {
        if (c.presente) continue;
        // Un campo dentro un array (es. attachments.*.x) può mancare solo perché l'array è vuoto.
        const opzionale = c.campo.includes('*');
        voce('rete', `  campo ${r.id}.${c.campo}`, opzionale ? 'info' : 'mancante',
          `${opzionale ? 'non presente (array vuoto o campo rinominato: ripetere con un allegato)' : 'assente nel corpo'}; campi presenti: ${(v.campi || []).slice(0, 20).join(', ')}`);
      }
    }
  }
  report.richiesteNonCoperte = report.rete.filter((x) => !x.regola);
  if (report.richiesteNonCoperte.length) {
    console.log('\nRichieste POST/PUT/PATCH verso /api/ NON coperte da alcuna regola (da valutare: possono contenere testo dell\'utente?):');
    for (const x of report.richiesteNonCoperte) console.log(`  ${x.metodo} ${x.percorso}  campi: ${(x.campi || []).slice(0, 12).join(', ')}`);
  }

  const tot = (e) => report.voci.filter((v) => v.esito === e).length;
  console.log(`\nRiepilogo: ${tot('trovato')} trovati, ${tot('parziale')} parziali, ${tot('mancante')} non trovati, ${tot('saltato')} saltati.`);
  if (args.json) {
    fs.writeFileSync(args.json, JSON.stringify(report, null, 2));
    console.log(`Rapporto JSON: ${path.resolve(args.json)}`);
  }
  rl.close();
  await context.close();
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { normalizzaPercorso, chiaviJson, campoPresente, parseArgs };
