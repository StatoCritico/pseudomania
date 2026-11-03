# SPDX-License-Identifier: AGPL-3.0-or-later
"""Client di Rizzo-PII (https://github.com/Rizzo-AI-Academy/rizzo-pii).

Formato verificato sul sorgente (src/app/app.py, commit 9057eeff):

POST /analyze  JSON {"text": str, "exclude_tags": [str], "include_mapping": bool}
               oppure multipart con il file nel campo "file" (o "pdf") + campi form
               "exclude_tags" (CSV) e "include_mapping".
  200 -> {"segments": [{"t": str} | {"label", "ph", "src", "validated", "t"?}],
          "anonymized_text", "mapping": {ph: valore}, "mapping_enabled",
          "n_chunks", "n_chars", "n_entities", "n_unique", "by_label", "by_source",
          "excluded_tags", "source_text"?}
  400 -> {"error": str}  (testo vuoto, formato non supportato, PDF protetto)
  NB: Rizzo applica text.strip() prima dell'analisi: gli offset dei segmenti sono
  relativi al testo senza spazi iniziali. Il valore "t" dei segmenti-entità c'è solo
  con include_mapping=true; "source_text" (testo estratto) solo con include_mapping.
GET /health -> 200 {"status":"ok", "model_loaded": true, ...} | 503 durante il caricamento.

La numerazione dei segnaposto di Rizzo ([FULLNAME_1]...) è per singola richiesta:
Pseudomania la ignora e assegna i propri tag stabili per scope (vedi dictionary.py).
"""

from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass

import httpx

from .errors import BadRequest, DetectorUnavailable

log = logging.getLogger("pseudogate.detector")


@dataclass(frozen=True)
class Detection:
    start: int
    end: int
    label: str
    value: str


@dataclass
class AnalyzeResult:
    text: str  # testo analizzato (per i file: testo estratto da Rizzo)
    detections: list[Detection]


def _segments_to_detections(segments: list[dict], stripped: str, offset: int) -> list[Detection]:
    """Ricostruisce gli offset dai segmenti (che coprono tutto il testo, in ordine)."""
    out: list[Detection] = []
    pos = 0
    consistent = True
    for seg in segments:
        t = seg.get("t")
        if "label" in seg:
            if t is None:
                raise DetectorUnavailable("Il rilevatore non ha restituito i valori delle entità "
                                          "(include_mapping disattivato?).")
            if stripped[pos:pos + len(t)] != t:
                consistent = False
                break
            out.append(Detection(offset + pos, offset + pos + len(t), seg["label"], t))
        elif t is not None and stripped[pos:pos + len(t)] != t:
            consistent = False
            break
        pos += len(t or "")
    if consistent and pos == len(stripped):
        return out
    # Fallback prudente: ricerca sequenziale dei valori nel testo.
    log.warning("Segmenti di Rizzo non allineati al testo: uso la ricerca sequenziale")
    out, cursor = [], 0
    for seg in segments:
        if "label" not in seg:
            continue
        t = seg.get("t") or ""
        i = stripped.find(t, cursor)
        if i < 0:
            i = stripped.find(t)
        if i < 0:
            continue
        out.append(Detection(offset + i, offset + i + len(t), seg["label"], t))
        cursor = i + len(t)
    return out


class RizzoClient:
    def __init__(self, base_url: str, *, timeout: float = 600.0, exclude_tags: list[str] | None = None,
                 batch_chars: int = 200_000, transport: httpx.BaseTransport | None = None):
        self._client = httpx.Client(base_url=base_url, transport=transport,
                                    timeout=httpx.Timeout(timeout, connect=5.0))
        self._exclude = list(exclude_tags or [])
        self._batch_chars = batch_chars
        self._health_cache: tuple[float, bool] = (0.0, False)
        self._lock = threading.Lock()

    # -- salute ---------------------------------------------------------------
    def healthy(self, max_age_s: float = 5.0) -> bool:
        with self._lock:
            ts, ok = self._health_cache
            if time.monotonic() - ts < max_age_s:
                return ok
        try:
            r = self._client.get("/health", timeout=3.0)
            ok = r.status_code == 200
        except httpx.HTTPError:
            ok = False
        with self._lock:
            self._health_cache = (time.monotonic(), ok)
        return ok

    def _handle(self, r: httpx.Response) -> dict:
        if r.status_code == 200:
            return r.json()
        try:
            msg = r.json().get("error") or ""
        except ValueError:
            msg = ""
        if r.status_code in (400, 422):
            raise BadRequest(msg or "Il rilevatore ha rifiutato il contenuto.", code="detector_rejected")
        log.error("Rizzo-PII ha risposto HTTP %s", r.status_code)
        raise DetectorUnavailable()

    # -- testo ----------------------------------------------------------------
    def analyze_text(self, text: str) -> list[Detection]:
        """Entità nel testo, con offset riferiti a `text` (originale, non strippato)."""
        if not text.strip():
            return []
        if len(text) <= self._batch_chars:
            return self._analyze_one(text, 0)
        # testi molto lunghi: blocchi spezzati su un a-capo/spazio
        out: list[Detection] = []
        start = 0
        while start < len(text):
            end = min(len(text), start + self._batch_chars)
            if end < len(text):
                cut = max(text.rfind("\n", start, end), text.rfind(" ", start, end))
                if cut > start:
                    end = cut
            out.extend(self._analyze_one(text[start:end], start))
            start = end
        return out

    def _analyze_one(self, text: str, base: int) -> list[Detection]:
        if not text.strip():
            return []
        lead = len(text) - len(text.lstrip())
        try:
            r = self._client.post("/analyze", json={
                "text": text, "exclude_tags": self._exclude, "include_mapping": True})
        except httpx.HTTPError as e:
            raise DetectorUnavailable() from e
        data = self._handle(r)
        stripped = text.strip()
        return _segments_to_detections(data.get("segments") or [], stripped, base + lead)

    # -- file (PDF) -------------------------------------------------------------
    def analyze_file(self, filename: str, content: bytes, mime: str) -> AnalyzeResult:
        """Estrazione testo + rilevamento fatti da Rizzo (usato per i PDF)."""
        try:
            r = self._client.post(
                "/analyze",
                files={"file": (filename, content, mime)},
                data={"exclude_tags": ",".join(self._exclude), "include_mapping": "true"},
            )
        except httpx.HTTPError as e:
            raise DetectorUnavailable() from e
        data = self._handle(r)
        source = data.get("source_text")
        if source is None:
            source = "".join(s.get("t", "") for s in data.get("segments") or [])
        return AnalyzeResult(text=source, detections=_segments_to_detections(
            data.get("segments") or [], source, 0))
