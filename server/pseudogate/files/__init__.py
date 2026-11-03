# SPDX-License-Identifier: AGPL-3.0-or-later
"""Riconoscimento del formato e trattamento dei file (pdf, docx, xlsx, txt, md, csv)."""

from __future__ import annotations

import os
from dataclasses import dataclass

from .office import detect_office_kind

MIME = {
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "txt": "text/plain; charset=utf-8",
    "md": "text/markdown; charset=utf-8",
    "csv": "text/csv; charset=utf-8",
}
TEXT_EXT = {".txt": "txt", ".text": "txt", ".md": "md", ".markdown": "md", ".csv": "csv"}


@dataclass
class FileKind:
    kind: str | None  # pdf | docx | xlsx | txt | md | csv | None (non supportato)
    reason: str | None = None


def detect_kind(filename: str, data: bytes) -> FileKind:
    ext = os.path.splitext(filename or "")[1].lower()
    if data[:5] == b"%PDF-":
        return FileKind("pdf")
    if data[:4] == b"PK\x03\x04":
        k = detect_office_kind(data)
        if k:
            return FileKind(k)
        return FileKind(None, "Formato non supportato: sono accettati PDF, DOCX, XLSX, TXT, MD e "
                              "CSV (i file con macro, .docm/.xlsm, e gli archivi .zip non sono ammessi).")
    if ext in TEXT_EXT:
        if b"\x00" in data[:4096] and data[:2] not in (b"\xff\xfe", b"\xfe\xff"):
            return FileKind(None, "Il file di testo sembra binario: non può essere pseudonimizzato.")
        return FileKind(TEXT_EXT[ext])
    if ext in (".doc", ".xls", ".ppt", ".pptx", ".odt", ".ods", ".rtf"):
        return FileKind(None, f"Il formato {ext} non è supportato: salva il file come DOCX, XLSX "
                              "o PDF e riprova.")
    if ext in (".png", ".jpg", ".jpeg", ".gif", ".webp", ".heic", ".tif", ".tiff", ".bmp"):
        return FileKind(None, "Le immagini non sono ammesse: il testo contenuto in un'immagine "
                              "non può essere pseudonimizzato.")
    return FileKind(None, "Formato non supportato: sono accettati PDF, DOCX, XLSX, TXT, MD e CSV.")


@dataclass
class DecodedText:
    text: str
    encoding: str
    bom: bytes


def decode_text(data: bytes) -> DecodedText:
    """Come Rizzo-PII: UTF-16 solo con BOM, poi UTF-8, cp1252, latin-1."""
    if data[:3] == b"\xef\xbb\xbf":
        return DecodedText(data[3:].decode("utf-8"), "utf-8", b"\xef\xbb\xbf")
    if data[:2] in (b"\xff\xfe", b"\xfe\xff"):
        return DecodedText(data.decode("utf-16"), "utf-16", b"")
    for enc in ("utf-8", "cp1252", "latin-1"):
        try:
            return DecodedText(data.decode(enc), enc, b"")
        except UnicodeDecodeError:
            continue
    raise ValueError("decodifica impossibile")  # pragma: no cover - latin-1 decodifica tutto


def encode_text(dt: DecodedText, text: str) -> bytes:
    try:
        return dt.bom + text.encode(dt.encoding)
    except UnicodeEncodeError:
        return b"\xef\xbb\xbf" + text.encode("utf-8")
