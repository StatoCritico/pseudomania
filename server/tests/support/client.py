# SPDX-License-Identifier: AGPL-3.0-or-later
"""Emulatore del lato client del contratto crittografico (DECISIONI.md), per i test:
chiave utente AES-GCM-256, escrow RSA-OAEP-SHA256 con la chiave pubblica di custodia,
cifratura delle newEntries (AAD = scopeType|scopeId|tag), ripristino locale."""

from __future__ import annotations

import base64
import os
import uuid

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

OAEP = padding.OAEP(mgf=padding.MGF1(algorithm=hashes.SHA256()), algorithm=hashes.SHA256(), label=None)


def b64(b: bytes) -> str:
    return base64.b64encode(b).decode("ascii")


def aad(scope: dict, tag: str) -> bytes:
    return f"{scope['type']}|{scope['id']}|{tag}".encode("utf-8")


class ExtensionEmulator:
    def __init__(self, client, headers):
        self.c = client
        self.h = headers
        self.keys: dict[str, bytes] = {}
        self.key_id: str | None = None
        self.config: dict = {}

    def setup(self, escrow: bool = True) -> str:
        self.config = self.c.get("/v1/config", headers=self.h).json()
        return self.new_key(escrow)

    def new_key(self, escrow: bool = True) -> str:
        raw = AESGCM.generate_key(bit_length=256)
        kid = str(uuid.uuid4())
        if escrow:
            pub = serialization.load_der_public_key(base64.b64decode(self.config["escrowPublicKey"]))
            r = self.c.post("/v1/keys/escrow", headers=self.h, json={
                "keyId": kid, "wrappedKey": b64(pub.encrypt(raw, OAEP)),
                "escrowKeyId": self.config["escrowKeyId"]})
            assert r.status_code == 204, r.text
        self.keys[kid] = raw
        self.key_id = kid
        return kid

    def encrypt(self, scope: dict, tag: str, value: str, key_id: str | None = None) -> dict:
        kid = key_id or self.key_id
        iv = os.urandom(12)
        ct = AESGCM(self.keys[kid]).encrypt(iv, value.encode("utf-8"), aad(scope, tag))
        return {"tag": tag, "ciphertext": b64(ct), "iv": b64(iv), "keyId": kid}

    def upload(self, scope: dict, new_entries: list[dict]) -> dict:
        if not new_entries:
            return {"stored": 0, "rejected": []}
        r = self.c.post("/v1/dictionary/entries", headers=self.h, json={
            "scope": scope, "entries": [self.encrypt(scope, e["tag"], e["value"]) for e in new_entries]})
        assert r.status_code == 200, r.text
        return r.json()

    def pseudonymize(self, scope: dict, text: str, upload: bool = True) -> dict:
        r = self.c.post("/v1/pseudonymize", headers=self.h,
                        json={"scope": scope, "site": "claude.ai", "kind": "message", "text": text})
        assert r.status_code == 200, r.text
        out = r.json()
        if upload:
            self.upload(scope, out["newEntries"])
        return out

    def dictionary(self, scope: dict) -> dict[str, str]:
        r = self.c.get("/v1/dictionary", headers=self.h,
                       params={"scope_type": scope["type"], "scope_id": scope["id"]})
        assert r.status_code == 200, r.text
        out = {}
        for tag, e in r.json()["entries"].items():
            k = self.keys.get(e["keyId"])
            if k is None:
                continue  # chiave sconosciuta (cambio PC): non ripristinabile
            out[tag] = AESGCM(k).decrypt(base64.b64decode(e["iv"]), base64.b64decode(e["ciphertext"]),
                                         aad(e.get("aadScope") or scope, tag)).decode("utf-8")
        return out

    def restore(self, scope: dict, text: str) -> str:
        from pseudogate.pseudonymizer import Pseudonymizer
        return Pseudonymizer.reidentify_text(text, self.dictionary(scope))[0]
