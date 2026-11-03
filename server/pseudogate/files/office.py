# SPDX-License-Identifier: AGPL-3.0-or-later
"""DOCX e XLSX: quali parti del pacchetto contengono testo e come estrarlo.

DOCX: corpo, intestazioni, piè di pagina, note, commenti (paragrafi interi, anche
dentro tabelle e caselle di testo), codici di campo (es. HYPERLINK "mailto:..."),
autori di commenti e revisioni, collegamenti esterni, proprietà del documento,
cache dei grafici incorporati, cartelle Excel incorporate (ricorsivamente).

XLSX: stringhe condivise (cella per cella), stringhe inline, valori in cache delle
formule di tipo testo (le formule restano intatte), intestazioni/piè di pagina,
commenti e autori, commenti in thread e persone, cache di grafici e tabelle pivot,
proprietà del documento.

Non gestiti (limiti noti): testo dentro immagini, oggetti OLE binari diversi da
DOCX/XLSX, nomi dei fogli, collegamenti a cartelle esterne.
"""

from __future__ import annotations

import re
from typing import Callable

from lxml import etree

from .ooxml import (Atom, Edit, Package, PartUnits, Unit, attribute_units, element_units,
                    paragraph_units, process_package)

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
X = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
A = "http://schemas.openxmlformats.org/drawingml/2006/main"
C = "http://schemas.openxmlformats.org/drawingml/2006/chart"
TC = "http://schemas.microsoft.com/office/spreadsheetml/2018/threadedcomments"
REL = "http://schemas.openxmlformats.org/package/2006/relationships"
DC = "http://purl.org/dc/elements/1.1/"
CP = "http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
EP = "http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"
VT = "http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"


def q(ns: str, tag: str) -> str:
    return f"{{{ns}}}{tag}"


Transform = Callable[[list[str]], list[list[Edit]]]

_DOCX_TEXT_PART = re.compile(
    r"^word/(document|header\d*|footer\d*|footnotes|endnotes|comments\w*|people|glossary/document)\.xml$")
_CHART_PART = re.compile(r"^(word|xl)/charts/chart\d*\.xml$")
_EMBED_PART = re.compile(r"^(word|xl)/embeddings/[^/]+\.(docx|xlsx)$", re.IGNORECASE)
_RELS_PART = re.compile(r"^(word|xl)/(worksheets/)?_rels/[^/]+\.rels$")


def _docprops(pkg: Package) -> list[PartUnits]:
    out = []
    if "docProps/core.xml" in pkg.names:
        root = pkg.tree("docProps/core.xml").getroot()
        out.append(PartUnits("docProps/core.xml", element_units(root, [
            q(DC, "creator"), q(CP, "lastModifiedBy"), q(DC, "title"), q(DC, "subject"),
            q(CP, "keywords"), q(DC, "description"), q(CP, "category"), q(CP, "contentStatus")])))
    if "docProps/app.xml" in pkg.names:
        root = pkg.tree("docProps/app.xml").getroot()
        out.append(PartUnits("docProps/app.xml", element_units(root, [
            q(EP, "Company"), q(EP, "Manager"), q(EP, "HyperlinkBase")])))
    if "docProps/custom.xml" in pkg.names:
        root = pkg.tree("docProps/custom.xml").getroot()
        out.append(PartUnits("docProps/custom.xml", element_units(root, [q(VT, "lpwstr"), q(VT, "lpstr")])))
    return out


def _external_rels(pkg: Package) -> list[PartUnits]:
    out = []
    for name in pkg.names:
        if not _RELS_PART.match(name):
            continue
        root = pkg.tree(name).getroot()
        units = [Unit([Atom(el.get("Target", ""), True, el, attr="Target")])
                 for el in root.iter(q(REL, "Relationship"))
                 if el.get("TargetMode") == "External" and el.get("Target", "").strip()]
        if units:
            out.append(PartUnits(name, units))
    return out


def _charts(pkg: Package) -> list[PartUnits]:
    out = []
    for name in pkg.names:
        if not _CHART_PART.match(name):
            continue
        root = pkg.tree(name).getroot()
        units = paragraph_units(root, q(A, "p"), {q(A, "t")}, {})
        for cache in root.iter(q(C, "strCache")):
            units += element_units(cache, [q(C, "v")])
        out.append(PartUnits(name, units))
    return out


def collect_docx(pkg: Package) -> list[PartUnits]:
    out = []
    for name in pkg.names:
        if not _DOCX_TEXT_PART.match(name):
            continue
        root = pkg.tree(name).getroot()
        units = paragraph_units(root, q(W, "p"), {q(W, "t"), q(W, "delText")},
                                {q(W, "tab"): "\t", q(W, "br"): "\n", q(W, "cr"): "\n",
                                 q(W, "noBreakHyphen"): "-"})
        units += element_units(root, [q(W, "instrText")])
        units += attribute_units(root, {"author", "initials", "userId", "instr"})
        out.append(PartUnits(name, units))
    return out + _charts(pkg) + _external_rels(pkg) + _docprops(pkg)


def collect_xlsx(pkg: Package) -> list[PartUnits]:
    out = []
    for name in pkg.names:
        if name == "xl/sharedStrings.xml":
            root = pkg.tree(name).getroot()
            out.append(PartUnits(name, paragraph_units(root, q(X, "si"), {q(X, "t")}, {})))
        elif re.match(r"^xl/worksheets/sheet\d*\.xml$", name):
            root = pkg.tree(name).getroot()
            units = paragraph_units(root, q(X, "is"), {q(X, "t")}, {})
            for c in root.iter(q(X, "c")):
                if c.get("t") == "str":
                    v = c.find(q(X, "v"))
                    if v is not None and (v.text or "").strip():
                        units.append(Unit([Atom(v.text, True, v)]))
            units += element_units(root, [q(X, t) for t in (
                "oddHeader", "oddFooter", "evenHeader", "evenFooter", "firstHeader", "firstFooter")])
            out.append(PartUnits(name, units))
        elif re.match(r"^xl/comments(?:\d*|/[^/]+)\.xml$", name):
            root = pkg.tree(name).getroot()
            units = paragraph_units(root, q(X, "text"), {q(X, "t")}, {})
            units += element_units(root, [q(X, "author")])
            out.append(PartUnits(name, units))
        elif re.match(r"^xl/threadedComments/[^/]+\.xml$", name):
            root = pkg.tree(name).getroot()
            out.append(PartUnits(name, element_units(root, [q(TC, "text")])))
        elif re.match(r"^xl/persons/[^/]+\.xml$", name):
            root = pkg.tree(name).getroot()
            out.append(PartUnits(name, attribute_units(root, {"displayName", "userId"})))
        elif re.match(r"^xl/pivotCache/[^/]+\.xml$", name):
            root = pkg.tree(name).getroot()
            units = [Unit([Atom(el.get("v", ""), True, el, attr="v")])
                     for el in root.iter(q(X, "s")) if el.get("v", "").strip()]
            out.append(PartUnits(name, units))
    return out + _charts(pkg) + _external_rels(pkg) + _docprops(pkg)


def transform_office(data: bytes, kind: str, transform: Transform, depth: int = 0) -> bytes:
    """Applica `transform` a tutti i testi del pacchetto; restituisce il nuovo file."""
    pkg = Package(data)
    collected = collect_docx(pkg) if kind == "docx" else collect_xlsx(pkg)
    changed = process_package(pkg, collected, transform)
    # anteprima del documento salvata da Office (immagine della prima pagina): si rimuove
    if changed and _drop_thumbnail(pkg):
        changed = True
    # documenti Office incorporati (es. dati dei grafici di Word in un .xlsx interno)
    if depth < 2:
        for info in pkg.infos:
            m = _EMBED_PART.match(info.filename)
            if not m:
                continue
            inner = pkg.read(info.filename)
            new_inner = transform_office(inner, m.group(2).lower(), transform, depth + 1)
            if new_inner is not inner:
                pkg.replaced[info.filename] = new_inner
                changed = True
    return pkg.save() if changed else data


def _drop_thumbnail(pkg: Package) -> bool:
    thumbs = [n for n in pkg.names if re.match(r"^docProps/thumbnail\.\w+$", n)]
    if not thumbs or "_rels/.rels" not in pkg.names:
        return False
    root = pkg.tree("_rels/.rels").getroot()
    for rel in list(root.iter(q(REL, "Relationship"))):
        if rel.get("Target", "").lstrip("/") in thumbs:
            rel.getparent().remove(rel)
    pkg.modified.add("_rels/.rels")
    if "[Content_Types].xml" in pkg.names:
        ct = pkg.tree("[Content_Types].xml").getroot()
        for ov in list(ct):
            if isinstance(ov.tag, str) and ov.get("PartName", "").lstrip("/") in thumbs:
                ct.remove(ov)
        pkg.modified.add("[Content_Types].xml")
    pkg.removed.update(thumbs)
    return True


def detect_office_kind(data: bytes) -> str | None:
    """'docx' | 'xlsx' | None, dal contenuto del pacchetto (non dall'estensione)."""
    try:
        pkg = Package(data)
    except Exception:
        return None
    names = set(pkg.names)
    if "[Content_Types].xml" not in names:
        return None
    ct = etree.tostring(pkg.tree("[Content_Types].xml"))
    if b"vnd.ms-word.document.macroEnabled" in ct or b"vnd.ms-excel.sheet.macroEnabled" in ct:
        return None  # file con macro: non gestiti
    if "word/document.xml" in names:
        return "docx"
    if "xl/workbook.xml" in names:
        return "xlsx"
    return None
