# SPDX-License-Identifier: AGPL-3.0-or-later
"""OpenBao transit (finto, stesso formato dell'API) e validazione OIDC."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa

from pseudogate.auth import OIDCAuth
from pseudogate.crypto import LocalHmacKeyService, OpenBaoKeyService
from pseudogate.errors import KeyServiceUnavailable, Unauthorized


class FakeBao:
    """Implementa le rotte transit/approle usate dall'api (formato Vault/OpenBao)."""

    def __init__(self):
        self.key = b"k" * 32
        self.logins = 0
        self.expire_next = False
        self.paths: list[str] = []

    def handler(self, req: httpx.Request) -> httpx.Response:
        path = req.url.path
        self.paths.append(path)
        if path == "/v1/sys/health":
            return httpx.Response(200, json={"initialized": True, "sealed": False})
        body = json.loads(req.content or b"{}")
        if path == "/v1/auth/approle/login":
            assert body == {"role_id": "rid", "secret_id": "sid"}
            self.logins += 1
            return httpx.Response(200, json={"auth": {"client_token": f"tok{self.logins}",
                                                      "lease_duration": 3600}})
        if req.headers.get("X-Vault-Token") != f"tok{self.logins}" or self.expire_next:
            self.expire_next = False
            return httpx.Response(403, json={"errors": ["permission denied"]})
        if path == "/v1/transit/hmac/user-hmac/sha2-256":
            assert body["key_version"] == 1
            res = [{"hmac": "vault:v1:" + base64.b64encode(hmac.new(
                self.key, base64.b64decode(i["input"]), hashlib.sha256).digest()).decode()}
                for i in body["batch_input"]]
            return httpx.Response(200, json={"data": {"batch_results": res}})
        return httpx.Response(404, json={"errors": []})


def _bao(fake):
    return OpenBaoKeyService("http://openbao:8200", role_id="rid", secret_id="sid",
                             transport=httpx.MockTransport(fake.handler))


def test_openbao_hmac():
    fake = FakeBao()
    ks = _bao(fake)
    assert ks.healthy()
    p1 = ks.user_pseudonym("mario.rossi")
    assert len(p1) == 64 and p1 == ks.user_pseudonym("mario.rossi")
    assert p1 != ks.user_pseudonym("giulia.bianchi")
    h = ks.value_hmacs("owner", ["mario rossi", "x"])
    assert len(h) == 2 and h[0] != h[1]
    assert h != ks.value_hmacs("altro", ["mario rossi", "x"])  # separazione per utente
    assert fake.logins == 1
    assert not any("encrypt" in p or "decrypt" in p for p in fake.paths)


def test_openbao_relogin_on_403():
    fake = FakeBao()
    ks = _bao(fake)
    ks.value_hmacs("o", ["a"])
    fake.expire_next = True
    ks.value_hmacs("o", ["b"])
    assert fake.logins == 2


def test_openbao_unreachable():
    def boom(req):
        raise httpx.ConnectError("no", request=req)
    ks = OpenBaoKeyService("http://x", token="t", transport=httpx.MockTransport(boom))
    with pytest.raises(KeyServiceUnavailable):
        ks.value_hmacs("o", ["a"])
    assert not ks.healthy()


# --------------------------------------------------------------------------- OIDC
ISS = "https://idp.ente.local/realms/ente"
AUD = "pseudogate"


class _JwkClient:
    def __init__(self, key):
        self.key = key

    def get_signing_key_from_jwt(self, token):
        return jwt.PyJWK.from_dict(json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(
            self.key.public_key())) | {"kid": "k1", "alg": "RS256"})


@pytest.fixture
def oidc(tmp_path):
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    ks = LocalHmacKeyService()
    auth = OIDCAuth(ISS, AUD, ks, jwk_client=_JwkClient(key))

    def token(**claims):
        base = {"iss": ISS, "aud": AUD, "sub": "u-123", "exp": int(time.time()) + 300,
                "iat": int(time.time())}
        base.update(claims)
        return jwt.encode({k: v for k, v in base.items() if v is not None}, key,
                          algorithm="RS256", headers={"kid": "k1"})
    return auth, token, ks


def test_oidc_valid(oidc):
    auth, token, ks = oidc
    p = auth.authenticate("Bearer " + token())
    assert p.user_pseudonym == ks.user_pseudonym("u-123")
    assert "u-123" not in p.user_pseudonym


@pytest.mark.parametrize("claims", [
    {"aud": "altro"}, {"iss": "https://evil"}, {"exp": int(time.time()) - 3600},
    {"aud": None}, {"sub": None},
])
def test_oidc_rejected(oidc, claims):
    auth, token, _ = oidc
    with pytest.raises(Unauthorized):
        auth.authenticate("Bearer " + token(**claims))


def test_oidc_preferred_username_fallback(oidc):
    auth, token, ks = oidc
    p = auth.authenticate("Bearer " + token(sub=None, preferred_username="m.rossi"))
    assert p.user_pseudonym == ks.user_pseudonym("m.rossi")


def test_oidc_wrong_signature(oidc, tmp_path):
    auth, _, ks = oidc
    other = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    t = jwt.encode({"iss": ISS, "aud": AUD, "sub": "x", "exp": int(time.time()) + 60}, other,
                   algorithm="RS256", headers={"kid": "k1"})
    with pytest.raises(Unauthorized):
        auth.authenticate("Bearer " + t)


def test_openbao_status_sealed_and_health_degraded(make_client):
    fake = FakeBao()
    sealed = {"on": True}

    def handler(req):
        if req.url.path == "/v1/sys/health" and sealed["on"]:
            return httpx.Response(503, json={"sealed": True})
        return fake.handler(req)
    ks = OpenBaoKeyService("http://openbao:8200", role_id="rid", secret_id="sid",
                           transport=httpx.MockTransport(handler))
    assert ks.status(max_age_s=0) == "sealed"
    sealed["on"] = False
    assert ks.status(max_age_s=0) == "ok"
    sealed["on"] = True
    ks._status_cache = None
    c = make_client(keys=ks)
    h = c.get("/v1/health").json()
    assert h["keys"] == "sealed" and h["status"] == "degraded"


def test_oidc_internal_ca_via_env(tmp_path):
    """Discovery e JWKS su HTTPS con certificato di una CA interna: funziona solo con
    OIDC_CA_FILE (ca_file), che si aggiunge alle CA pubbliche."""
    import datetime
    import http.server
    import ssl
    import threading

    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.x509.oid import NameOID

    ca_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    now = datetime.datetime.now(datetime.timezone.utc)
    ca_name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "CA interna di prova")])
    ca = (x509.CertificateBuilder().subject_name(ca_name).issuer_name(ca_name)
          .public_key(ca_key.public_key()).serial_number(1)
          .not_valid_before(now - datetime.timedelta(days=1)).not_valid_after(now + datetime.timedelta(days=1))
          .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
          .add_extension(x509.KeyUsage(digital_signature=True, content_commitment=False,
                                       key_encipherment=False, data_encipherment=False,
                                       key_agreement=False, key_cert_sign=True, crl_sign=True,
                                       encipher_only=False, decipher_only=False), critical=True)
          .add_extension(x509.SubjectKeyIdentifier.from_public_key(ca_key.public_key()), critical=False)
          .sign(ca_key, hashes.SHA256()))
    srv_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    import ipaddress
    srv = (x509.CertificateBuilder()
           .subject_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "127.0.0.1")]))
           .issuer_name(ca_name).public_key(srv_key.public_key()).serial_number(2)
           .not_valid_before(now - datetime.timedelta(days=1)).not_valid_after(now + datetime.timedelta(days=1))
           .add_extension(x509.SubjectAlternativeName([x509.IPAddress(ipaddress.ip_address("127.0.0.1"))]),
                          critical=False)
           .add_extension(x509.AuthorityKeyIdentifier.from_issuer_public_key(ca_key.public_key()),
                          critical=False)
           .sign(ca_key, hashes.SHA256()))
    (tmp_path / "ca.pem").write_bytes(ca.public_bytes(serialization.Encoding.PEM))
    (tmp_path / "srv.pem").write_bytes(srv.public_bytes(serialization.Encoding.PEM) + srv_key.private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))

    sign_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    jwk = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(sign_key.public_key())) | {"kid": "k1", "use": "sig",
                                                                                   "alg": "RS256"}
    state = {}

    class H(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            body = (json.dumps({"jwks_uri": state["base"] + "/jwks"}) if self.path.endswith("openid-configuration")
                    else json.dumps({"keys": [jwk]})).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *a):
            pass

    httpd = http.server.HTTPServer(("127.0.0.1", 0), H)
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.load_cert_chain(tmp_path / "srv.pem")
    httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)
    state["base"] = f"https://127.0.0.1:{httpd.server_address[1]}/realms/ente"
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    try:
        ks = LocalHmacKeyService()
        tok = jwt.encode({"iss": state["base"], "aud": AUD, "sub": "u1", "exp": int(time.time()) + 60},
                         sign_key, algorithm="RS256", headers={"kid": "k1"})
        with pytest.raises(Unauthorized):
            OIDCAuth(state["base"], AUD, ks).authenticate("Bearer " + tok)
        ok = OIDCAuth(state["base"], AUD, ks, ca_file=str(tmp_path / "ca.pem"))
        assert ok.authenticate("Bearer " + tok).user_pseudonym == ks.user_pseudonym("u1")
    finally:
        httpd.shutdown()
