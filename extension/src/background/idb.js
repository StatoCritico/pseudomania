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

  PG.idb = {
    get: (store, key) => run(store, 'readonly', (os) => req2p(os.get(key))),
    all: (store) => run(store, 'readonly', (os) => req2p(os.getAll())),
    put: (store, value) => run(store, 'readwrite', (os) => req2p(os.put(value))),
    add: (store, value) => run(store, 'readwrite', (os) => req2p(os.add(value))),
    del: (store, key) => run(store, 'readwrite', (os) => req2p(os.delete(key))),
    clear: (store) => run(store, 'readwrite', (os) => req2p(os.clear())),
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
