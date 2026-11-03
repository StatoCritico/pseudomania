// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 gli autori di Pseudomania
//
// Adattatore per claude.ai: TUTTO ciò che dipende dal sito (selettori, URL, endpoint interni) sta
// qui. I selettori di partenza vengono da Privacy Guardrail (DFKI, Apache-2.0,
// src/content/site-adapters/claude-adapter.ts) e sono stati ampliati con alternative.
//
//   >>> SELETTORI ED ENDPOINT DA VERIFICARE SUL SITO REALE <<<
// Nessuno dei selettori seguenti è stato verificato su claude.ai durante lo sviluppo (non era
// possibile accedere al sito). Ogni voce è un elenco ordinato: si usa il primo che trova qualcosa.
// Per aggiornarli basta modificare l'oggetto SELECTORS (e, per la rete, NETWORK_RULES).
// L'autoverifica (selfCheck) emette l'evento `page_unrecognized` se mancano gli elementi essenziali.
//
// Interfaccia di un adattatore (per aggiungere ChatGPT in futuro, creare src/sites/chatgpt.js con
// gli stessi membri e registrarlo in src/sites/registry.js):
//   id, hosts, SELECTORS, NETWORK_RULES
//   parseUrl(url) -> {page:'chat'|'project'|'new'|'other', conversationId, projectId}
//   pageInfo(doc, url) -> come parseUrl, arricchito con projectId letto dal DOM
//   findComposer(doc), isComposer(el), getComposerText(el), findSendButton(doc, composer),
//   isSendButton(el), isEditField(el), findEditSave(field), isEditSave(el), isRetryButton(el),
//   isMicButton(el), findInstructionsDialog(doc), isInstructionsSave(el), getUserMessages(doc),
//   getAssistantMessages(doc), isStreaming(el), messageRoots(doc), composerAnchor(composer),
//   isUploadContext(el, info) -> 'attachment'|'project_knowledge', selfCheck(doc, info)

(function (root) {
  'use strict';
  const PG = (root.PG = root.PG || {});
  PG.sites = PG.sites || {};

  const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';

  // --- DA VERIFICARE SUL SITO REALE -----------------------------------------------------------
  const SELECTORS = {
    composer: [
      'div.ProseMirror[contenteditable="true"]',
      '[contenteditable="true"][role="textbox"]',
      'fieldset [contenteditable="true"]',
      '[data-testid="chat-input"]',
      'textarea[data-testid="chat-input-ssr"]',
    ],
    composerContainer: ['fieldset', 'form', '[data-testid="chat-input-container"]'],
    sendButton: [
      'button[aria-label="Send message"]',
      'button[aria-label="Send Message"]',
      'button[aria-label="Invia messaggio"]',
      'button[aria-label*="Send" i]',
      'button[aria-label*="Invia" i]',
      'button[type="submit"]',
    ],
    userMessage: ['[data-testid="user-message"]', '.font-user-message'],
    assistantMessage: ['.font-claude-response', '.font-claude-message', '[data-is-streaming] .standard-markdown'],
    streaming: ['[data-is-streaming="true"]'],
    assistantTurn: ['[data-is-streaming]'],
    retryButton: [
      '[data-testid="action-bar-retry"]',
      'button[aria-label*="Retry" i]',
      'button[aria-label*="Riprova" i]',
      'button[aria-label*="Regenerate" i]',
      'button[aria-label*="Rigenera" i]',
    ],
    editSaveText: /^(save|salva|send|invia|submit)$/i,
    micButton: [
      'button[aria-label*="dictation" i]',
      'button[aria-label*="voice" i]',
      'button[aria-label*="microphone" i]',
      'button[aria-label*="dettatura" i]',
      'button[aria-label*="vocale" i]',
      'button[aria-label*="microfono" i]',
      '[data-testid*="dictation" i]',
      '[data-testid*="voice" i]',
    ],
    dialog: ['[role="dialog"]', 'dialog'],
    instructionsHeading: /(instructions|istruzioni)/i,
    projectLinkInChat: [
      '[data-testid="chat-header"] a[href^="/project/"]',
      'header a[href^="/project/"]',
      'nav[aria-label*="breadcrumb" i] a[href^="/project/"]',
      'main a[href^="/project/"]',
    ],
    // Aree in cui NON ripristinare (campi modificabili e UI dell'estensione)
    noRestore: '[contenteditable="true"], textarea, input, script, style, noscript, pg-ui, [data-pg-ui]',
  };

  // Endpoint interni di claude.ai sorvegliati dalla «rete di sicurezza» a livello di rete
  // (src/content/page-hook.js). DA VERIFICARE: i percorsi e i nomi dei campi sono ricostruiti
  // e possono cambiare senza preavviso.
  const NETWORK_RULES = [
    {
      id: 'completion', methods: ['POST'],
      path: `^/api/organizations/[^/]+/chat_conversations/[^/]+/completion$`,
      fields: ['prompt', 'attachments.*.extracted_content'], kind: 'message',
    },
    {
      id: 'retry', methods: ['POST'],
      path: `^/api/organizations/[^/]+/chat_conversations/[^/]+/retry_completion$`,
      fields: ['prompt'], kind: 'regenerate',
    },
    {
      id: 'conversation-rename', methods: ['PUT', 'PATCH'],
      path: `^/api/organizations/[^/]+/chat_conversations/[^/]+$`, fields: ['name'], kind: 'message',
    },
    {
      id: 'project-create', methods: ['POST'],
      path: `^/api/organizations/[^/]+/projects$`, fields: ['prompt_template', 'description', 'name'],
      kind: 'project_instructions',
    },
    {
      id: 'project-update', methods: ['PUT', 'PATCH', 'POST'],
      path: `^/api/organizations/[^/]+/projects/[^/]+$`, fields: ['prompt_template', 'description', 'name'],
      kind: 'project_instructions',
    },
    {
      id: 'project-doc', methods: ['POST'],
      path: `^/api/organizations/[^/]+/projects/[^/]+/docs$`, fields: ['content'], kind: 'project_knowledge',
      fileNameField: 'file_name',
    },
    // Qualunque caricamento multipart verso /api/: ogni File non approvato passa dal server.
    { id: 'upload', methods: ['POST', 'PUT'], path: '^/api/', formFiles: true },
  ];
  // --------------------------------------------------------------------------------------------

  function q(doc, list, scope) {
    for (const sel of list) {
      try {
        const el = (scope || doc).querySelector(sel);
        if (el) return el;
      } catch (_) { /* selettore non valido: si passa al successivo */ }
    }
    return null;
  }

  function qa(doc, list, scope) {
    for (const sel of list) {
      try {
        const els = (scope || doc).querySelectorAll(sel);
        if (els.length) return Array.from(els);
      } catch (_) { /* ignora */ }
    }
    return [];
  }

  function matchesAny(el, list) {
    if (!el || el.nodeType !== 1) return false;
    for (const sel of list) {
      try {
        if (el.matches(sel)) return true;
      } catch (_) { /* ignora */ }
    }
    return false;
  }

  function closestAny(el, list) {
    if (!el || !el.closest) return null;
    for (const sel of list) {
      try {
        const c = el.closest(sel);
        if (c) return c;
      } catch (_) { /* ignora */ }
    }
    return null;
  }

  function isOurs(el) {
    return Boolean(el && el.closest && el.closest('pg-ui, [data-pg-ui]'));
  }

  const adapter = {
    id: 'claude.ai',
    hosts: ['claude.ai'],
    SELECTORS,
    NETWORK_RULES,

    /** Analisi pura dell'URL. */
    parseUrl(url) {
      let u;
      try {
        u = new URL(url);
      } catch (_) {
        return { page: 'other', conversationId: null, projectId: null };
      }
      const p = u.pathname.replace(/\/+$/, '') || '/';
      let m = p.match(new RegExp(`^/chat/(${UUID})$`));
      if (m) return { page: 'chat', conversationId: m[1].toLowerCase(), projectId: null };
      m = p.match(new RegExp(`^/project/(${UUID})$`));
      if (m) return { page: 'project', conversationId: null, projectId: m[1].toLowerCase() };
      if (p === '/' || p === '/new') return { page: 'new', conversationId: null, projectId: null };
      return { page: 'other', conversationId: null, projectId: null };
    },

    /** Come parseUrl, più il progetto di appartenenza letto dall'intestazione della chat. */
    pageInfo(doc, url) {
      const info = this.parseUrl(url);
      if (info.page === 'chat') {
        const a = q(doc, SELECTORS.projectLinkInChat);
        if (a && !isOurs(a)) {
          const m = (a.getAttribute('href') || '').match(new RegExp(`^/project/(${UUID})`));
          if (m) info.projectId = m[1].toLowerCase();
        }
      }
      return info;
    },

    findComposer(doc) {
      for (const sel of SELECTORS.composer) {
        let els;
        try {
          els = doc.querySelectorAll(sel);
        } catch (_) {
          continue;
        }
        for (const el of els) {
          if (isOurs(el) || closestAny(el, SELECTORS.dialog)) continue;
          if (el.closest('[data-testid="user-message"]')) continue;
          return el;
        }
      }
      return null;
    },

    isComposer(el) {
      if (!el || el.nodeType !== 1) return false;
      const c = this.findComposer(el.ownerDocument);
      return Boolean(c && (c === el || c.contains(el)));
    },

    getComposerText(el) {
      if (el.tagName === 'TEXTAREA') return el.value;
      // ProseMirror: un <p> per paragrafo; innerText conserva gli a capo.
      const t = typeof el.innerText === 'string' ? el.innerText : el.textContent;
      return (t || '').replace(/ /g, ' ').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '');
    },

    composerContainer(composer) {
      return closestAny(composer, SELECTORS.composerContainer) || composer.parentElement;
    },

    findSendButton(doc, composer) {
      const container = composer ? this.composerContainer(composer) : null;
      let scope = container;
      // Il pulsante può stare qualche livello sopra la casella.
      for (let i = 0; i < 4 && scope; i++) {
        const b = q(doc, SELECTORS.sendButton, scope);
        if (b && !isOurs(b)) return b;
        scope = scope.parentElement;
      }
      return null;
    },

    isSendButton(el) {
      const b = el && el.closest ? el.closest('button') : null;
      if (!b || isOurs(b)) return false;
      if (closestAny(b, SELECTORS.dialog)) return false;
      const composer = this.findComposer(b.ownerDocument);
      if (!composer) return false;
      const send = this.findSendButton(b.ownerDocument, composer);
      return send === b;
    },

    /** Casella di modifica di un messaggio già inviato (modifica e reinvio). */
    isEditField(el) {
      if (!el || el.tagName !== 'TEXTAREA' || isOurs(el)) return false;
      if (closestAny(el, SELECTORS.dialog)) return false;
      if (this.isComposer(el)) return false;
      return Boolean(el.closest('main') || el.closest('form'));
    },

    findEditSave(field) {
      let scope = field.closest('form') || field.parentElement;
      for (let i = 0; i < 4 && scope; i++) {
        const btns = Array.from(scope.querySelectorAll('button')).filter((b) => !isOurs(b));
        const save =
          btns.find((b) => SELECTORS.editSaveText.test((b.textContent || '').trim())) ||
          btns.find((b) => b.type === 'submit');
        if (save) return save;
        scope = scope.parentElement;
      }
      return null;
    },

    /** Restituisce la casella di modifica associata al pulsante, se il pulsante è «Salva/Invia» di una modifica. */
    editFieldForButton(el) {
      const b = el && el.closest ? el.closest('button') : null;
      if (!b || isOurs(b) || closestAny(b, SELECTORS.dialog)) return null;
      let scope = b.closest('form') || b.parentElement;
      for (let i = 0; i < 4 && scope; i++) {
        const field = Array.from(scope.querySelectorAll('textarea')).find((t) => this.isEditField(t));
        if (field) return this.findEditSave(field) === b ? field : null;
        scope = scope.parentElement;
      }
      return null;
    },

    isRetryButton(el) {
      const b = el && el.closest ? el.closest('button, [data-testid="action-bar-retry"]') : null;
      return Boolean(b && !isOurs(b) && matchesAny(b, SELECTORS.retryButton));
    },

    micSelector() {
      return SELECTORS.micButton.join(', ');
    },

    isMicButton(el) {
      const b = el && el.closest ? el.closest('button, [role="button"]') : null;
      return Boolean(b && !isOurs(b) && matchesAny(b, SELECTORS.micButton));
    },

    /** Finestra delle istruzioni di progetto: {dialog, field, save} oppure null. */
    findInstructionsDialog(doc) {
      for (const d of qa(doc, SELECTORS.dialog)) {
        const heading = d.querySelector('h1, h2, h3, [role="heading"]');
        const label = (heading ? heading.textContent : d.getAttribute('aria-label')) || '';
        if (!SELECTORS.instructionsHeading.test(label)) continue;
        const field = d.querySelector('textarea');
        if (!field) continue;
        const btns = Array.from(d.querySelectorAll('button'));
        const save =
          btns.find((b) => /^(save|salva|save instructions|salva istruzioni)$/i.test((b.textContent || '').trim())) ||
          btns.find((b) => b.type === 'submit');
        return { dialog: d, field, save: save || null };
      }
      return null;
    },

    isInstructionsSave(el) {
      const b = el && el.closest ? el.closest('button') : null;
      if (!b) return null;
      const found = this.findInstructionsDialog(b.ownerDocument);
      return found && found.save === b ? found : null;
    },

    getUserMessages(doc) {
      return qa(doc, SELECTORS.userMessage).filter((e) => !isOurs(e));
    },

    getAssistantMessages(doc) {
      return qa(doc, SELECTORS.assistantMessage).filter((e) => !isOurs(e));
    },

    isStreaming(el) {
      return Boolean(closestAny(el, SELECTORS.streaming));
    },

    assistantTurn(el) {
      return closestAny(el, SELECTORS.assistantTurn) || el;
    },

    /** Radici in cui cercare segnaposto da ripristinare (tutta la pagina, esclusi i campi modificabili). */
    restoreRoot(doc) {
      return doc.body;
    },

    composerAnchor(composer) {
      return this.composerContainer(composer);
    },

    /** Tipo di caricamento di un file in base al contesto. */
    uploadKind(target, info) {
      if (info && info.page === 'project') {
        // Sulla pagina del progetto la casella di chat avvia una nuova chat nel progetto: i suoi
        // allegati sono allegati; gli altri caricamenti sono conoscenze del progetto.
        const composer = this.findComposer(target.ownerDocument || document);
        const container = composer ? this.composerContainer(composer) : null;
        if (container && target && container.contains(target)) return 'attachment';
        return 'project_knowledge';
      }
      return 'attachment';
    },

    /** Autoverifica: ci sono gli elementi essenziali? */
    selfCheck(doc, info) {
      const missing = [];
      if (!info || info.page === 'other') return { ok: true, missing, applicable: false };
      const composer = this.findComposer(doc);
      if (!composer) missing.push('composer');
      else if (!this.composerContainer(composer)) missing.push('composerContainer');
      if (info.page === 'chat' && !this.getUserMessages(doc).length && !this.getAssistantMessages(doc).length) {
        missing.push('messages');
      }
      return { ok: missing.length === 0, missing, applicable: true };
    },
  };

  PG.sites.claude = adapter;
  if (typeof module === 'object' && module.exports) module.exports = adapter;
})(typeof globalThis !== 'undefined' ? globalThis : this);
