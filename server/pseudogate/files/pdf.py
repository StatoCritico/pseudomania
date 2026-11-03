# SPDX-License-Identifier: AGPL-3.0-or-later
"""PDF: rilevamento con Rizzo-PII (/analyze sul file: stessa estrazione del testo di
/pdf), redazione vera con il modulo pdf_export di Rizzo-PII (vendorizzato, MIT) ma con
i segnaposto stabili per scope di Pseudomania al posto della numerazione per documento.

Richiede PyMuPDF; se manca, i PDF vengono bloccati con un messaggio chiaro."""

from __future__ import annotations

import logging

log = logging.getLogger("pseudogate.pdf")

try:  # PyMuPDF è una dipendenza dell'immagine Docker; nei test può mancare
    import fitz  # noqa: F401

    from ..vendor.rizzo_pdf import pdf_export
    HAVE_PYMUPDF = True
except Exception:  # pragma: no cover - dipende dall'ambiente
    pdf_export = None
    HAVE_PYMUPDF = False


class PdfProblem(Exception):
    """Il PDF non può essere pseudonimizzato in sicurezza: messaggio per l'utente."""


def redact(data: bytes, tag_to_value: dict[str, str]) -> bytes:
    if not HAVE_PYMUPDF:
        raise PdfProblem("Il supporto PDF non è installato su questo server.")
    if not tag_to_value:
        return data
    try:
        out, report = pdf_export.redact_pdf(data, tag_to_value)
    except pdf_export.PdfError as e:
        raise PdfProblem(str(e)) from e
    if report.get("residual"):
        log.warning("PDF: %d valori ancora leggibili dopo la redazione", len(report["residual"]))
        raise PdfProblem("Alcuni dati personali sarebbero rimasti leggibili nel PDF (ad esempio "
                         "in livelli di testo nascosti): il file non è stato inviato. Convertilo "
                         "in DOCX o in testo e riprova.")
    if report.get("occurrences", 0) == 0 and report.get("not_found"):
        raise PdfProblem("Non è stato possibile localizzare i dati personali nel PDF (forse è una "
                         "scansione): il file non è stato inviato.")
    return out


def restore(data: bytes, tag_to_value: dict[str, str]) -> bytes:
    """Sostituisce i segnaposto nel layer di testo del PDF con i valori reali.
    Best effort: se il valore non entra nello spazio del segnaposto il testo viene
    rimpicciolito fino a 4 pt."""
    if not HAVE_PYMUPDF:
        raise PdfProblem("Il supporto PDF non è installato su questo server.")
    import fitz as _fitz

    doc = _fitz.open(stream=data, filetype="pdf")
    try:
        if doc.needs_pass:
            raise PdfProblem("PDF protetto da password.")
        changed = False
        for page in doc:
            found = False
            for tag, value in tag_to_value.items():
                for rect in page.search_for(tag):
                    fs = pdf_export._fit_fontsize(value, rect) or 4
                    pdf_export._add_redact_annot(page, rect, value, fs, (1, 1, 1), (0, 0, 0))
                    found = True
            if found:
                page.apply_redactions()
                changed = True
        return doc.tobytes(garbage=3, deflate=True) if changed else data
    finally:
        doc.close()
