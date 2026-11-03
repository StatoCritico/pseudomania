# SPDX-License-Identifier: AGPL-3.0-or-later
from __future__ import annotations

import base64
import csv
import itertools
import json
import os
import sys
import uuid
from pathlib import Path

import pytest
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

HERE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(HERE))
import custodi  # noqa: E402
import shamir  # noqa: E402

OAEP = padding.OAEP(mgf=padding.MGF1(algorithm=hashes.SHA256()), algorithm=hashes.SHA256(), label=None)


def test_gf_field_axioms():
    for a in range(1, 256):
        assert shamir.gf_mul(a, shamir.gf_div(1, a)) == 1
    assert shamir.gf_mul(0x57, 0x83) == 0xC1  # esempio FIPS-197


@pytest.mark.parametrize("n,k", [(3, 2), (5, 3), (2, 2), (7, 7)])
def test_shamir_any_k_subset(n, k):
    secret = os.urandom(300)
    shares = shamir.split(secret, n, k)
    for subset in itertools.combinations(shares, k):
        assert shamir.combine(list(subset)) == secret
    if k > 2:
        assert shamir.combine(shares[:k - 1]) != secret


def test_shamir_rejects_bad_input():
    with pytest.raises(ValueError):
        shamir.split(b"x", 2, 3)
    with pytest.raises(ValueError):
        shamir.combine([(1, b"a"), (1, b"b")])


@pytest.fixture(scope="module")
def ceremony(tmp_path_factory):
    out = tmp_path_factory.mktemp("cerimonia")
    assert custodi.main(["genera-chiave", "--out", str(out)]) == 0
    return out


def test_generate_writes_public_and_shares_only(ceremony):
    files = sorted(p.name for p in ceremony.iterdir())
    assert files == ["escrow_key_id.txt", "escrow_public.pem", "quota-1-di-3.txt",
                     "quota-2-di-3.txt", "quota-3-di-3.txt"]
    assert oct((ceremony / "quota-1-di-3.txt").stat().st_mode & 0o777) == "0o600"
    for f in ceremony.iterdir():
        assert b"PRIVATE KEY" not in f.read_bytes()
    pub = serialization.load_pem_public_key((ceremony / "escrow_public.pem").read_bytes())
    assert pub.key_size == 4096


def test_verify_any_two_shares(ceremony, capsys):
    for a, b in itertools.combinations([1, 2, 3], 2):
        rc = custodi.main(["verifica", "--quota", str(ceremony / f"quota-{a}-di-3.txt"),
                           "--quota", str(ceremony / f"quota-{b}-di-3.txt"),
                           "--pubblica", str(ceremony / "escrow_public.pem")])
        assert rc == 0
    out = capsys.readouterr().out
    assert '"corrisponde_alla_pubblica": true' in out


def test_single_share_or_corrupted_share_fails(ceremony, tmp_path):
    assert custodi.main(["verifica", "--quota", str(ceremony / "quota-1-di-3.txt")]) == 2
    bad = tmp_path / "q.txt"
    text = (ceremony / "quota-2-di-3.txt").read_text()
    lines = text.splitlines()
    q = [ln for ln in lines if ln.startswith("quota: ")][0]
    raw = bytearray(base64.b64decode(q[7:]))
    raw[10] ^= 1
    bad.write_text(text.replace(q, "quota: " + base64.b64encode(bytes(raw)).decode()))
    assert custodi.main(["verifica", "--quota", str(ceremony / "quota-1-di-3.txt"),
                         "--quota", str(bad)]) == 2


def _exports(ceremony):
    pub = serialization.load_pem_public_key((ceremony / "escrow_public.pem").read_bytes())
    ekid = (ceremony / "escrow_key_id.txt").read_text().strip()
    k_u = AESGCM.generate_key(bit_length=256)
    kid = str(uuid.uuid4())
    dev = rsa.generate_private_key(public_exponent=65537, key_size=3072)
    dk = str(uuid.uuid4())
    escrow_export = {"formato": "pseudomania-escrow-export", "versione": 1, "ownerPseudonym": "abc",
                     "escrows": [{"keyId": kid, "escrowKeyId": ekid,
                                  "wrappedKey": base64.b64encode(pub.encrypt(k_u, OAEP)).decode()}],
                     "deviceKeys": [{"deviceKeyId": dk, "publicKey": base64.b64encode(
                         dev.public_key().public_bytes(serialization.Encoding.DER,
                                                       serialization.PublicFormat.SubjectPublicKeyInfo)).decode()}]}
    entries = []
    for scope, tag, val, aad_scope in [(("project", "p1"), "[FULLNAME_1]", "Mario Rossi", None),
                                       (("project", "p1"), "[CF_1]", "RSSMRA85H12F205Y", None),
                                       (("conversation", "c2"), "[FULLNAME_1]", "Anna Neri",
                                        "conversation|pending:x")]:
        iv = os.urandom(12)
        aad = f"{aad_scope or scope[0] + '|' + scope[1]}|{tag}".encode()
        entries.append({"scopeType": scope[0], "scopeId": scope[1], "tag": tag, "entityType": tag[1:-3],
                        "keyId": kid, "iv": base64.b64encode(iv).decode(), "aadScope": aad_scope,
                        "ciphertext": base64.b64encode(AESGCM(k_u).encrypt(iv, val.encode(), aad)).decode()})
    voci = {"formato": "pseudomania-voci-export", "versione": 1, "ownerPseudonym": "abc", "entries": entries}
    return escrow_export, voci, k_u, kid, dev, dk


def test_recover_for_device_and_judicial_decrypt(ceremony, tmp_path):
    escrow_export, voci, k_u, kid, dev, dk = _exports(ceremony)
    (tmp_path / "e.json").write_text(json.dumps(escrow_export))
    (tmp_path / "v.json").write_text(json.dumps(voci))
    q = ["--quota", str(ceremony / "quota-3-di-3.txt"), "--quota", str(ceremony / "quota-1-di-3.txt")]
    assert custodi.main(["ricifra", *q, "--escrow", str(tmp_path / "e.json"), "--dispositivo", dk,
                         "--out", str(tmp_path / "rec.json")]) == 0
    rec = json.loads((tmp_path / "rec.json").read_text())["keys"]
    assert rec[0]["keyId"] == kid and rec[0]["deviceKeyId"] == dk
    assert dev.decrypt(base64.b64decode(rec[0]["wrappedKey"]), OAEP) == k_u
    # autorità giudiziaria: solo le voci richieste
    assert custodi.main(["decifra-voci", *q, "--escrow", str(tmp_path / "e.json"), "--voci",
                         str(tmp_path / "v.json"), "--scope", "project:p1", "--tag", "[CF_1]",
                         "--out", str(tmp_path / "r.csv")]) == 0
    rows = list(csv.DictReader(open(tmp_path / "r.csv", encoding="utf-8")))
    assert rows == [{"scopeType": "project", "scopeId": "p1", "tag": "[CF_1]", "tipo": "CF",
                     "valore": "RSSMRA85H12F205Y"}]
    assert custodi.main(["decifra-voci", *q, "--escrow", str(tmp_path / "e.json"), "--voci",
                         str(tmp_path / "v.json"), "--scope", "conversation:c2",
                         "--out", str(tmp_path / "r2.csv")]) == 0
    assert "Anna Neri" in (tmp_path / "r2.csv").read_text()


def test_redistribute_new_threshold(ceremony, tmp_path):
    q = ["--quota", str(ceremony / "quota-1-di-3.txt"), "--quota", str(ceremony / "quota-2-di-3.txt")]
    assert custodi.main(["ridistribuisci", *q, "--quote", "5", "--soglia", "3", "--out", str(tmp_path)]) == 0
    new = [str(tmp_path / f"quota-{i}-di-5.txt") for i in (2, 4, 5)]
    assert custodi.main(["verifica", *sum((["--quota", p] for p in new), []),
                         "--pubblica", str(ceremony / "escrow_public.pem")]) == 0


def test_verbali(tmp_path):
    for t in custodi.VERBALI:
        assert custodi.main(["verbale", "--tipo", t, "--out", str(tmp_path / f"{t}.md")]) == 0
        text = (tmp_path / f"{t}.md").read_text()
        assert text.startswith("# Verbale") and "Firme" in text
