// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Personal edition: ZIP, XML e DOCX/XLSX in JavaScript (porting del motore OOXML del server).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
require('../../src/shared/zip.js');
require('../../src/shared/ooxml.js');
require('../../src/shared/textfile.js');
const { PG } = globalThis;

const enc = (s) => new TextEncoder().encode(s);
const dec = (b) => new TextDecoder().decode(b);

const CT_DOCX = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/docProps/thumbnail.jpeg" ContentType="image/jpeg"/></Types>';
const DOC = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
  '<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Gentile Ma</w:t></w:r><w:r><w:t xml:space="preserve">rio Rossi, </w:t></w:r><w:r><w:tab/><w:t>a presto &amp; grazie</w:t></w:r></w:p>' +
  '<w:p><w:r><w:t>Nessun dato</w:t></w:r></w:p>' +
  '<w:p><w:ins w:author="Mario Rossi"><w:r><w:t>revisione</w:t></w:r></w:ins></w:p>' +
  '</w:body></w:document>';
const CORE = '<?xml version="1.0" encoding="UTF-8"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:creator>Mario Rossi</dc:creator><dc:title>Lettera</dc:title></cp:coreProperties>';
const RELS = '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="x/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="x/thumbnail" Target="docProps/thumbnail.jpeg"/></Relationships>';

async function makeDocx() {
  return PG.zip.writeZip([
    { name: '[Content_Types].xml', content: enc(CT_DOCX) },
    { name: '_rels/.rels', content: enc(RELS) },
    { name: 'word/document.xml', content: enc(DOC) },
    { name: 'docProps/core.xml', content: enc(CORE) },
    { name: 'docProps/thumbnail.jpeg', content: new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]) },
    { name: 'word/media/image1.png', content: new Uint8Array([137, 80, 78, 71, 9, 9, 9]) },
  ]);
}

/** Rilevatore finto: "Mario Rossi" → [FULLNAME_1]. */
function fakeTransform(seen) {
  return async (texts) => {
    if (seen) seen.push(...texts);
    return texts.map((t) => {
      const out = [];
      const rx = /Mario Rossi/g;
      let m;
      while ((m = rx.exec(t)) !== null) out.push({ start: m.index, end: m.index + m[0].length, text: '[FULLNAME_1]' });
      return out;
    });
  };
}

test('zip: lettura/scrittura con deflate-raw e CRC32', async () => {
  const z = await PG.zip.writeZip([{ name: 'a.txt', content: enc('ciao ciao ciao ciao') }, { name: 'dir/è.xml', content: enc('<x/>') }]);
  const r = PG.zip.readZip(z);
  assert.deepEqual(r.entries.map((e) => e.name), ['a.txt', 'dir/è.xml']);
  assert.equal(dec(await r.entries[0].data()), 'ciao ciao ciao ciao');
  assert.equal(PG.zip.crc32(enc('123456789')), 0xcbf43926);
  // riscrittura senza modifiche: dati compressi copiati byte per byte
  const again = await PG.zip.writeZip(r.entries);
  assert.equal(dec(await PG.zip.readZip(again).entries[1].data()), '<x/>');
});

test('XmlDoc: token, namespace, testo e attributi; serializzazione identica', () => {
  const d = new PG.ooxml.XmlDoc(DOC);
  assert.equal(d.toString(), DOC);
  const W = PG.ooxml.NS.W;
  const ts = d.find(new Set([`{${W}}t`]));
  assert.equal(d.text(ts[2]), 'a presto & grazie');
});

test('DOCX: entità spezzata su due run, autore delle revisioni, proprietà; anteprima rimossa', async () => {
  const docx = await makeDocx();
  assert.equal(await PG.ooxml.detectOfficeKind(docx), 'docx');
  const seen = [];
  const out = await PG.ooxml.transformOffice(docx, 'docx', fakeTransform(seen));
  assert.ok(seen.includes('Gentile Mario Rossi, \ta presto & grazie'), JSON.stringify(seen));
  const z = PG.zip.readZip(out);
  const names = z.entries.map((e) => e.name);
  assert.ok(!names.includes('docProps/thumbnail.jpeg'), 'anteprima tolta');
  const doc = dec(await z.entries.find((e) => e.name === 'word/document.xml').data());
  assert.ok(doc.startsWith('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'), 'dichiarazione conservata');
  assert.ok(doc.includes('<w:t>Gentile [FULLNAME_1]</w:t>'), doc);
  assert.ok(doc.includes('<w:t xml:space="preserve">, </w:t>'), doc);
  assert.ok(doc.includes('a presto &amp; grazie'));
  assert.ok(doc.includes('w:author="[FULLNAME_1]"'));
  assert.ok(!doc.includes('Mario') && !doc.includes('Rossi'));
  const core = dec(await z.entries.find((e) => e.name === 'docProps/core.xml').data());
  assert.ok(core.includes('<dc:creator>[FULLNAME_1]</dc:creator>'));
  const img = z.entries.find((e) => e.name === 'word/media/image1.png');
  assert.deepEqual([...(await img.data())], [137, 80, 78, 71, 9, 9, 9]);
  const ct = dec(await z.entries.find((e) => e.name === '[Content_Types].xml').data());
  assert.ok(!ct.includes('thumbnail'));
});

test('DOCX senza entità: file restituito invariato (stesso oggetto)', async () => {
  const docx = await makeDocx();
  const out = await PG.ooxml.transformOffice(docx, 'docx', async (texts) => texts.map(() => []));
  assert.equal(out, docx);
});

test('XLSX: stringhe condivise, valori in cache delle formule testuali, formule intatte', async () => {
  const X = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const xlsx = await PG.zip.writeZip([
    { name: '[Content_Types].xml', content: enc('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>') },
    { name: 'xl/workbook.xml', content: enc(`<workbook xmlns="${X}"/>`) },
    { name: 'xl/sharedStrings.xml', content: enc(`<sst xmlns="${X}"><si><t>Mario Rossi</t></si><si><r><t>Ufficio</t></r><r><t xml:space="preserve"> Tributi</t></r></si></sst>`) },
    { name: 'xl/worksheets/sheet1.xml', content: enc(`<worksheet xmlns="${X}"><sheetData><row><c r="A1" t="s"><v>0</v></c><c r="B1" t="str"><f>CONCAT("Dott. ",A1)</f><v>Dott. Mario Rossi</v></c><c r="C1"><v>42</v></c></row></sheetData></worksheet>`) },
  ]);
  assert.equal(await PG.ooxml.detectOfficeKind(xlsx), 'xlsx');
  const out = await PG.ooxml.transformOffice(xlsx, 'xlsx', fakeTransform());
  const z = PG.zip.readZip(out);
  const sst = dec(await z.entries.find((e) => e.name === 'xl/sharedStrings.xml').data());
  assert.ok(sst.includes('<si><t>[FULLNAME_1]</t></si>'));
  assert.ok(sst.includes(' Tributi'));
  const sh = dec(await z.entries.find((e) => e.name === 'xl/worksheets/sheet1.xml').data());
  assert.ok(sh.includes('<f>CONCAT("Dott. ",A1)</f><v>Dott. [FULLNAME_1]</v>'), sh);
});

test('ripristino (verso inverso) nei DOCX: segnaposto → valori', async () => {
  const docx = await makeDocx();
  const pseudo = await PG.ooxml.transformOffice(docx, 'docx', fakeTransform());
  const back = await PG.ooxml.transformOffice(pseudo, 'docx', async (texts) =>
    texts.map((t) => {
      const out = [];
      const rx = /\[FULLNAME_1\]/g;
      let m;
      while ((m = rx.exec(t)) !== null) out.push({ start: m.index, end: m.index + m[0].length, text: 'Mario Rossi' });
      return out;
    }));
  const doc = dec(await PG.zip.readZip(back).entries.find((e) => e.name === 'word/document.xml').data());
  assert.ok(doc.includes('Gentile Mario Rossi'));
});

test('riconoscimento formati e codifiche dei file di testo', async () => {
  assert.equal((await PG.textfile.detectKind('a.pdf', enc('%PDF-1.4 ...'))).kind, 'pdf');
  assert.equal((await PG.textfile.detectKind('a.txt', enc('ciao'))).kind, 'txt');
  assert.equal((await PG.textfile.detectKind('a.png', new Uint8Array([1, 2]))).kind, null);
  const latin = new Uint8Array([0x63, 0x61, 0x66, 0xe8]); // "cafè" in windows-1252
  const dt = PG.textfile.decodeText(latin);
  assert.equal(dt.text, 'cafè');
  assert.equal(dec(PG.textfile.encodeText(dt, dt.text).subarray(3)), 'cafè');
});
