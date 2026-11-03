# SPDX-License-Identifier: AGPL-3.0-or-later
"""Escrow, rotazione delle chiavi, recupero su nuovo dispositivo."""

from __future__ import annotations

import base64
import uuid
from datetime import timedelta

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from sqlalchemy import select, update

from conftest import AUTH
from pseudogate.db import escrows, utcnow
from support.client import OAEP, ExtensionEmulator, b64


def test_escrow_validation(client, escrow_key):
    cfg = client.get("/v1/config", headers=AUTH).json()
    kid = str(uuid.uuid4())
    r = client.post("/v1/keys/escrow", headers=AUTH, json={
        "keyId": kid, "wrappedKey": b64(b"x" * 100), "escrowKeyId": cfg["escrowKeyId"]})
    assert r.status_code == 400
    r = client.post("/v1/keys/escrow", headers=AUTH, json={
        "keyId": kid, "wrappedKey": b64(b"x" * 512), "escrowKeyId": "vecchia"})
    assert r.status_code == 409 and r.json()["error"] == "escrow_key_mismatch"
    r = client.post("/v1/keys/escrow", headers=AUTH, json={
        "keyId": "non-uuid", "wrappedKey": b64(b"x" * 512), "escrowKeyId": cfg["escrowKeyId"]})
    assert r.status_code == 400


def test_escrow_is_decryptable_with_custody_private_key(ext, client, escrow_key):
    priv = escrow_key[0]
    svc = client.app.state.svc
    with svc.keystore.engine.connect() as c:
        row = c.execute(select(escrows)).mappings().one()
    raw = priv.decrypt(base64.b64decode(row["wrapped_key"]), OAEP)
    assert raw == ext.keys[ext.key_id]
    assert row["escrow_key_id"] == escrow_key[2]


def test_rotation_flag_and_rekey(ext, client, scope):
    proj = {"type": "project", "id": "p-1"}
    ext.pseudonymize(scope, "Mario Rossi e Giulia Bianchi")
    ext.pseudonymize(proj, "Luca Verdi")
    old = ext.key_id
    assert client.get("/v1/config", headers=AUTH).json()["rotateKey"] is False
    # chiave più vecchia di 90 giorni -> rotateKey
    svc = client.app.state.svc
    with svc.keystore.engine.begin() as c:
        c.execute(update(escrows).values(created_at=utcnow() - timedelta(days=91)))
    assert client.get("/v1/config", headers=AUTH).json()["rotateKey"] is True
    # rotazione: nuova chiave + escrow, scarica, ricifra, ricarica
    new = ext.new_key()
    page = client.get("/v1/dictionary/rekey", headers=AUTH, params={"key_id": old, "limit": 2}).json()
    entries = page["entries"]
    assert len(entries) == 2 and page["next"]
    entries += client.get("/v1/dictionary/rekey", headers=AUTH,
                          params={"key_id": old, "after": page["next"]}).json()["entries"]
    assert len(entries) == 3
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from support.client import aad
    re_enc = []
    for e in entries:
        v = AESGCM(ext.keys[old]).decrypt(base64.b64decode(e["iv"]), base64.b64decode(e["ciphertext"]),
                                          aad(e["scope"], e["tag"])).decode()
        n = ext.encrypt(e["scope"], e["tag"], v, key_id=new)
        re_enc.append({"scope": e["scope"], "tag": e["tag"], "ciphertext": n["ciphertext"], "iv": n["iv"]})
    r = client.put("/v1/dictionary/rekey", headers=AUTH,
                   json={"oldKeyId": old, "newKeyId": new, "entries": re_enc[:2]}).json()
    assert r == {"updated": 2, "remaining": 1, "escrowDeleted": False}
    r = client.put("/v1/dictionary/rekey", headers=AUTH,
                   json={"oldKeyId": old, "newKeyId": new, "entries": re_enc[2:]}).json()
    assert r == {"updated": 1, "remaining": 0, "escrowDeleted": True}
    del ext.keys[old]
    assert ext.dictionary(scope) == {"[FULLNAME_1]": "Mario Rossi", "[FULLNAME_2]": "Giulia Bianchi"}
    assert ext.dictionary(proj) == {"[FULLNAME_1]": "Luca Verdi"}
    assert client.get("/v1/config", headers=AUTH).json()["rotateKey"] is False
    with svc.keystore.engine.connect() as c:
        assert [r[0] for r in c.execute(select(escrows.c.key_id))] == [new]


def test_rekey_requires_new_escrow(ext, client):
    r = client.put("/v1/dictionary/rekey", headers=AUTH, json={
        "oldKeyId": ext.key_id, "newKeyId": str(uuid.uuid4()), "entries": []})
    assert r.status_code == 400


def test_forced_rotation_flag(ext, client):
    svc = client.app.state.svc
    svc.keystore.request_rotation("*", "esposizione")
    assert client.get("/v1/config", headers=AUTH).json()["rotateKey"] is True
    ext.new_key()  # nuova chiave dopo la richiesta: flag spento
    assert client.get("/v1/config", headers=AUTH).json()["rotateKey"] is False


def test_device_recovery_flow(make_client, scope, escrow_key):
    c = make_client(admin_api_token="a" * 40)
    old = ExtensionEmulator(c, AUTH)
    old.setup()
    proj = {"type": "project", "id": "prog-42"}
    old.pseudonymize(proj, "Mario Rossi")
    old_key_id = old.key_id
    # nuovo PC: nuova chiave, il vecchio dizionario non è decifrabile
    new = ExtensionEmulator(c, AUTH)
    new.setup()
    assert new.dictionary(proj) == {}
    dev = rsa.generate_private_key(public_exponent=65537, key_size=3072)
    spki = b64(dev.public_key().public_bytes(serialization.Encoding.DER,
                                             serialization.PublicFormat.SubjectPublicKeyInfo))
    dk = c.post("/v1/keys/device", headers=AUTH, json={"publicKey": spki}).json()["deviceKeyId"]
    # i custodi (offline) decifrano l'escrow e ricifrano per il dispositivo
    svc = c.app.state.svc
    export = svc.keystore.export_owner(svc.auth.map[AUTH["Authorization"][7:]].user_pseudonym)
    wrapped = next(e["wrappedKey"] for e in export["escrows"] if e["keyId"] == old_key_id)
    raw = escrow_key[0].decrypt(base64.b64decode(wrapped), OAEP)
    item = {"deviceKeyId": dk, "keyId": old_key_id,
            "wrappedKey": b64(dev.public_key().encrypt(raw, OAEP))}
    assert c.post("/v1/keys/recovered", headers=AUTH, json={"keys": [item]}).status_code == 401
    r = c.post("/v1/keys/recovered", headers={"Authorization": "Bearer " + "a" * 40},
               json={"keys": [item]})
    assert r.status_code == 204, r.text
    got = c.get("/v1/keys/recovered", headers=AUTH).json()["keys"]
    assert got[0]["keyId"] == old_key_id
    new.keys[old_key_id] = dev.decrypt(base64.b64decode(got[0]["wrappedKey"]), OAEP)
    assert new.dictionary(proj) == {"[FULLNAME_1]": "Mario Rossi"}


def test_custody_key_change_triggers_rotation(ext, client):
    svc = client.app.state.svc
    with svc.keystore.engine.begin() as c:
        c.execute(update(escrows).values(escrow_key_id="chiave-di-custodia-precedente"))
    assert client.get("/v1/config", headers=AUTH).json()["rotateKey"] is True
    ext.new_key()
    assert client.get("/v1/config", headers=AUTH).json()["rotateKey"] is False
