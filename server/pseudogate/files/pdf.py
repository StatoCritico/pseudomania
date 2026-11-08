# SPDX-License-Identifier: AGPL-3.0-or-later
"""PDF: rilevamento con Rizzo-PII (/analyze sul file: stessa estrazione del testo di
/pdf), redazione vera con il modulo pdf_export di Rizzo-PII (vendorizzato, MIT) ma con
i segnaposto stabili per scope di Pseudomania al posto della numerazione per documento.

Richiede PyMuPDF; se manca, i PDF vengono bloccati con un messaggio chiaro."""

from __future__ import annotations

import logging
import re

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


def _is_sig_field(doc, xref: int) -> bool:
    """Campo firma: /FT /Sig sul widget o su un antenato (/Parent)."""
    seen = set()
    while xref and xref not in seen:
        seen.add(xref)
        ft = doc.xref_get_key(xref, "FT")
        if ft[0] == "name":
            return ft[1] == "/Sig"
        par = doc.xref_get_key(xref, "Parent")
        if par[0] != "xref":
            return False
        xref = int(par[1].split()[0])
    return False


def _strip_fields(doc, container_xref: int, key: str) -> int:
    """Toglie dall'array `key` (es. /Fields, /Kids) i campi firma, ricorsivamente."""
    t, val = doc.xref_get_key(container_xref, key)
    if t != "array":
        return 0
    refs = [int(x) for x in re.findall(r"(\d+)\s+0\s+R", val)]
    keep, removed = [], 0
    for x in refs:
        if _is_sig_field(doc, x):
            removed += 1
            continue
        removed += _strip_fields(doc, x, "Kids")
        keep.append(x)
    if removed:
        doc.xref_set_key(container_xref, key, "[" + " ".join(f"{x} 0 R" for x in keep) + "]")
    return removed


def strip_signatures(data: bytes) -> tuple[bytes, int]:
    """Toglie le firme digitali (non trattate da pdf_export di Rizzo-PII).

    Un PDF firmato contiene nel dizionario /Sig il certificato del firmatario (nome e codice
    fiscale in chiaro nel CMS di /Contents), il nome (/Name), luogo e motivo, e spesso un riquadro
    visibile con il nome che la redazione del content stream non raggiunge. Qualsiasi modifica
    invalida comunque la firma: si tolgono widget e campi firma, /SigFlags, /Perms e /DSS; gli
    oggetti /Sig rimasti senza riferimenti spariscono con garbage=3. Restituisce (byte, firme tolte)."""
    doc = fitz.open(stream=data, filetype="pdf")
    try:
        if doc.needs_pass:
            return data, 0
        removed = 0
        for page in doc:
            t, val = doc.xref_get_key(page.xref, "Annots")
            if t not in ("array", "xref"):
                continue
            if t == "xref":
                arr_xref = int(val.split()[0])
                t, val = doc.xref_get_key(arr_xref, "")[0], doc.xref_object(arr_xref)
            refs = [int(x) for x in re.findall(r"(\d+)\s+0\s+R", val)]
            keep = [x for x in refs if not (doc.xref_get_key(x, "Subtype")[1] == "/Widget" and _is_sig_field(doc, x))]
            if len(keep) != len(refs):
                removed += len(refs) - len(keep)
                doc.xref_set_key(page.xref, "Annots", "[" + " ".join(f"{x} 0 R" for x in keep) + "]")
        cat = doc.pdf_catalog()
        af = doc.xref_get_key(cat, "AcroForm")
        if af[0] == "xref":
            af_xref = int(af[1].split()[0])
            removed += _strip_fields(doc, af_xref, "Fields")
            doc.xref_set_key(af_xref, "SigFlags", "null")
        elif af[0] == "dict":
            removed += _strip_fields(doc, cat, "AcroForm/Fields")
            doc.xref_set_key(cat, "AcroForm/SigFlags", "null")
        for key in ("Perms", "DSS"):
            if doc.xref_get_key(cat, key)[0] != "null":
                doc.xref_set_key(cat, key, "null")
                removed += 1
        if not removed:
            return data, 0
        return doc.tobytes(garbage=3, deflate=True), removed
    finally:
        doc.close()


def has_signatures(data: bytes) -> bool:
    doc = fitz.open(stream=data, filetype="pdf")
    try:
        if any(w.field_type == fitz.PDF_WIDGET_TYPE_SIGNATURE for p in doc for w in p.widgets()):
            return True
        cat = doc.pdf_catalog()
        return any(doc.xref_get_key(cat, k)[0] != "null" for k in ("Perms", "DSS"))
    finally:
        doc.close()


def redact(data: bytes, tag_to_value: dict[str, str]) -> bytes:
    """Redazione del PDF. Le firme digitali vanno tolte PRIMA (strip_signatures), anche prima del
    rilevamento: main.py lo fa; qui si ripete per sicurezza e si verifica che non ne resti traccia."""
    if not HAVE_PYMUPDF:
        raise PdfProblem("Il supporto PDF non è installato su questo server.")
    data, _ = strip_signatures(data)
    if not tag_to_value:
        if has_signatures(data):
            raise PdfProblem("Non è stato possibile togliere la firma digitale dal PDF: il file non è stato inviato.")
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
    if has_signatures(out):
        raise PdfProblem("Non è stato possibile togliere la firma digitale dal PDF: il file non è stato inviato.")
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
