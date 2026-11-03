# SPDX-License-Identifier: AGPL-3.0-or-later
"""Finto Rizzo-PII per i test: stesso formato di risposta di /analyze (segmenti,
text.strip(), include_mapping), rilevamento con poche regex deterministiche."""

from __future__ import annotations

import json
import re

import httpx

PATTERNS = [
    ("FULLNAME", re.compile(r"\b(?:Mario Rossi|Giulia Bianchi|Luca Verdi|Anna Neri)\b", re.I)),
    ("EMAIL", re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.]+\b")),
    ("CF", re.compile(r"\b[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]\b")),
    ("ORG", re.compile(r"\bComune di Esempio\b|\bEdilnord S\.r\.l\.")),
    ("CITY", re.compile(r"\b(?:Torino|Napoli)\b")),
    ("TELEPHONENUM", re.compile(r"\+39 ?\d{3} ?\d{6,7}")),
    # come la regex DOCID di Rizzo: ammette spazi e a-capo fra sigla e numero
    ("DOCID", re.compile(r"\b(?:Prot\.?|protocollo)(?:\s*n\.?)?\s*\d{1,8}(?:/\d{2,4})?\b", re.I)),
]


def analyze(text: str) -> dict:
    stripped = text.strip()
    found = []
    for label, rx in PATTERNS:
        for m in rx.finditer(stripped):
            if any(m.start() < e and s < m.end() for s, e, _ in found):
                continue
            found.append((m.start(), m.end(), label))
    found.sort()
    segments, pos, counters, seen, mapping = [], 0, {}, {}, {}
    for s, e, label in found:
        if s > pos:
            segments.append({"t": stripped[pos:s]})
        val = stripped[s:e]
        key = (label, val.casefold())
        if key not in seen:
            counters[label] = counters.get(label, 0) + 1
            seen[key] = f"[{label}_{counters[label]}]"
            mapping[seen[key]] = val
        segments.append({"label": label, "ph": seen[key], "src": "regex", "validated": False,
                         "t": val})
        pos = e
    if pos < len(stripped):
        segments.append({"t": stripped[pos:]})
    return {"segments": segments, "mapping": mapping, "mapping_enabled": True,
            "n_entities": len(found), "source_text": stripped,
            "anonymized_text": "".join(s.get("ph", s.get("t", "")) if "label" in s else s["t"]
                                       for s in segments)}


class FakeRizzo:
    def __init__(self):
        self.calls = 0
        self.down = False

    def handler(self, request: httpx.Request) -> httpx.Response:
        if self.down:
            raise httpx.ConnectError("down", request=request)
        if request.url.path == "/health":
            return httpx.Response(200, json={"status": "ok", "model_loaded": True})
        if request.url.path == "/analyze":
            self.calls += 1
            ctype = request.headers.get("content-type", "")
            if ctype.startswith("application/json"):
                payload = json.loads(request.content)
                assert payload.get("include_mapping") is True
                text = payload.get("text", "")
            else:
                body = request.content
                # estrazione minimale del file dal multipart (solo testo)
                m = re.search(rb'name="file"; filename="[^"]*"\r\nContent-Type: [^\r]*\r\n\r\n(.*?)\r\n--',
                              body, re.S)
                text = m.group(1).decode("utf-8") if m else ""
            if not text.strip():
                return httpx.Response(400, json={"error": "Nessun testo da analizzare."})
            return httpx.Response(200, json=analyze(text))
        return httpx.Response(404, json={"error": "not found"})

    def transport(self) -> httpx.MockTransport:
        return httpx.MockTransport(self.handler)
