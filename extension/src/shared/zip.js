// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 gli autori di Pseudomania
//
// Lettura e scrittura minima di archivi ZIP (pacchetti DOCX/XLSX) con le API native
// CompressionStream / DecompressionStream "deflate-raw" (Chrome ≥ 103, Node ≥ 18).
// Le voci non modificate vengono ricopiate byte per byte (dati compressi originali).
// Non supporta ZIP64 né archivi cifrati (non usati da Office per documenti normali).

(function (root) {
  'use strict';
  const PG = (root.PG = root.PG || {});

  const MAX_ENTRIES = 10000;
  const MAX_UNCOMPRESSED = 300 * 1024 * 1024;

  let CRC_TABLE = null;
  function crc32(bytes) {
    if (!CRC_TABLE) {
      CRC_TABLE = new Uint32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        CRC_TABLE[n] = c >>> 0;
      }
    }
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  async function pipe(bytes, stream) {
    const s = new Blob([bytes]).stream().pipeThrough(stream);
    return new Uint8Array(await new Response(s).arrayBuffer());
  }
  const inflate = (b) => pipe(b, new DecompressionStream('deflate-raw'));
  const deflate = (b) => pipe(b, new CompressionStream('deflate-raw'));

  class ZipError extends Error {}

  /** @returns {{entries: object[]}} archivio letto; entry.data() restituisce i byte decompressi */
  function readZip(input) {
    const buf = input instanceof Uint8Array ? input : new Uint8Array(input);
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    let eocd = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) throw new ZipError('Archivio non valido (manca la directory centrale).');
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    if (count === 0xffff || p === 0xffffffff) throw new ZipError('Archivi ZIP64 non supportati.');
    if (count > MAX_ENTRIES) throw new ZipError('Troppi elementi nell\'archivio.');
    const dec = new TextDecoder('utf-8');
    const entries = [];
    let total = 0;
    for (let n = 0; n < count; n++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new ZipError('Directory centrale danneggiata.');
      const e = {
        versionMade: dv.getUint16(p + 4, true),
        versionNeeded: dv.getUint16(p + 6, true),
        flags: dv.getUint16(p + 8, true),
        method: dv.getUint16(p + 10, true),
        time: dv.getUint16(p + 12, true),
        date: dv.getUint16(p + 14, true),
        crc: dv.getUint32(p + 16, true),
        csize: dv.getUint32(p + 20, true),
        usize: dv.getUint32(p + 24, true),
        internalAttr: dv.getUint16(p + 36, true),
        externalAttr: dv.getUint32(p + 38, true),
      };
      const nameLen = dv.getUint16(p + 28, true);
      const extraLen = dv.getUint16(p + 30, true);
      const commentLen = dv.getUint16(p + 32, true);
      const localOffset = dv.getUint32(p + 42, true);
      e.name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen));
      if (e.flags & 1) throw new ZipError('Archivi cifrati non supportati.');
      if (dv.getUint32(localOffset, true) !== 0x04034b50) throw new ZipError('Intestazione locale danneggiata.');
      const lName = dv.getUint16(localOffset + 26, true);
      const lExtra = dv.getUint16(localOffset + 28, true);
      const start = localOffset + 30 + lName + lExtra;
      e.raw = buf.subarray(start, start + e.csize);
      total += e.usize;
      if (total > MAX_UNCOMPRESSED) throw new ZipError('Archivio troppo grande una volta decompresso.');
      e.data = async () => {
        if (e.method === 0) return e.raw;
        if (e.method === 8) return inflate(e.raw);
        throw new ZipError(`Metodo di compressione ${e.method} non supportato.`);
      };
      entries.push(e);
      p += 46 + nameLen + extraLen + commentLen;
    }
    return { entries };
  }

  /**
   * Scrive un archivio. Ogni voce: {name, raw, method, crc, csize, usize, ...} (copiata così com'è)
   * oppure {name, content: Uint8Array} (compressa ora).
   */
  async function writeZip(entries) {
    const enc = new TextEncoder();
    const parts = [];
    const central = [];
    let offset = 0;
    for (const src of entries) {
      let e = src;
      if (src.content) {
        const data = src.content;
        const comp = await deflate(data);
        e = Object.assign({}, src, { method: 8, raw: comp, crc: crc32(data), csize: comp.length, usize: data.length });
      }
      const name = enc.encode(e.name);
      const flags = ((e.flags || 0) & ~0x0008) | 0x0800; // niente descrittore dati; nomi UTF-8
      const time = e.time || 0;
      const date = e.date || 0x21; // 1980-01-01
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true);
      lh.setUint16(4, e.versionNeeded || 20, true);
      lh.setUint16(6, flags, true);
      lh.setUint16(8, e.method, true);
      lh.setUint16(10, time, true);
      lh.setUint16(12, date, true);
      lh.setUint32(14, e.crc, true);
      lh.setUint32(18, e.csize, true);
      lh.setUint32(22, e.usize, true);
      lh.setUint16(26, name.length, true);
      lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), name, e.raw);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true);
      ch.setUint16(4, e.versionMade || 20, true);
      ch.setUint16(6, e.versionNeeded || 20, true);
      ch.setUint16(8, flags, true);
      ch.setUint16(10, e.method, true);
      ch.setUint16(12, time, true);
      ch.setUint16(14, date, true);
      ch.setUint32(16, e.crc, true);
      ch.setUint32(20, e.csize, true);
      ch.setUint32(24, e.usize, true);
      ch.setUint16(28, name.length, true);
      ch.setUint16(36, e.internalAttr || 0, true);
      ch.setUint32(38, e.externalAttr || 0, true);
      ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + e.raw.length;
    }
    const cdSize = central.reduce((s, b) => s + b.length, 0);
    const eocd = new DataView(new ArrayBuffer(22));
    eocd.setUint32(0, 0x06054b50, true);
    eocd.setUint16(8, entries.length, true);
    eocd.setUint16(10, entries.length, true);
    eocd.setUint32(12, cdSize, true);
    eocd.setUint32(16, offset, true);
    const all = parts.concat(central, [new Uint8Array(eocd.buffer)]);
    const out = new Uint8Array(all.reduce((s, b) => s + b.length, 0));
    let o = 0;
    for (const b of all) {
      out.set(b, o);
      o += b.length;
    }
    return out;
  }

  const api = { readZip, writeZip, crc32, inflate, deflate, ZipError };
  PG.zip = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
