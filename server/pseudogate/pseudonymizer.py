# SPDX-License-Identifier: AGPL-3.0-or-later
"""Pipeline: rilevamento (Rizzo-PII) -> allowlist -> tag stabili per scope -> sostituzione;
e il percorso inverso (ripristino dei valori dai tag)."""

from __future__ import annotations

import bisect
import re
from collections import Counter
from dataclasses import dataclass

from .detector import Detection, RizzoClient
from .dictionary import DictionaryStore, Scope
from .policy import Allowlist, normalize

# Tag come li scrive Claude, tollerando l'escape Markdown: \[FULLNAME\_1\]
TAG_RX = re.compile(r"\\?\[([A-Z][A-Z]*(?:\\?_[A-Z]+)*)\\?_(\d{1,6})\\?\]")
# Separatore fra frammenti (celle, paragrafi) inviati in un'unica analisi: il carattere
# "|" impedisce alle regex di Rizzo (che ammettono spazi e a-capo, es. "protocollo\s*\d+")
# di unire il contenuto di celle diverse in un'unica entità.
UNIT_SEP = "\n\n|\n\n"


def canonical_tag(raw: str) -> str:
    return raw.replace("\\", "")


@dataclass
class Replacement:
    start: int
    end: int
    tag: str
    type: str
    value: str = ""            # valore originale: resta in memoria, solo per newEntries
    needs_upload: bool = False  # voce senza ciphertext: l'estensione deve cifrarla e caricarla


def _clean(detections: list[Detection]) -> list[Detection]:
    """Ordina e scarta sovrapposizioni residue (vince la più lunga)."""
    out: list[Detection] = []
    for d in sorted(detections, key=lambda d: (d.start, -(d.end - d.start))):
        if d.end <= d.start:
            continue
        if out and d.start < out[-1].end:
            continue
        out.append(d)
    return out


def apply_replacements(text: str, reps: list[Replacement]) -> str:
    parts, pos = [], 0
    for r in sorted(reps, key=lambda r: r.start):
        parts.append(text[pos:r.start])
        parts.append(r.tag)
        pos = r.end
    parts.append(text[pos:])
    return "".join(parts)


class Pseudonymizer:
    def __init__(self, detector: RizzoClient, allowlist: Allowlist, store: DictionaryStore):
        self.detector = detector
        self.allowlist = allowlist
        self.store = store

    # ------------------------------------------------------------- rilevamento
    def detect(self, text: str) -> list[Detection]:
        return _clean(self.allowlist.filter(text, self.detector.analyze_text(text)))

    def detect_from(self, text: str, detections: list[Detection]) -> list[Detection]:
        """Applica allowlist e pulizia a rilevamenti già ottenuti (es. PDF)."""
        return _clean(self.allowlist.filter(text, detections))

    def detect_units(self, units: list[str]) -> list[list[Detection]]:
        """Rileva su più frammenti (paragrafi, celle...) con UNA chiamata al rilevatore."""
        joined, offsets, pos = [], [], 0
        for u in units:
            offsets.append(pos)
            joined.append(u)
            pos += len(u) + len(UNIT_SEP)
        big = UNIT_SEP.join(joined)
        found = self.detect(big)
        per_unit: list[list[Detection]] = [[] for _ in units]
        if not found:
            return per_unit
        for d in found:
            i = bisect.bisect_right(offsets, d.start) - 1
            # un'entità può attraversare il separatore: la si spezza per frammento
            while i < len(units) and offsets[i] < d.end:
                u_start, u_end = offsets[i], offsets[i] + len(units[i])
                s, e = max(d.start, u_start), min(d.end, u_end)
                if e > s:
                    val = big[s:e]
                    if val.strip():
                        lead = len(val) - len(val.lstrip())
                        trail = len(val) - len(val.rstrip())
                        per_unit[i].append(Detection(s - u_start + lead, e - u_start - trail,
                                                     d.label, val.strip()))
                i += 1
        # allowlist anche sul singolo frammento (es. cella "Ufficio Protocollo")
        return [_clean(self.allowlist.filter(u, dets)) if dets else dets
                for u, dets in zip(units, per_unit, strict=True)]

    # ---------------------------------------------------------------- tagging
    def assign(self, owner: str, scope: Scope, detections: list[Detection]) -> list[Replacement]:
        mapping = self.store.assign(owner, scope, [(d.label, d.value) for d in detections])
        reps = []
        for d in detections:
            a = mapping[normalize(d.value)]
            reps.append(Replacement(d.start, d.end, a.tag, a.type, d.value, a.needs_upload))
        return reps

    def pseudonymize_text(self, owner: str, scope: Scope, text: str,
                          detections: list[Detection] | None = None):
        dets = self.detect(text) if detections is None else detections
        reps = self.assign(owner, scope, dets) if dets else []
        return apply_replacements(text, reps), reps

    def pseudonymize_units(self, owner: str, scope: Scope, units: list[str]):
        """-> (lista di liste di Replacement per frammento)."""
        per_unit = self.detect_units(units)
        flat = [d for dets in per_unit for d in dets]
        if not flat:
            return [[] for _ in units]
        mapping = self.store.assign(owner, scope, [(d.label, d.value) for d in flat])
        out = []
        for dets in per_unit:
            reps = []
            for d in dets:
                a = mapping[normalize(d.value)]
                reps.append(Replacement(d.start, d.end, a.tag, a.type, d.value, a.needs_upload))
            out.append(reps)
        return out

    # -------------------------------------------------------------- ripristino
    @staticmethod
    def find_tags(text: str, entries: dict[str, str]) -> tuple[list[Replacement], list[str]]:
        reps, unknown = [], []
        for m in TAG_RX.finditer(text):
            tag = canonical_tag(m.group(0))
            if tag in entries:
                reps.append(Replacement(m.start(), m.end(), entries[tag], tag))
            elif tag not in unknown:
                unknown.append(tag)
        return reps, unknown

    @classmethod
    def reidentify_text(cls, text: str, entries: dict[str, str]) -> tuple[str, list[str]]:
        reps, unknown = cls.find_tags(text, entries)
        return apply_replacements(text, reps), unknown


def entity_counts(reps: list[Replacement]) -> dict[str, int]:
    return dict(Counter(r.type for r in reps))


def new_entries(reps: list[Replacement]) -> list[dict]:
    """[{tag, value}] per le sole voci ancora senza ciphertext (DECISIONI.md): il valore in
    chiaro esce solo in questa risposta all'utente che lo ha appena inviato."""
    seen, out = set(), []
    for r in reps:
        if r.needs_upload and r.tag not in seen:
            seen.add(r.tag)
            out.append({"tag": r.tag, "value": r.value.strip()})
    return out


def unique_entities(reps: list[Replacement]) -> list[dict]:
    seen, out = set(), []
    for r in reps:
        if r.tag not in seen:
            seen.add(r.tag)
            out.append({"tag": r.tag, "type": r.type})
    return out
