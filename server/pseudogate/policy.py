# SPDX-License-Identifier: AGPL-3.0-or-later
"""Allowlist (termini mai mascherati) e filtro categorie particolari (artt. 9-10 GDPR)."""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path

import yaml

from .detector import Detection


def normalize(value: str) -> str:
    """Normalizzazione dei valori (SPEC: trim + case-fold; spazi compressi come Rizzo-PII)."""
    return re.sub(r"\s+", " ", unicodedata.normalize("NFC", value).strip()).casefold()


def _pattern(p: str) -> str:
    """Le regex vengono unite in alternativa e compilate con IGNORECASE: un flag
    globale iniziale "(?i)" va tolto, altrimenti Python lo rifiuta a metà espressione."""
    p = p.strip()
    return f"(?:{p[4:] if p.startswith('(?i)') else p})"


def _term_regex(term: str) -> str:
    """Termine -> regex a confini di parola; '*' finale = prefisso (es. 'sieropositiv*')."""
    prefix = term.endswith("*")
    core = term[:-1] if prefix else term
    parts = [re.escape(p) for p in core.split()]
    body = r"\s+".join(parts)
    return r"(?<!\w)" + body + (r"\w*" if prefix else r"(?!\w)")


# --------------------------------------------------------------------------- #
# Allowlist
# --------------------------------------------------------------------------- #
@dataclass
class Allowlist:
    version: str = "0"
    terms: list[str] = field(default_factory=list)
    patterns: list[str] = field(default_factory=list)
    never_mask_types: list[str] = field(default_factory=list)

    def __post_init__(self):
        self._norm = {normalize(t) for t in self.terms}
        alts = [_term_regex(t) for t in self.terms] + [_pattern(p) for p in self.patterns]
        self._rx = re.compile("|".join(alts), re.IGNORECASE) if alts else None
        self._types = {t.upper() for t in self.never_mask_types}

    @classmethod
    def load(cls, path: str) -> "Allowlist":
        p = Path(path)
        if not p.is_file():
            return cls()
        data = yaml.safe_load(p.read_text(encoding="utf-8")) or {}
        return cls(version=str(data.get("version", "0")),
                   terms=[str(t) for t in data.get("terms") or []],
                   patterns=[str(t) for t in data.get("patterns") or []],
                   never_mask_types=[str(t) for t in data.get("never_mask_types") or []])

    def filter(self, text: str, detections: list[Detection]) -> list[Detection]:
        """Scarta le entità il cui valore è in allowlist o che cadono dentro un termine
        in allowlist (es. 'Roma' dentro 'Comune di Roma')."""
        if not detections:
            return detections
        spans = [(m.start(), m.end()) for m in self._rx.finditer(text)] if self._rx else []
        kept = []
        for d in detections:
            if d.label.upper() in self._types:
                continue
            if normalize(d.value) in self._norm:
                continue
            if any(s <= d.start and d.end <= e for s, e in spans):
                continue
            kept.append(d)
        return kept


# --------------------------------------------------------------------------- #
# Categorie particolari
# --------------------------------------------------------------------------- #
@dataclass
class SpecialCategory:
    id: str
    article: str
    label: str
    action: str
    regex: re.Pattern | None


@dataclass
class SpecialMatch:
    category: str
    article: str
    label: str
    term: str
    action: str


DEFAULT_MESSAGE = ("Il contenuto sembra includere {label} (art. {article} GDPR), "
                   "ad esempio «{term}». Per le regole dell'ente questi dati non possono "
                   "essere inviati a un servizio di IA esterno, nemmeno pseudonimizzati. "
                   "Rimuovi o generalizza questi riferimenti e riprova. Se pensi che il "
                   "blocco sia sbagliato, segnalalo con il pulsante «Segnala blocco errato» "
                   "nel pannello laterale di Pseudomania.")


class SpecialCategoryFilter:
    def __init__(self, version: str, categories: list[SpecialCategory], message: str,
                 enabled: bool = True):
        self.version = version
        self.categories = categories
        self.message = message or DEFAULT_MESSAGE
        self.enabled = enabled

    @classmethod
    def load(cls, path: str, enabled: bool = True) -> "SpecialCategoryFilter":
        p = Path(path)
        if not p.is_file():
            return cls("0", [], DEFAULT_MESSAGE, enabled=False)
        data = yaml.safe_load(p.read_text(encoding="utf-8")) or {}
        cats = []
        for c in data.get("categories") or []:
            if c.get("enabled", True) is False:
                continue
            alts = [_term_regex(str(t)) for t in c.get("terms") or []]
            alts += [_pattern(str(p)) for p in c.get("patterns") or []]
            rx = re.compile("|".join(alts), re.IGNORECASE) if alts else None
            cats.append(SpecialCategory(id=str(c["id"]), article=str(c.get("article", "9")),
                                        label=str(c.get("label", c["id"])),
                                        action=str(c.get("action", "block")), regex=rx))
        return cls(str(data.get("version", "0")), cats, str(data.get("message") or ""), enabled)

    def scan(self, text: str) -> list[SpecialMatch]:
        if not self.enabled or not text:
            return []
        found = []
        for c in self.categories:
            if c.regex is None:
                continue
            m = c.regex.search(text)
            if m:
                found.append(SpecialMatch(c.id, c.article, c.label, m.group(0), c.action))
        return found

    def first_block(self, text: str) -> SpecialMatch | None:
        return next((m for m in self.scan(text) if m.action == "block"), None)

    def reason(self, m: SpecialMatch) -> str:
        term = m.term if len(m.term) <= 60 else m.term[:57] + "..."
        return self.message.format(label=m.label, article=m.article, term=term)
