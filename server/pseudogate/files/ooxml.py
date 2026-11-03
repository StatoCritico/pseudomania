# SPDX-License-Identifier: AGPL-3.0-or-later
"""Motore comune DOCX/XLSX a livello OOXML (zip + XML).

Si lavora direttamente sulle parti XML del pacchetto invece che sul modello a
oggetti di python-docx/openpyxl per due motivi:
- tutto ciò che non tocchiamo (immagini, grafici, stili, macro disattivate,
  convalide, formule) resta byte per byte identico; openpyxl, ad esempio, perde
  grafici e immagini quando salva un file esistente;
- nel testo di un paragrafo Word un'entità può essere spezzata su più "run"
  (es. "Ma" in grassetto + "rio Rossi"): il paragrafo viene ricostruito come
  sequenza di atomi di testo (w:t, w:tab, w:br...) e le sostituzioni vengono
  applicate sul testo concatenato, poi ridistribuite sugli atomi: il segnaposto
  eredita la formattazione del run in cui inizia l'entità, il resto dell'entità
  viene rimosso dagli altri run.

Le formule di Excel (<f>) non vengono mai modificate; i valori in cache delle
formule di tipo stringa (<c t="str"><v>) invece sì, perché possono contenere il
risultato di concatenazioni di dati personali.
"""

from __future__ import annotations

import io
import zipfile
from dataclasses import dataclass, field
from typing import Callable, Iterable

from lxml import etree

from ..errors import BadRequest

XML_NS = "http://www.w3.org/XML/1998/namespace"
MAX_ENTRIES = 10_000
MAX_UNCOMPRESSED = 300 * 1024 * 1024

_PARSER = etree.XMLParser(resolve_entities=False, no_network=True, huge_tree=False,
                          remove_blank_text=False)


# --------------------------------------------------------------------------- #
# Atomi e unità di testo
# --------------------------------------------------------------------------- #
@dataclass
class Atom:
    text: str
    editable: bool
    elem: etree._Element | None = None
    attr: str | None = None  # se valorizzato, l'atomo è un attributo di elem

    def set(self, value: str) -> None:
        if self.attr:
            self.elem.set(self.attr, value)
        else:
            self.elem.text = value
            if value != value.strip() or "  " in value:
                self.elem.set(f"{{{XML_NS}}}space", "preserve")


@dataclass
class Unit:
    atoms: list[Atom] = field(default_factory=list)

    @property
    def text(self) -> str:
        return "".join(a.text for a in self.atoms)


@dataclass
class Edit:
    start: int
    end: int
    text: str


def rewrite_unit(unit: Unit, edits: list[Edit]) -> bool:
    """Applica le sostituzioni (offset sul testo concatenato) agli atomi modificabili."""
    if not edits:
        return False
    full = unit.text
    n = len(full)
    ranges = []  # (a, b, atom)
    pos = 0
    for atom in unit.atoms:
        ranges.append((pos, pos + len(atom.text), atom))
        pos += len(atom.text)
    editable = [(a, b, at) for a, b, at in ranges if at.editable]
    if not editable:
        return False
    covered = bytearray(n)
    anchors: dict[int, list[str]] = {}
    tail: list[str] = []
    for e in sorted(edits, key=lambda e: e.start):
        for p in range(max(0, e.start), min(n, e.end)):
            covered[p] = 1
        anchor = None
        for a, b, _ in editable:
            if b > a and b > e.start:
                anchor = max(a, e.start)
                break
        if anchor is None or anchor >= n:
            tail.append(e.text)
        else:
            anchors.setdefault(anchor, []).append(e.text)
    changed = False
    for a, b, atom in editable:
        if b <= a:
            continue
        if not any(covered[a:b]) and not any(a <= k < b for k in anchors):
            continue
        out = []
        for p in range(a, b):
            if p in anchors:
                out.extend(anchors[p])
            if not covered[p]:
                out.append(full[p])
        atom.set("".join(out))
        changed = True
    if tail:
        last = editable[-1][2]
        current = last.elem.get(last.attr) if last.attr else (last.elem.text or "")
        last.set(current + "".join(tail))
        changed = True
    return changed


def paragraph_units(root: etree._Element, container: str, editable_tags: set[str],
                    fixed: dict[str, str]) -> list[Unit]:
    """Un'unità per ogni elemento `container` (es. w:p, x:si), con i soli atomi il cui
    contenitore più vicino è quello (i paragrafi annidati nelle caselle di testo
    diventano unità a sé)."""
    units = []
    for cont in root.iter(container):
        u = Unit()
        for el in cont.iter():
            if el is cont or not isinstance(el.tag, str):
                continue
            if el.tag in editable_tags or el.tag in fixed:
                # salta gli atomi che appartengono a un contenitore annidato
                anc = el.getparent()
                while anc is not None and anc is not cont and anc.tag != container:
                    anc = anc.getparent()
                if anc is not cont:
                    continue
                if el.tag in editable_tags:
                    u.atoms.append(Atom(el.text or "", True, el))
                else:
                    u.atoms.append(Atom(fixed[el.tag], False, el))
        if u.atoms:
            units.append(u)
    return units


def element_units(root: etree._Element, tags: Iterable[str]) -> list[Unit]:
    tags = set(tags)
    return [Unit([Atom(el.text or "", True, el)]) for el in root.iter()
            if isinstance(el.tag, str) and el.tag in tags and (el.text or "").strip()]


def attribute_units(root: etree._Element, local_names: set[str]) -> list[Unit]:
    out = []
    for el in root.iter():
        if not isinstance(el.tag, str):
            continue
        for k, v in el.attrib.items():
            local = k.rsplit("}", 1)[-1]
            if local in local_names and v.strip():
                out.append(Unit([Atom(v, True, el, attr=k)]))
    return out


# --------------------------------------------------------------------------- #
# Pacchetto zip
# --------------------------------------------------------------------------- #
class Package:
    def __init__(self, data: bytes):
        try:
            self._zip = zipfile.ZipFile(io.BytesIO(data))
        except zipfile.BadZipFile as e:
            raise BadRequest("File Office non valido o danneggiato.", code="invalid_file") from e
        infos = self._zip.infolist()
        if len(infos) > MAX_ENTRIES or sum(i.file_size for i in infos) > MAX_UNCOMPRESSED:
            raise BadRequest("File Office troppo grande una volta decompresso.", code="invalid_file")
        self.infos = infos
        self.names = [i.filename for i in infos]
        self.trees: dict[str, etree._ElementTree] = {}
        self.modified: set[str] = set()
        self.removed: set[str] = set()
        self.has_decl: dict[str, bool] = {}
        self.replaced: dict[str, bytes] = {}  # parti binarie sostituite (es. .xlsx incorporati)

    def read(self, name: str) -> bytes:
        return self._zip.read(name)

    def tree(self, name: str) -> etree._ElementTree:
        if name not in self.trees:
            raw = self._zip.read(name)
            self.has_decl[name] = raw.lstrip(b"\xef\xbb\xbf").startswith(b"<?xml")
            self.trees[name] = etree.parse(io.BytesIO(raw), _PARSER)
        return self.trees[name]

    def save(self) -> bytes:
        out = io.BytesIO()
        with zipfile.ZipFile(out, "w") as z:
            for info in self.infos:
                if info.filename in self.removed:
                    continue
                if info.filename in self.replaced:
                    zi = zipfile.ZipInfo(info.filename, date_time=info.date_time)
                    zi.compress_type = zipfile.ZIP_DEFLATED
                    z.writestr(zi, self.replaced[info.filename])
                elif info.filename in self.modified:
                    t = self.trees[info.filename]
                    data = etree.tostring(t, xml_declaration=self.has_decl.get(info.filename, True),
                                          encoding=t.docinfo.encoding or "UTF-8",
                                          standalone=t.docinfo.standalone)
                    zi = zipfile.ZipInfo(info.filename, date_time=info.date_time)
                    zi.compress_type = zipfile.ZIP_DEFLATED
                    zi.external_attr = info.external_attr
                    z.writestr(zi, data)
                else:
                    z.writestr(info, self._zip.read(info.filename))
        return out.getvalue()


@dataclass
class PartUnits:
    part: str
    units: list[Unit]


def process_package(pkg: Package, collected: list[PartUnits],
                    transform: Callable[[list[str]], list[list[Edit]]]) -> bool:
    """Chiama `transform` UNA volta con tutti i testi; applica le modifiche restituite."""
    flat: list[tuple[str, Unit]] = [(pu.part, u) for pu in collected for u in pu.units]
    if not flat:
        return False
    edits = transform([u.text for _, u in flat])
    changed = False
    for (part, unit), ed in zip(flat, edits, strict=False):
        if ed and rewrite_unit(unit, ed):
            pkg.modified.add(part)
            changed = True
    return changed
