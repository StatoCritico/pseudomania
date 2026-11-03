# SPDX-License-Identifier: AGPL-3.0-or-later
"""Comandi amministrativi (python -m pseudogate ...) e integrazione con tools/custodi."""

from __future__ import annotations

import base64
import json
import sys
from pathlib import Path

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

from conftest import AUTH
from support.client import OAEP, b64

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture
def cli_env(client, monkeypatch, escrow_key):
    s = client.app.state.svc.settings
    for k, v in {"DATABASE_URL": s.database_url, "KEYSTORE_DATABASE_URL": s.keystore_database_url,
                 "OIDC_ISSUER": "https://idp.test", "OIDC_AUDIENCE": "x", "OPENBAO_TOKEN": "t",
                 "ESCROW_PUBLIC_KEY_FILE": escrow_key[1], "ESCROW_KEY_ID": escrow_key[2],
                 "DELETION_LOG_DIR": s.deletion_log_dir, "PSEUDOGATE_OPERATORE": "Mario Admin"}.items():
        monkeypatch.setenv(k, v)
    return client.app.state.svc


def run(*args) -> int:
    from pseudogate.__main__ import main
    return main(["pseudogate", *args])


def test_holds_cli_and_registry(cli_env, capsys):
    assert run("blocchi", "aggiungi", "--pseudonimo", "abc", "--rif", "Prot. 9/2026",
               "--scope", "project:p1") == 0
    assert run("blocchi", "elenca") == 0
    out = capsys.readouterr().out
    assert "Prot. 9/2026" in out
    assert run("blocchi", "revoca", "1", "--rif", "Prot. 10/2026") == 0
    assert run("registri", "verifica") == 0
    assert '"integro": true' in capsys.readouterr().out


def test_export_and_custodian_recovery(ext, cli_env, client, tmp_path, escrow_key, capsys):
    """esporta-escrow + esporta-voci lato server -> decifratura con la chiave di custodia
    (qui la privata di test; in produzione ricostruita dalle quote con tools/custodi)."""
    proj = {"type": "project", "id": "p-77"}
    ext.pseudonymize(proj, "Mario Rossi, CF RSSMRA85H12F205Y")
    owner = client.app.state.svc.auth.map[AUTH["Authorization"][7:]].user_pseudonym
    assert run("custodia", "esporta-escrow", "--pseudonimo", owner, "--out", str(tmp_path / "e.json")) == 0
    capsys.readouterr()
    assert run("custodia", "esporta-escrow", "--pseudonimo", owner, "--out", "-") == 0
    cap = capsys.readouterr()
    assert json.loads(cap.out)["ownerPseudonym"] == owner and '"escrows": 1' in cap.err
    assert run("custodia", "esporta-voci", "--pseudonimo", owner, "--scope", "project:p-77",
               "--tag", "[CF_1]", "--out", str(tmp_path / "v.json")) == 0
    e = json.loads((tmp_path / "e.json").read_text())
    v = json.loads((tmp_path / "v.json").read_text())
    assert len(v["entries"]) == 1 and v["entries"][0]["tag"] == "[CF_1]"
    assert oct((tmp_path / "v.json").stat().st_mode & 0o777) == "0o600"
    sys.path.insert(0, str(ROOT / "tools" / "custodi"))
    import custodi
    raw = custodi._unwrap_user_key(escrow_key[0], e, v["entries"][0]["keyId"])
    assert raw == ext.keys[ext.key_id]
    # import delle chiavi recuperate da riga di comando
    dev = rsa.generate_private_key(public_exponent=65537, key_size=3072)
    spki = b64(dev.public_key().public_bytes(serialization.Encoding.DER,
                                             serialization.PublicFormat.SubjectPublicKeyInfo))
    dk = client.post("/v1/keys/device", headers=AUTH, json={"publicKey": spki}).json()["deviceKeyId"]
    rec = {"keys": [{"deviceKeyId": dk, "keyId": ext.key_id,
                     "wrappedKey": b64(dev.public_key().encrypt(raw, OAEP))}]}
    (tmp_path / "rec.json").write_text(json.dumps(rec))
    assert run("custodia", "importa-recuperate", "--file", str(tmp_path / "rec.json")) == 0
    got = client.get("/v1/keys/recovered", headers=AUTH).json()["keys"]
    assert dev.decrypt(base64.b64decode(got[0]["wrappedKey"]), OAEP) == raw


def test_forced_rotation_cli(ext, cli_env, client):
    assert run("chiavi", "forza-rotazione", "--tutti", "--motivo", "prova") == 0
    assert client.get("/v1/config", headers=AUTH).json()["rotateKey"] is True
