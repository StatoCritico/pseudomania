# SPDX-License-Identifier: AGPL-3.0-or-later
"""Test di integrazione con un Rizzo-PII reale (contenitore o processo).

Eseguito solo se RIZZO_URL è impostato, es.:
    docker compose up -d rizzo-pii   (oppure l'app desktop di Rizzo-PII su 127.0.0.1:5005)
    RIZZO_URL=http://127.0.0.1:5005 pytest tests/test_integration_rizzo.py
"""

from __future__ import annotations

import os

import pytest

from pseudogate.detector import RizzoClient

RIZZO_URL = os.environ.get("RIZZO_URL")
pytestmark = pytest.mark.skipif(not RIZZO_URL, reason="RIZZO_URL non impostato")


@pytest.fixture(scope="module")
def rizzo():
    c = RizzoClient(RIZZO_URL, timeout=120)
    if not c.healthy():
        pytest.skip("Rizzo-PII non pronto")
    return c


def test_offsets_match_original_text(rizzo):
    text = ("   Il sig. Mario Rossi, C.F. RSSMRA85H12F205Y, IBAN IT60X0542811101000000123456, "
            "email mario.rossi@example.it, tel. +39 333 1234567.")
    dets = rizzo.analyze_text(text)
    assert dets, "nessuna entità rilevata"
    for d in dets:
        assert text[d.start:d.end] == d.value
    labels = {d.label for d in dets}
    assert {"CF", "IBAN", "EMAIL"} <= labels


def test_text_file_analysis(rizzo):
    res = rizzo.analyze_file("nota.txt", "Scrivere a giulia.bianchi@example.it".encode(),
                             "text/plain")
    assert any(d.label == "EMAIL" for d in res.detections)
    for d in res.detections:
        assert res.text[d.start:d.end] == d.value


def test_empty_text_is_not_sent(rizzo):
    assert rizzo.analyze_text("   \n ") == []
