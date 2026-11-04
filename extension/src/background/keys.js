// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 gli autori di Pseudomania
//
// Server edition: cifratura lato client del dizionario (DECISIONI.md, «Progetto crittografico»).
//
//  - K_u: AES-GCM 256 generata qui. La copia grezza viene cifrata con la chiave pubblica di
//    custodia (RSA-OAEP-4096 SHA-256, `escrowPublicKey` da /v1/config) e inviata come escrow
//    (POST /v1/keys/escrow); solo dopo l'accettazione viene importata come CryptoKey NON
//    estraibile in IndexedDB. I byte grezzi vengono azzerati.
//  - Voci: AES-GCM, IV casuale di 12 byte, AAD = "scopeType|scopeId|tag" (oppure aadScope se il
//    server lo indica, dopo un rebind).
//  - Rotazione ogni keyRotationDays (90) o se /v1/config dice rotateKey: nuova chiave + escrow,
//    ricifratura di tutte le voci (GET/PUT /v1/dictionary/rekey), poi il server distrugge l'escrow vecchio.
//  - Cambio PC: le voci con keyId sconosciuto sono «non ripristinabili». Recupero (progetti): coppia
//    RSA-OAEP del dispositivo (privata non estraibile) → POST /v1/keys/device; i custodi ricifrano
//    K_u_old per quel dispositivo; GET /v1/keys/recovered → unwrapKey come chiave «legacy».

(function (root) {
  'use strict';
  const PG = (root.PG = root.PG || {});
  const te = new TextEncoder();
  const td = new TextDecoder();

  function b64(buf) {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function unb64(s) {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  const aad = (scope, tag) => te.encode(`${scope.type}|${scope.id}|${tag}`);

  let rotating = null;

  async function allKeys() {
    return PG.idb.all('keys');
  }

  async function activeKey() {
    const ks = (await allKeys()).filter((k) => k.active);
    ks.sort((a, b) => b.createdAt - a.createdAt);
    return ks[0] || null;
  }

  async function keyById(keyId) {
    return (await PG.idb.get('keys', keyId)) || null;
  }

  /** Genera K_u, ne invia l'escrow e la conserva non estraibile. Lancia un errore se l'escrow fallisce. */
  async function generate(cfg) {
    if (!cfg.escrowPublicKey || !cfg.escrowKeyId) throw new Error('escrow_non_configurato');
    const raw = crypto.getRandomValues(new Uint8Array(32));
    try {
      const pub = await crypto.subtle.importKey('spki', unb64(cfg.escrowPublicKey), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);
      const wrapped = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, pub, raw);
      const keyId = crypto.randomUUID();
      const r = await PG.api.escrow(cfg, { keyId, wrappedKey: b64(wrapped), escrowKeyId: cfg.escrowKeyId });
      if (!r.ok) {
        const e = new Error('escrow_rifiutato');
        e.result = r;
        throw e;
      }
      const key = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
      const rec = { keyId, key, createdAt: Date.now(), active: true, legacy: false };
      await PG.idb.put('keys', rec);
      return rec;
    } finally {
      raw.fill(0);
    }
  }

  function rotationDue(cfg, rec) {
    if (!rec) return true;
    // rotateKey vale per la configurazione letta: una chiave creata dopo quella lettura è già nuova.
    if (cfg.rotateKey && rec.createdAt <= (cfg.serverConfigTs || Date.now())) return true;
    const days = cfg.keyRotationDays || 90;
    return Date.now() - rec.createdAt > days * 86400000;
  }

  /** Chiave attiva (generata se manca); avvia la rotazione se dovuta. */
  async function ensureKey(cfg) {
    let rec = await activeKey();
    if (!rec) return generate(cfg);
    if (rotationDue(cfg, rec)) {
      try {
        rec = await rotate(cfg);
      } catch (e) {
        console.warn('[Pseudomania] rotazione della chiave non riuscita:', e && e.message);
      }
    }
    return rec;
  }

  async function encryptValue(rec, scope, tag, value) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(scope, tag) }, rec.key, te.encode(value));
    return { ciphertext: b64(ct), iv: b64(iv) };
  }

  async function decryptValue(rec, aadScope, tag, entry) {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(entry.iv), additionalData: aad(aadScope, tag) }, rec.key, unb64(entry.ciphertext));
    return td.decode(pt);
  }

  /** newEntries [{tag, value}] → voci cifrate pronte per POST /v1/dictionary/entries. */
  async function encryptEntries(cfg, scope, newEntries) {
    const rec = await ensureKey(cfg);
    const out = [];
    for (const e of newEntries) out.push(Object.assign({ tag: e.tag, keyId: rec.keyId }, await encryptValue(rec, scope, e.tag, e.value)));
    return out;
  }

  /**
   * {tag: {ciphertext, iv, keyId, aadScope?}} → {values:{tag:valore}, unrecoverable:[tag]}.
   * Voci con keyId sconosciuto o non decifrabili: «non ripristinabili».
   */
  async function decryptEntries(scope, entries) {
    const values = {};
    const unrecoverable = [];
    const cache = new Map();
    for (const [tag, e] of Object.entries(entries || {})) {
      if (!e || !e.ciphertext) continue;
      if (!cache.has(e.keyId)) cache.set(e.keyId, await keyById(e.keyId));
      const rec = cache.get(e.keyId);
      if (!rec) {
        unrecoverable.push(tag);
        continue;
      }
      try {
        values[tag] = await decryptValue(rec, e.aadScope || scope, tag, e);
      } catch (_) {
        unrecoverable.push(tag);
      }
    }
    return { values, unrecoverable };
  }

  /** Ricifra con `newRec` tutte le voci del server cifrate con `oldKeyId`. */
  async function rekeyAll(cfg, oldRec, newRec) {
    let after = 0;
    let last = null;
    for (let guard = 0; guard < 1000; guard++) {
      const page = await PG.api.rekeyGet(cfg, oldRec.keyId, after, 500);
      if (!page.ok) throw new Error('rekey_lettura: ' + (page.error || page.status));
      const batch = [];
      for (const e of page.data.entries || []) {
        try {
          const value = await decryptValue(oldRec, e.aadScope || e.scope, e.tag, e);
          batch.push(Object.assign({ scope: e.scope, tag: e.tag }, await encryptValue(newRec, e.scope, e.tag, value)));
        } catch (_) { /* voce non decifrabile: resta con la chiave vecchia */ }
      }
      if (batch.length || page.data.next == null) {
        const put = await PG.api.rekeyPut(cfg, { oldKeyId: oldRec.keyId, newKeyId: newRec.keyId, entries: batch });
        if (!put.ok) throw new Error('rekey_scrittura: ' + (put.error || put.status));
        last = put.data;
      }
      if (page.data.next == null) break;
      after = page.data.next;
    }
    return last || { updated: 0, remaining: 0, escrowDeleted: false };
  }

  /** Rotazione: nuova chiave + escrow, ricifratura, disattivazione della vecchia. */
  async function rotate(cfg) {
    if (rotating) return rotating;
    rotating = (async () => {
      const meta = (await PG.idb.get('meta', 'rotation')) || { id: 'rotation', lastAttempt: 0 };
      const old = await activeKey();
      const minGap = cfg.rotateKey ? 60000 : 3600000; // tentativi non più frequenti di così
      if (old && Date.now() - meta.lastAttempt < minGap) return old;
      meta.lastAttempt = Date.now();
      await PG.idb.put('meta', meta);
      const fresh = await generate(cfg);
      if (old) {
        old.active = false;
        await PG.idb.put('keys', old);
        const res = await rekeyAll(cfg, old, fresh);
        // La chiave vecchia si elimina solo se sul server non ha più voci.
        if (res && res.remaining === 0) await PG.idb.del('keys', old.keyId);
        else {
          old.legacy = true;
          await PG.idb.put('keys', old);
        }
      }
      return fresh;
    })();
    try {
      return await rotating;
    } finally {
      rotating = null;
    }
  }

  // --- Recupero (cambio PC, solo progetti) ---------------------------------------------------
  async function prepareRecovery(cfg) {
    let dev = await PG.idb.get('device', 'device');
    if (dev && dev.deviceKeyId) return { deviceKeyId: dev.deviceKeyId, createdAt: dev.createdAt };
    if (!dev) {
      const pair = await crypto.subtle.generateKey(
        { name: 'RSA-OAEP', modulusLength: 3072, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
        false, // la chiave privata NON è estraibile
        ['wrapKey', 'unwrapKey', 'encrypt', 'decrypt']
      );
      const spki = await crypto.subtle.exportKey('spki', pair.publicKey);
      dev = { id: 'device', privateKey: pair.privateKey, publicKey: b64(spki), createdAt: Date.now(), deviceKeyId: null };
      await PG.idb.put('device', dev);
    }
    const r = await PG.api.deviceKey(cfg, dev.publicKey);
    if (!r.ok) throw new Error('registrazione_dispositivo: ' + (r.error || r.status));
    dev.deviceKeyId = r.data.deviceKeyId;
    await PG.idb.put('device', dev);
    return { deviceKeyId: dev.deviceKeyId, createdAt: dev.createdAt };
  }

  /** Scarica e importa le chiavi recuperate dai custodi per questo dispositivo. */
  async function importRecovered(cfg) {
    const dev = await PG.idb.get('device', 'device');
    if (!dev || !dev.deviceKeyId) return { imported: 0 };
    const r = await PG.api.recoveredKeys(cfg);
    if (!r.ok) throw new Error('chiavi_recuperate: ' + (r.error || r.status));
    let imported = 0;
    const active = await activeKey();
    for (const k of r.data.keys || []) {
      if (k.deviceKeyId !== dev.deviceKeyId || (await keyById(k.keyId))) continue;
      try {
        const key = await crypto.subtle.unwrapKey('raw', unb64(k.wrappedKey), dev.privateKey, { name: 'RSA-OAEP' }, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
        const rec = { keyId: k.keyId, key, createdAt: Date.parse(k.createdAt) || Date.now(), active: false, legacy: true };
        await PG.idb.put('keys', rec);
        imported++;
        // Le voci recuperate passano alla chiave attiva (che ha un escrow valido).
        if (active) {
          try {
            const res = await rekeyAll(cfg, rec, active);
            if (res && res.remaining === 0) await PG.idb.del('keys', rec.keyId);
          } catch (e) {
            console.warn('[Pseudomania] ricifratura delle voci recuperate non riuscita:', e && e.message);
          }
        }
      } catch (e) {
        console.warn('[Pseudomania] chiave recuperata non importabile:', e && e.message);
      }
    }
    return { imported };
  }

  async function status() {
    const ks = await allKeys();
    const active = ks.filter((k) => k.active).sort((a, b) => b.createdAt - a.createdAt)[0];
    const dev = await PG.idb.get('device', 'device');
    return {
      keyId: active ? active.keyId : null,
      createdAt: active ? active.createdAt : null,
      legacy: ks.filter((k) => k.legacy).length,
      deviceKeyId: dev ? dev.deviceKeyId : null,
    };
  }

  PG.keys = { ensureKey, generate, rotate, rotationDue, encryptEntries, decryptEntries, prepareRecovery, importRecovered, status, activeKey, b64, unb64 };
})(typeof globalThis !== 'undefined' ? globalThis : this);
