# SPDX-License-Identifier: AGPL-3.0-or-later
from __future__ import annotations

import os
import sys
import uuid
from pathlib import Path

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tests"))

from pseudogate.auth import Principal  # noqa: E402
from pseudogate.crypto import LocalHmacKeyService  # noqa: E402
from pseudogate.detector import RizzoClient  # noqa: E402
from pseudogate.errors import Unauthorized  # noqa: E402
from pseudogate.main import create_app  # noqa: E402
from pseudogate.settings import Settings  # noqa: E402
from support.client import ExtensionEmulator  # noqa: E402
from support.fake_rizzo import FakeRizzo  # noqa: E402

TOKEN = "t" * 40
AUTH = {"Authorization": f"Bearer {TOKEN}"}
AUTH2 = {"Authorization": "Bearer " + "u" * 40}


class StaticAuth:
    """Autenticazione di test: token -> utente (sostituisce OIDC)."""

    def __init__(self, keys, users: dict[str, tuple[str, str | None]]):
        self.map = {tok: Principal(keys.user_pseudonym(sub), office) for tok, (sub, office) in users.items()}

    def authenticate(self, authorization):
        tok = (authorization or "").partition(" ")[2]
        if tok not in self.map:
            raise Unauthorized()
        return self.map[tok]


@pytest.fixture(scope="session")
def escrow_key(tmp_path_factory):
    key = rsa.generate_private_key(public_exponent=65537, key_size=4096)
    d = tmp_path_factory.mktemp("escrow")
    pub = d / "escrow_public.pem"
    pub.write_bytes(key.public_key().public_bytes(serialization.Encoding.PEM,
                                                  serialization.PublicFormat.SubjectPublicKeyInfo))
    return key, str(pub), str(uuid.uuid4())


def make_settings(tmp_path: Path, escrow_key, **kw) -> Settings:
    _, pub, kid = escrow_key
    base = dict(version="0.1.0-test",
                database_url=f"sqlite:///{tmp_path}/app.sqlite3",
                keystore_database_url=f"sqlite:///{tmp_path}/keys.sqlite3",
                oidc_issuer="https://idp.test", oidc_audience="pseudogate",
                openbao_token="test", escrow_public_key_file=pub, escrow_key_id=kid,
                retention_job="off", deletion_log_dir=str(tmp_path / "registro"))
    base.update(kw)
    s = Settings(**base)
    s.validate()
    return s


@pytest.fixture
def fake_rizzo():
    return FakeRizzo()


@pytest.fixture
def make_client(tmp_path, fake_rizzo, escrow_key):
    clients = []

    def _make(**kw):
        overrides = {k: kw.pop(k) for k in ("auth", "keys", "tracer", "engine", "keys_engine") if k in kw}
        s = make_settings(tmp_path, escrow_key, **kw)
        keys = overrides.setdefault("keys", LocalHmacKeyService(b"k" * 32))
        overrides.setdefault("auth", StaticAuth(keys, {TOKEN: ("mario.rossi", "Ufficio Tributi"),
                                                       "u" * 40: ("giulia.bianchi", None)}))
        det = RizzoClient("http://rizzo", transport=fake_rizzo.transport(), batch_chars=s.detector_batch_chars)
        app = create_app(s, detector=det, **overrides)
        c = TestClient(app)
        c.__enter__()
        clients.append(c)
        return c

    yield _make
    for c in clients:
        c.__exit__(None, None, None)


@pytest.fixture
def client(make_client):
    return make_client()


@pytest.fixture
def ext(client, escrow_key):
    """Estensione emulata (chiave AES-GCM, escrow, caricamento delle voci) per l'utente AUTH."""
    e = ExtensionEmulator(client, AUTH)
    e.setup()
    return e


@pytest.fixture
def scope():
    return {"type": "conversation", "id": "0f8fad5b-d9cb-469f-a165-70867728950e"}


def pg_url() -> str | None:
    return os.environ.get("PG_TEST_URL")


def pg_keys_url() -> str | None:
    return os.environ.get("PG_TEST_KEYS_URL")
