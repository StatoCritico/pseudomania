// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 gli autori di Pseudomania
//
// IndexedDB del service worker. Le CryptoKey vengono salvate come oggetti (clonazione
// strutturata): restano NON estraibili anche dopo il salvataggio.
//   keys    chiavi utente K_u della Server edition {keyId, key, createdAt, active, legacy}
//   device  coppia RSA-OAEP del dispositivo per il recupero {id:'device', privateKey, publicKey, deviceKeyId}
//   meta    chiavi locali e stato {id, ...}
//   pdict   Personal edition: dizionari cifrati per scope {scopeKey, ...}
//   plog    Personal edition: registro locale cifrato {id(auto), ts, iv, ct}

(function (root) {
  'use strict';
  const PG = (root.PG = root.PG || {});
  const NAME = 'pseudomania';
  const VERSION = 1;
  let dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('keys')) db.createObjectStore('keys', { keyPath: 'keyId' });
        if (!db.objectStoreNames.contains('device')) db.createObjectStore('device', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('pdict')) db.createObjectStore('pdict', { keyPath: 'scopeKey' });
        if (!db.objectStoreNames.contains('plog')) db.createObjectStore('plog', { keyPath: 'id', autoIncrement: true });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        dbp = null;
        reject(req.error);
      };
    });
    return dbp;
  }

  async function run(store, mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const os = tx.objectStore(store);
      let result;
      Promise.resolve(fn(os)).then((r) => (result = r));
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  const req2p = (r) => new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });

  /**
   * Persistenza del dizionario (Personal edition).
   *
   * Cosa protegge davvero dallo sfratto: il permesso `unlimitedStorage` del manifest. Chromium esclude
   * dallo sfratto per disco pieno le origini con archiviazione illimitata (SpecialStoragePolicy), e la
   * quota passa da una frazione del disco a quasi tutto il disco libero (verificato con
   * navigator.storage.estimate(): ~10 GB → ~31 GB sullo stesso disco).
   *
   * navigator.storage.persist() NON è disponibile nel service worker: per specifica è esposta solo a
   * Window (nel service worker di un'estensione MV3 `typeof navigator.storage.persist` è 'undefined';
   * persisted() invece c'è). In una pagina dell'estensione Chrome la concede solo con le sue euristiche
   * (segnalibri, coinvolgimento, notifiche) e senza chiedere nulla all'utente: in prova restituisce
   * false anche con unlimitedStorage. La si chiede comunque se disponibile (pagina dell'estensione, o
   * futuri Chrome) perché non costa nulla; lo stato riportato distingue le due protezioni.
   * @returns {Promise<{persisted:boolean, unlimited:boolean, protected:boolean, requested:boolean, quota:number|null, usage:number|null}>}
   */
  async function persistence(opts) {
    const sm = typeof navigator !== 'undefined' && navigator.storage ? navigator.storage : null;
    let persisted = false;
    let requested = false;
    let quota = null;
    let usage = null;
    try {
      if (sm && typeof sm.persisted === 'function') persisted = await sm.persisted();
      if (!persisted && sm && typeof sm.persist === 'function' && !(opts && opts.request === false)) {
        requested = true;
        persisted = await sm.persist();
      }
      if (sm && typeof sm.estimate === 'function') ({ quota = null, usage = null } = await sm.estimate());
    } catch (_) { /* API non disponibile: si riporta false */ }
    let unlimited = false;
    try {
      const m = root.chrome && root.chrome.runtime && root.chrome.runtime.getManifest ? root.chrome.runtime.getManifest() : null;
      unlimited = Boolean(m && Array.isArray(m.permissions) && m.permissions.includes('unlimitedStorage'));
    } catch (_) { /* fuori dall'estensione */ }
    return { persisted: Boolean(persisted), unlimited, protected: Boolean(persisted) || unlimited, requested, quota, usage };
  }

  PG.idb = {
    persistence,
    get: (store, key) => run(store, 'readonly', (os) => req2p(os.get(key))),
    all: (store) => run(store, 'readonly', (os) => req2p(os.getAll())),
    put: (store, value) => run(store, 'readwrite', (os) => req2p(os.put(value))),
    add: (store, value) => run(store, 'readwrite', (os) => req2p(os.add(value))),
    del: (store, key) => run(store, 'readwrite', (os) => req2p(os.delete(key))),
    clear: (store) => run(store, 'readwrite', (os) => req2p(os.clear())),
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
