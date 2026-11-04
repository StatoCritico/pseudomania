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
    """Sostituisce i segnaposto nel PDF con i valori reali, impaginazione conservata.

    Riga per riga (pdf_export.restore_pdf): ogni riga con un segnaposto viene rimossa dal
    content stream e riscritta nella stessa posizione, così un valore più lungo del
    segnaposto (un IBAN al posto di [IBAN_1]) sposta il resto della riga invece di
    sovrapporsi al testo che segue."""
    if not HAVE_PYMUPDF:
        raise PdfProblem("Il supporto PDF non è installato su questo server.")
    if not tag_to_value:
        return data
    try:
        out, report = pdf_export.restore_pdf(data, tag_to_value)
    except pdf_export.PdfError as e:
        raise PdfProblem(str(e)) from e
    if report.get("shrunk"):
        log.info("PDF ripristinato: %d righe con corpo ridotto per starci", report["shrunk"])
    return out
