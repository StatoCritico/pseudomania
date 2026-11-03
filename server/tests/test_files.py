# SPDX-License-Identifier: AGPL-3.0-or-later
from __future__ import annotations

import base64
import io
import json
import zipfile

import pytest

from conftest import AUTH

docx = pytest.importorskip("docx")
openpyxl = pytest.importorskip("openpyxl")

DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


_EXT = {}


@pytest.fixture(autouse=True)
def _emulator(client):
    from conftest import AUTH as _A
    from support.client import ExtensionEmulator
    e = ExtensionEmulator(client, _A)
    e.setup()
    _EXT["e"] = e
    yield
    _EXT.clear()


def _upload(client, scope, name, data, mime="application/octet-stream", kind="attachment"):
    r = client.post("/v1/pseudonymize/file", headers=AUTH,
                    data={"scope_type": scope["type"], "scope_id": scope["id"],
                          "site": "claude.ai", "kind": kind},
                    files={"file": (name, data, mime)})
    assert r.status_code == 200, r.text
    out = r.json()
    if "e" in _EXT and _EXT["e"].c is client:
        _EXT["e"].upload(scope, out.get("newEntries") or [])
    return out


def _restore(client, scope, name, data, mime="application/octet-stream"):
    entries = _EXT["e"].dictionary(scope)  # decifrate "nel browser"
    r = client.post("/v1/reidentify/file", headers=AUTH,
                    data={"scope_type": scope["type"], "scope_id": scope["id"],
                          "entries": json.dumps(entries)},
                    files={"file": (name, data, mime)})
    assert r.status_code == 200, r.text
    return r.json()


# --------------------------------------------------------------------------- testo
def test_txt_cp1252_roundtrip(client, scope):
    original = "Perché Mario Rossi è d'accordo: scrive a giulia bianchi.\n".encode("cp1252")
    out = _upload(client, scope, "nota.txt", original, "text/plain")
    assert not out["blocked"]
    pseudo = base64.b64decode(out["contentB64"])
    assert pseudo.decode("cp1252") == "Perché [FULLNAME_1] è d'accordo: scrive a [FULLNAME_2].\n"
    assert {e["tag"] for e in out["entities"]} == {"[FULLNAME_1]", "[FULLNAME_2]"}
    back = _restore(client, scope, "risposta.txt", pseudo)
    assert base64.b64decode(back["contentB64"]) == original
    assert set(back) == {"filename", "mime", "contentB64", "entities", "unknownTags", "traceId"}


def test_csv_and_md(client, scope):
    csv = "nome;email\nMario Rossi;mario@example.it\n".encode("utf-8-sig")
    out = _upload(client, scope, "elenco.csv", csv, "text/csv")
    data = base64.b64decode(out["contentB64"])
    assert data.startswith(b"\xef\xbb\xbf")
    assert data[3:].decode() == "nome;email\n[FULLNAME_1];[EMAIL_1]\n"
    md = "# Verbale\n\n**Presente:** Luca Verdi\n".encode()
    out = _upload(client, scope, "verbale.md", md, "text/markdown")
    assert base64.b64decode(out["contentB64"]).decode() == "# Verbale\n\n**Presente:** [FULLNAME_2]\n"
    assert out["mime"].startswith("text/markdown")


def test_filename_is_pseudonymized(client, scope):
    out = _upload(client, scope, "Contratto_Mario_Rossi.txt", b"Testo senza dati.")
    assert out["filename"] == "Contratto_[FULLNAME_1].txt"
    back = _restore(client, scope, out["filename"], base64.b64decode(out["contentB64"]))
    assert back["filename"] == "Contratto_Mario Rossi.txt"


def test_unsupported_and_too_large(client, make_client, scope):
    out = _upload(client, scope, "foto.png", b"\x89PNG\r\n\x1a\n....")
    assert out["blocked"] and "immagin" in out["blockReason"]
    assert out["contentB64"] == ""
    out = _upload(client, scope, "archivio.zip", _zip_bytes())
    assert out["blocked"]
    small = make_client(max_file_mb=1)
    r = small.post("/v1/pseudonymize/file", headers=AUTH,
                   data={"scope_type": scope["type"], "scope_id": scope["id"]},
                   files={"file": ("grande.txt", b"a" * (1024 * 1024 + 10), "text/plain")})
    assert r.status_code == 413 and r.json()["error"] == "file_too_large"


def test_special_category_in_file(client, scope):
    out = _upload(client, scope, "nota.txt", "Mario Rossi è in malattia per depressione".encode())
    assert out["blocked"] and out["contentB64"] == ""


def _zip_bytes():
    b = io.BytesIO()
    with zipfile.ZipFile(b, "w") as z:
        z.writestr("a.txt", "ciao")
    return b.getvalue()


# --------------------------------------------------------------------------- docx
def _make_docx() -> bytes:
    d = docx.Document()
    d.core_properties.author = "Mario Rossi"
    d.core_properties.title = "Lettera per Giulia Bianchi"
    p = d.add_paragraph()
    r1 = p.add_run("Gentile Ma")
    r1.bold = True
    p.add_run("rio Ros")
    r3 = p.add_run("si, la contattiamo.")
    r3.italic = True
    d.add_paragraph("Email: mario.rossi@example.it\tTel: +39 333 1234567")
    t = d.add_table(rows=2, cols=2)
    t.cell(0, 0).text = "Nome"
    t.cell(0, 1).text = "Luca Verdi"
    t.cell(1, 0).text = "Città"
    t.cell(1, 1).text = "Torino"
    sec = d.sections[0]
    sec.header.paragraphs[0].text = "Pratica di Anna Neri"
    sec.footer.paragraphs[0].text = "Comune di Esempio - Ufficio Protocollo"
    try:
        d.add_comment(p.runs[0], text="Verificare con Giulia Bianchi", author="Luca Verdi",
                      initials="LV")
    except AttributeError:  # python-docx < 1.2
        pass
    b = io.BytesIO()
    d.save(b)
    return b.getvalue()


def test_docx_roundtrip(client, scope):
    original = _make_docx()
    out = _upload(client, scope, "lettera.docx", original, DOCX_MIME)
    assert not out["blocked"], out["blockReason"]
    assert out["mime"] == DOCX_MIME
    data = base64.b64decode(out["contentB64"])
    d = docx.Document(io.BytesIO(data))
    p0 = d.paragraphs[0]
    assert p0.text == "Gentile [FULLNAME_1], la contattiamo."
    # il segnaposto eredita il run in grassetto dove inizia l'entità
    assert p0.runs[0].text == "Gentile [FULLNAME_1]" and p0.runs[0].bold
    assert p0.runs[-1].italic and p0.runs[-1].text == ", la contattiamo."
    assert d.paragraphs[1].text == "Email: [EMAIL_1]\tTel: [TELEPHONENUM_1]"
    t = d.tables[0]
    assert t.cell(0, 1).text == "[FULLNAME_2]" and t.cell(1, 1).text == "[CITY_1]"
    assert d.sections[0].header.paragraphs[0].text == "Pratica di [FULLNAME_3]"
    assert d.sections[0].footer.paragraphs[0].text == "Comune di Esempio - Ufficio Protocollo"
    assert d.core_properties.author == "[FULLNAME_1]"
    assert d.core_properties.title == "Lettera per [FULLNAME_4]"
    # nessun valore reale in nessuna parte XML del pacchetto
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        blob = b"".join(z.read(n) for n in z.namelist())
    for v in (b"Rossi", b"Verdi", b"Neri", b"Bianchi", b"Torino", b"example.it"):
        assert v not in blob, v
    assert not any(n.startswith("docProps/thumbnail") for n in z.namelist())

    back = _restore(client, scope, "lettera.docx", data, DOCX_MIME)
    d2 = docx.Document(io.BytesIO(base64.b64decode(back["contentB64"])))
    assert d2.paragraphs[0].text == "Gentile Mario Rossi, la contattiamo."
    assert d2.tables[0].cell(0, 1).text == "Luca Verdi"
    assert d2.sections[0].header.paragraphs[0].text == "Pratica di Anna Neri"
    assert d2.core_properties.author == "Mario Rossi"
    assert {e["tag"] for e in back["entities"]} >= {"[FULLNAME_1]", "[EMAIL_1]", "[CITY_1]"}


def test_docx_special_category_blocked(client, scope):
    d = docx.Document()
    d.add_paragraph("Richiesta permessi legge 104 per Mario Rossi")
    b = io.BytesIO()
    d.save(b)
    out = _upload(client, scope, "richiesta.docx", b.getvalue(), DOCX_MIME)
    assert out["blocked"] and "disabilità" in out["blockReason"]


# --------------------------------------------------------------------------- xlsx
def _make_xlsx() -> bytes:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Dati"
    ws["A1"], ws["B1"], ws["C1"] = "Nome", "Email", "Saluto"
    ws["A2"], ws["B2"] = "Mario Rossi", "mario.rossi@example.it"
    ws["C2"] = '="Gentile "&A2'
    ws["A3"], ws["B3"] = "Giulia Bianchi", 1234
    ws["C3"] = "=SUM(B3:B3)"
    from openpyxl.comments import Comment
    ws["A2"].comment = Comment("Contattare Luca Verdi", "Anna Neri")
    wb.properties.creator = "Luca Verdi"
    b = io.BytesIO()
    wb.save(b)
    return b.getvalue()


def test_xlsx_roundtrip_formulas_untouched(client, scope):
    original = _make_xlsx()
    out = _upload(client, scope, "elenco.xlsx", original, XLSX_MIME)
    assert not out["blocked"], out["blockReason"]
    data = base64.b64decode(out["contentB64"])
    wb = openpyxl.load_workbook(io.BytesIO(data))
    ws = wb["Dati"]
    assert ws["A2"].value == "[FULLNAME_1]"
    assert ws["B2"].value == "[EMAIL_1]"
    assert ws["A3"].value == "[FULLNAME_2]"
    assert ws["B3"].value == 1234
    assert ws["C2"].value == '="Gentile "&A2'
    assert ws["C3"].value == "=SUM(B3:B3)"
    assert ws["A1"].value == "Nome"
    assert "[FULLNAME_3]" in ws["A2"].comment.text
    assert wb.properties.creator == "[FULLNAME_3]"
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        blob = b"".join(z.read(n) for n in z.namelist())
    for v in (b"Rossi", b"Bianchi", b"Verdi", b"Neri", b"example.it"):
        assert v not in blob, v

    back = _restore(client, scope, "elenco.xlsx", data, XLSX_MIME)
    wb2 = openpyxl.load_workbook(io.BytesIO(base64.b64decode(back["contentB64"])))
    ws2 = wb2["Dati"]
    assert ws2["A2"].value == "Mario Rossi" and ws2["A3"].value == "Giulia Bianchi"
    assert ws2["C2"].value == '="Gentile "&A2'
    assert ws2["A2"].comment.text == "Contattare Luca Verdi"


def test_unchanged_office_file_is_byte_identical(client, scope):
    d = docx.Document()
    d.add_paragraph("Nessun dato personale qui.")
    b = io.BytesIO()
    d.save(b)
    out = _upload(client, scope, "vuoto.docx", b.getvalue(), DOCX_MIME)
    assert base64.b64decode(out["contentB64"]) == b.getvalue()


# --------------------------------------------------------------------------- pdf
def test_pdf_requires_pymupdf_or_works(client, scope):
    from pseudogate.files import pdf as pdf_files
    pdf = b"%PDF-1.4\n%fake\n"
    out = _upload(client, scope, "atto.pdf", pdf, "application/pdf")
    if not pdf_files.HAVE_PYMUPDF:
        assert out["blocked"] and "PDF" in out["blockReason"]


def _handmade_xlsx_shared_strings() -> bytes:
    """XLSX minimale come lo salva Excel: stringhe condivise, rich text spezzato in più
    run, formula con valore in cache di tipo stringa."""
    ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
    files = {
        "[Content_Types].xml": (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
            '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>'
            '</Types>'),
        "_rels/.rels": (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
            '</Relationships>'),
        "xl/workbook.xml": (
            f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook {ns} '
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            '<sheets><sheet name="Foglio1" sheetId="1" r:id="rId1"/></sheets></workbook>'),
        "xl/_rels/workbook.xml.rels": (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
            '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>'
            '</Relationships>'),
        "xl/sharedStrings.xml": (
            f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst {ns} count="2" uniqueCount="2">'
            '<si><t>Mario Rossi</t></si>'
            '<si><r><rPr><b/></rPr><t>Referente: Giu</t></r><r><t xml:space="preserve">lia Bianchi </t></r></si>'
            '</sst>'),
        "xl/worksheets/sheet1.xml": (
            f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet {ns}><sheetData>'
            '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c>'
            '<c r="C1" t="str"><f>A1&amp;"!"</f><v>Mario Rossi!</v></c></row>'
            '</sheetData></worksheet>'),
    }
    b = io.BytesIO()
    with zipfile.ZipFile(b, "w") as z:
        for n, c in files.items():
            z.writestr(n, c)
    return b.getvalue()


def test_xlsx_shared_strings_rich_text_and_cached_values(client, scope):
    out = _upload(client, scope, "excel.xlsx", _handmade_xlsx_shared_strings(), XLSX_MIME)
    assert not out["blocked"], out["blockReason"]
    data = base64.b64decode(out["contentB64"])
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        sst = z.read("xl/sharedStrings.xml").decode()
        sheet = z.read("xl/worksheets/sheet1.xml").decode()
    assert "<t>[FULLNAME_1]</t>" in sst
    assert "Referente: [FULLNAME_2]</t>" in sst and "<b/>" in sst
    assert '<f>A1&amp;"!"</f>' in sheet and "<v>[FULLNAME_1]!</v>" in sheet
    wb = openpyxl.load_workbook(io.BytesIO(data))
    assert wb.active["A1"].value == "[FULLNAME_1]"
    back = _restore(client, scope, "excel.xlsx", data, XLSX_MIME)
    wb2 = openpyxl.load_workbook(io.BytesIO(base64.b64decode(back["contentB64"])))
    assert wb2.active["A1"].value == "Mario Rossi"
    assert wb2.active["B1"].value == "Referente: Giulia Bianchi "


def test_xlsx_cells_are_not_joined_by_detector_regexes(client, scope):
    """Regressione: la cella "Ufficio Protocollo" seguita dalla cella "15872" non deve
    diventare un DOCID a cavallo delle due celle (e l'allowlist vale per cella)."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(["Ufficio Protocollo", 15872])
    ws.append(["Ufficio Protocollo", "15873"])
    ws.append(["Prot. n. 4471/2026", "Mario Rossi"])
    b = io.BytesIO()
    wb.save(b)
    out = _upload(client, scope, "registro.xlsx", b.getvalue(), XLSX_MIME)
    ws2 = openpyxl.load_workbook(io.BytesIO(base64.b64decode(out["contentB64"]))).active
    assert ws2["A1"].value == "Ufficio Protocollo" and ws2["A2"].value == "Ufficio Protocollo"
    assert ws2["B2"].value == "15873"
    assert ws2["A3"].value == "[DOCID_1]" and ws2["B3"].value == "[FULLNAME_1]"
