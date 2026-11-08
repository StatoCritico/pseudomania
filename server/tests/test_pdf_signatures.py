# SPDX-License-Identifier: AGPL-3.0-or-later
"""Firme digitali nei PDF: certificato, nome del firmatario e riquadro visibile non devono
arrivare al servizio di IA (la fixture è quella dell'estensione: firma finta con la stessa
struttura di una firma qualificata PAdES/CAdES)."""

import re
from pathlib import Path

import pytest

fitz = pytest.importorskip("fitz")

from pseudogate.files import pdf as pdf_files  # noqa: E402

FIX = Path(__file__).resolve().parents[2] / "extension" / "test" / "fixtures" / "pdf" / "firmato.pdf"


def _plain(data: bytes) -> str:
    doc = fitz.open(stream=data, filetype="pdf")
    parts = []
    for x in range(1, doc.xref_length()):
        obj = doc.xref_object(x)
        parts.append(obj)
        if doc.xref_is_stream(x) and "/Image" not in obj:
            parts.append((doc.xref_stream(x) or b"").decode("latin1"))
    return "".join(parts) + data.decode("latin1")


def test_strip_signatures_toglie_firma_certificato_e_riquadro():
    data = FIX.read_bytes()
    assert pdf_files.has_signatures(data)
    out, n = pdf_files.strip_signatures(data)
    assert n >= 3  # widget, campo in /Fields, /Perms, /DSS
    assert not pdf_files.has_signatures(out)
    s = _plain(out)
    for v in ("/ByteRange", "Luca Neri", "NRELCU80A01L219X", "/FT/Sig", "/FT /Sig", "/SubFilter"):
        assert v not in s, v
    # PyMuPDF lascia la chiave con valore null: conta solo che non punti più a nulla
    assert re.search(r"/(DSS|Perms|SigFlags)\s+(?!null)", s) is None
    doc = fitz.open(stream=out, filetype="pdf")
    assert "LUCA" not in doc[0].get_text()
    assert len(doc[0].get_images()) == 1  # la pagina scansionata resta


def test_redact_senza_dati_toglie_comunque_la_firma():
    out = pdf_files.redact(FIX.read_bytes(), {})
    assert not pdf_files.has_signatures(out)
    assert "NRELCU80A01L219X" not in _plain(out)


def test_pdf_senza_firma_invariato():
    doc = fitz.open()
    doc.new_page().insert_text((72, 72), "Nessuna firma")
    data = doc.tobytes()
    out, n = pdf_files.strip_signatures(data)
    assert n == 0 and out == data
