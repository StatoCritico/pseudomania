# SPDX-License-Identifier: AGPL-3.0-or-later
"""Ripristino dei PDF scaricati (Server edition): riga per riga, senza sovrapposizioni.
Dati sintetici."""

import pytest

fitz = pytest.importorskip("fitz")

from pseudogate.files import pdf as pdf_files  # noqa: E402

MAPPA = {"[FULLNAME_1]": "Mario Rossi", "[IBAN_1]": "IT60X0542811101000000123456", "[CF_1]": "RSSMRA80A01H501U"}


def _pdf():
    doc = fitz.open()
    p = doc.new_page()
    p.insert_text((72, 100), "Gentile [FULLNAME_1],", fontsize=11)
    p.insert_text((72, 120), "accrediteremo l'importo sull'IBAN [IBAN_1].", fontsize=11)
    p.insert_text((72, 140), "Codice fiscale: [CF_1]. Riferimento [DOCID_9].", fontsize=11)
    return doc.tobytes()


def _testo(data):
    with fitz.open(stream=data, filetype="pdf") as d:
        return "\n".join(pg.get_text() for pg in d)


def test_ripristino_riga_per_riga():
    txt = _testo(pdf_files.restore(_pdf(), MAPPA))
    assert "Gentile Mario Rossi," in txt
    assert "IT60X0542811101000000123456" in txt
    assert "Codice fiscale: RSSMRA80A01H501U. Riferimento [DOCID_9]." in txt
    for ph in MAPPA:
        assert ph not in txt


def test_dizionario_vuoto_restituisce_il_file():
    data = _pdf()
    assert pdf_files.restore(data, {}) == data
