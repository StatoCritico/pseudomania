// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 gli autori di Pseudomania
//
// Gestione dello scope del dizionario (SPEC.md, «Scope del dizionario»). Codice puro: riceve la
// descrizione della pagina prodotta dall'adattatore del sito ({page, conversationId, projectId}).
//
//  - chat in un progetto          → scope {type:'project', id:<progetto>}
//  - chat singola                 → scope {type:'conversation', id:<uuid chat>}
//  - nuova chat senza id          → scope {type:'conversation', id:'pending:<uuid4>'}; quando l'URL
//                                   assume l'id, si chiede POST /v1/scopes/rebind (se lo scope è stato usato)
//  - nuova chat dalla pagina di un progetto → scope del progetto (nessun rebind del dizionario), ma si
//                                   memorizza l'associazione chat → progetto.
//
// Oltre allo scope del dizionario si tiene una «chiave di conversazione» (convKey) usata per
// l'istruzione fissa «una volta per conversazione» e per i record di ispezione.

(function (root) {
  'use strict';
  const PG = (root.PG = root.PG || {});

  const PENDING_PREFIX = 'pending:';

  function uuid4() {
    if (root.crypto && typeof root.crypto.randomUUID === 'function') return root.crypto.randomUUID();
    const b = new Uint8Array(16);
    (root.crypto || require('crypto').webcrypto).getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }

  function isPending(id) {
    return typeof id === 'string' && id.startsWith(PENDING_PREFIX);
  }

  function scopeKey(scope) {
    return scope ? `${scope.type}:${scope.id}` : '';
  }

  function sameScope(a, b) {
    return Boolean(a && b && a.type === b.type && a.id === b.id);
  }

  class ScopeTracker {
    /**
     * @param {{newId?:()=>string, projectOf?:(conversationId:string)=>string|null,
     *          aliasOf?:(conversationId:string)=>string|null}} [deps]
     */
    constructor(deps) {
      deps = deps || {};
      this.newId = deps.newId || (() => PENDING_PREFIX + uuid4());
      this.projectOf = deps.projectOf || (() => null);
      // Conversazioni il cui rebind è stato rifiutato (409): continuano a usare lo scope pending.
      this.aliasOf = deps.aliasOf || (() => null);
      this.pendingId = null;
      this.pendingUsed = false;
      this.pendingProject = null;
      this.lastPageKey = null;
      this.current = { scope: null, convKey: null, info: null };
    }

    /** Segnala che nello scope corrente è stato inviato qualcosa al server. */
    markUsed() {
      if (this.pendingId) this.pendingUsed = true;
    }

    /** Sostituisce lo scope corrente (es. rebind rifiutato: si resta sullo scope pending). */
    overrideScope(scope) {
      this.current = Object.assign({}, this.current, { scope });
    }

    /**
     * Aggiorna lo stato in base alla pagina corrente.
     * @returns {{scope, convKey, rebind:{from,to}|null, moveConvKey:{from,to}|null,
     *            mapProject:{conversationId,projectId}|null, changed:boolean}}
     */
    update(info) {
      info = info || { page: 'other' };
      const pageKey = `${info.page}|${info.conversationId || ''}|${info.projectId || ''}`;
      const prev = this.current;
      const result = { scope: null, convKey: null, rebind: null, moveConvKey: null, mapProject: null, changed: false };

      if (info.page === 'new' || (info.page === 'project' && info.projectId)) {
        const projectId = info.page === 'project' ? info.projectId : null;
        if (!this.pendingId || this.lastPageKey !== pageKey) {
          this.pendingId = this.newId();
          this.pendingUsed = false;
        }
        this.pendingProject = projectId;
        result.convKey = this.pendingId;
        result.scope = projectId
          ? { type: 'project', id: projectId }
          : { type: 'conversation', id: this.pendingId };
      } else if (info.page === 'chat' && info.conversationId) {
        const cid = info.conversationId;
        let projectId = info.projectId || this.projectOf(cid) || null;
        const cameFromPending = this.pendingId && this.lastPageKey && /^(new|project)\|/.test(this.lastPageKey);
        if (cameFromPending && this.pendingUsed) {
          if (this.pendingProject) {
            projectId = projectId || this.pendingProject;
            result.mapProject = { conversationId: cid, projectId: this.pendingProject };
          } else {
            result.rebind = {
              from: { type: 'conversation', id: this.pendingId },
              to: projectId ? { type: 'project', id: projectId } : { type: 'conversation', id: cid },
            };
          }
          result.moveConvKey = { from: this.pendingId, to: cid };
        } else if (cameFromPending && this.pendingProject && !projectId) {
          // Chat avviata da un progetto senza invii intercettati: l'associazione resta comunque utile.
          projectId = this.pendingProject;
          result.mapProject = { conversationId: cid, projectId };
        }
        this.pendingId = null;
        this.pendingUsed = false;
        this.pendingProject = null;
        result.convKey = cid;
        const alias = projectId ? null : this.aliasOf(cid);
        result.scope = projectId
          ? { type: 'project', id: projectId }
          : { type: 'conversation', id: alias || cid };
      } else {
        this.pendingId = null;
        this.pendingUsed = false;
        this.pendingProject = null;
      }

      this.lastPageKey = pageKey;
      result.changed = !sameScope(prev.scope, result.scope) || prev.convKey !== result.convKey;
      this.current = { scope: result.scope, convKey: result.convKey, info };
      return result;
    }
  }

  const api = { ScopeTracker, isPending, scopeKey, sameScope, uuid4, PENDING_PREFIX };
  PG.scope = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
