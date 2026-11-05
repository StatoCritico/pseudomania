// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 gli autori di Pseudomania
//
// Personal edition: attivazione per conversazione (DECISIONI.md, «Attivazione per conversazione»).
// Codice puro. La chiave è la «chiave di conversazione» (convKey: id della chat, oppure
// pending:<uuid4> per una nuova chat / la pagina di un progetto, ricollegata quando l'URL assume l'id).
//
// Stati:  'on'  protezione attiva in uscita
//         'off' disattivata in uscita (il ripristino in entrata resta SEMPRE attivo)
// Modalità (impostazione «activationMode» della Personal edition, DECISIONI.md 5/11/2026):
//   'off' (predefinita) disattivata di default, senza domande: conversazione salvata 'on' → 'on',
//                        ogni altra → 'off'.
//   'on'                attiva di default: conversazione salvata 'off' → 'off', ogni altra → 'on'.
//   'ask'               comportamento del 1/11/2026: salvata 'on' → 'on'; salvata 'off' → 'ask';
//                        mai vista → 'on' se l'ultima scelta era «attiva», altrimenti 'ask'
//                        (banner «Attiva» / «Continua senza protezione»; nel frattempo protetta).

(function (root) {
  'use strict';
  const PG = (root.PG = root.PG || {});
  const MAX_KEYS = 2000;

  class Activation {
    /** @param {{states?:object, last?:'on'|'off', warned?:object}} [data] dati salvati */
    constructor(data) {
      data = data || {};
      this.states = Object.assign({}, data.states);
      this.last = data.last === 'off' ? 'off' : data.last === 'on' ? 'on' : null;
      this.warned = Object.assign({}, data.warned);
    }

    /** Stato da applicare entrando in una conversazione. */
    decide(key, mode) {
      const s = key ? this.states[key] : undefined;
      if (mode === 'on') return s === 'off' ? 'off' : 'on';
      if (mode === 'ask') {
        if (!key) return 'on';
        if (s === 'on') return 'on';
        if (s === 'off') return 'ask';
        return this.last === 'off' ? 'ask' : 'on';
      }
      return s === 'on' ? 'on' : 'off';
    }

    /** Ingresso in una conversazione. Solo in modalità 'ask' un'attivazione automatica viene memorizzata. */
    enter(key, mode) {
      const st = this.decide(key, mode);
      if (mode === 'ask' && key && st === 'on' && this.states[key] !== 'on') this.states[key] = 'on';
      this._prune();
      return st;
    }

    /** Scelta esplicita dell'utente (pulsante, scorciatoia o banner). */
    set(key, state) {
      if (state !== 'on' && state !== 'off') throw new Error('stato non valido');
      if (key) this.states[key] = state;
      this.last = state;
      this._prune();
      return state;
    }

    /** Stato dopo un clic sul pulsante a partire dallo stato corrente. */
    static toggled(current) {
      return current === 'on' ? 'off' : 'on';
    }

    /** Nuova chat che riceve l'id definitivo: lo stato segue la conversazione. */
    move(from, to) {
      if (!from || !to || from === to) return;
      if (this.states[from] !== undefined) {
        this.states[to] = this.states[from];
        delete this.states[from];
      }
      if (this.warned[from]) {
        this.warned[to] = this.warned[from];
        delete this.warned[from];
      }
    }

    needsOffWarning(key, hasProtectedData) {
      return Boolean(hasProtectedData && key && !this.warned[key]);
    }

    markWarned(key) {
      if (key) this.warned[key] = Date.now();
    }

    toJSON() {
      return { states: this.states, last: this.last, warned: this.warned };
    }

    _prune() {
      for (const obj of [this.states, this.warned]) {
        const ks = Object.keys(obj);
        if (ks.length > MAX_KEYS) for (const k of ks.slice(0, ks.length - MAX_KEYS)) delete obj[k];
      }
    }
  }

  const api = { Activation };
  PG.activation = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
