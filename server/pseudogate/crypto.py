# SPDX-License-Identifier: AGPL-3.0-or-later
"""HMAC lato server (OpenBao transit, chiave `user-hmac`).

I valori del dizionario NON sono più cifrati dal server: li cifra l'estensione con la
chiave dell'utente (DECISIONI.md, progetto crittografico). Il server usa OpenBao solo per
gli HMAC: pseudonimi degli utenti, HMAC dei valori (stesso valore -> stesso tag) e degli
scope. Tutti gli HMAC hanno separazione di dominio ("user:", "value:", "scope:").
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import os
import threading
import time
from collections import OrderedDict
from typing import Protocol

import httpx

from .errors import KeyServiceUnavailable

log = logging.getLogger("pseudogate.crypto")


class KeyService(Protocol):
    def user_pseudonym(self, subject: str) -> str: ...
    def value_hmacs(self, owner: str, values: list[str]) -> list[str]: ...
    def scope_hash(self, scope_type: str, scope_id: str) -> str: ...
    def healthy(self) -> bool: ...
    def status(self) -> str: ...  # "ok" | "sealed" | "down"


def _b64(s: str | bytes) -> str:
    if isinstance(s, str):
        s = s.encode("utf-8")
    return base64.b64encode(s).decode("ascii")


class _LRU:
    def __init__(self, size: int = 4096):
        self._d: OrderedDict[str, str] = OrderedDict()
        self._size = size
        self._lock = threading.Lock()

    def get(self, k: str) -> str | None:
        with self._lock:
            v = self._d.get(k)
            if v is not None:
                self._d.move_to_end(k)
            return v

    def put(self, k: str, v: str) -> None:
        with self._lock:
            self._d[k] = v
            self._d.move_to_end(k)
            while len(self._d) > self._size:
                self._d.popitem(last=False)


# --------------------------------------------------------------------------- #
# Solo sviluppo e test (non selezionabile da configurazione)
# --------------------------------------------------------------------------- #
class LocalHmacKeyService:
    """HMAC con una chiave in memoria: usato SOLO nei test e negli strumenti di collaudo."""

    def __init__(self, key: bytes | None = None):
        self._key = key or os.urandom(32)

    def _h(self, data: str) -> str:
        return hmac.new(self._key, data.encode("utf-8"), hashlib.sha256).hexdigest()

    def user_pseudonym(self, subject: str) -> str:
        return self._h("user:" + subject)

    def value_hmacs(self, owner: str, values: list[str]) -> list[str]:
        return [self._h(f"value:{owner}:{v}") for v in values]

    def scope_hash(self, scope_type: str, scope_id: str) -> str:
        return self._h(f"scope:{scope_type}:{scope_id}")

    def healthy(self) -> bool:
        return True

    def status(self) -> str:
        return "ok"


# --------------------------------------------------------------------------- #
# OpenBao transit (produzione)
# --------------------------------------------------------------------------- #
class OpenBaoKeyService:
    def __init__(self, addr: str, *, token: str = "", role_id: str = "", secret_id: str = "",
                 mount: str = "transit", hmac_key: str = "user-hmac",
                 hmac_key_version: int = 1, timeout: float = 10.0,
                 transport: httpx.BaseTransport | None = None):
        self._client = httpx.Client(base_url=addr, timeout=timeout, transport=transport)
        self._static_token = token
        self._role_id = role_id
        self._secret_id = secret_id
        self._mount = mount.strip("/")
        self._hmac_key = hmac_key
        self._hmac_version = hmac_key_version
        self._token = token
        self._token_exp = float("inf") if token else 0.0
        self._lock = threading.Lock()
        self._pseudonyms = _LRU()

    # -- token ---------------------------------------------------------------
    def _login(self) -> None:
        if self._static_token:
            self._token = self._static_token
            self._token_exp = float("inf")
            return
        try:
            r = self._client.post("/v1/auth/approle/login",
                                  json={"role_id": self._role_id, "secret_id": self._secret_id})
        except httpx.HTTPError as e:
            raise KeyServiceUnavailable() from e
        if r.status_code != 200:
            log.error("Login AppRole su OpenBao fallito: HTTP %s", r.status_code)
            raise KeyServiceUnavailable()
        auth = r.json()["auth"]
        self._token = auth["client_token"]
        ttl = int(auth.get("lease_duration") or 3600)
        # rinnova con anticipo: a metà della durata
        self._token_exp = time.monotonic() + max(30, ttl // 2)

    def _ensure_token(self) -> str:
        with self._lock:
            if not self._token or time.monotonic() >= self._token_exp:
                self._login()
            return self._token

    def _post(self, path: str, payload: dict) -> dict:
        for attempt in (1, 2):
            token = self._ensure_token()
            try:
                r = self._client.post(f"/v1/{self._mount}/{path}", json=payload,
                                      headers={"X-Vault-Token": token})
            except httpx.HTTPError as e:
                raise KeyServiceUnavailable() from e
            if r.status_code == 403 and attempt == 1 and not self._static_token:
                with self._lock:
                    self._token_exp = 0.0
                continue
            if r.status_code >= 400:
                log.error("OpenBao %s: HTTP %s", path, r.status_code)
                raise KeyServiceUnavailable()
            return r.json()["data"]
        raise KeyServiceUnavailable()

    def _hmac_many(self, inputs: list[str]) -> list[str]:
        items = [{"input": _b64(s)} for s in inputs]
        data_path = f"hmac/{self._hmac_key}/sha2-256"
        if not items:
            return []
        data = self._post(data_path, {"batch_input": items, "key_version": self._hmac_version})
        out = []
        for res in data["batch_results"]:
            if res.get("error"):
                raise KeyServiceUnavailable()
            # formato "vault:v1:<base64>" -> esadecimale (ASCII, 64 caratteri)
            raw = res["hmac"].split(":", 2)[-1]
            out.append(base64.b64decode(raw).hex())
        return out

    # -- API -----------------------------------------------------------------
    def user_pseudonym(self, subject: str) -> str:
        cached = self._pseudonyms.get(subject)
        if cached:
            return cached
        p = self._hmac_many(["user:" + subject])[0]
        self._pseudonyms.put(subject, p)
        return p

    def value_hmacs(self, owner: str, values: list[str]) -> list[str]:
        return self._hmac_many([f"value:{owner}:{v}" for v in values])

    def scope_hash(self, scope_type: str, scope_id: str) -> str:
        key = f"scope:{scope_type}:{scope_id}"
        cached = self._pseudonyms.get(key)
        if cached:
            return cached
        h = self._hmac_many([key])[0]
        self._pseudonyms.put(key, h)
        return h

    def status(self, max_age_s: float = 5.0) -> str:
        """Stato di OpenBao da /v1/sys/health: 200/429/472/473 = attivo (anche standby),
        503 = sigillato, altro o irraggiungibile = down. Risultato in cache per pochi secondi."""
        now = time.monotonic()
        cached = getattr(self, "_status_cache", None)
        if cached and now - cached[0] < max_age_s:
            return cached[1]
        try:
            code = self._client.get("/v1/sys/health", timeout=3.0).status_code
            st = "ok" if code in (200, 429, 472, 473) else "sealed" if code == 503 else "down"
        except httpx.HTTPError:
            st = "down"
        self._status_cache = (now, st)
        return st

    def healthy(self) -> bool:
        return self.status(max_age_s=0) == "ok"


def build_key_service(settings) -> KeyService:
    return OpenBaoKeyService(
        settings.openbao_addr,
        token=settings.openbao_token,
        role_id=settings.openbao_role_id,
        secret_id=settings.openbao_secret_id,
        mount=settings.openbao_transit_mount,
        hmac_key=settings.openbao_hmac_key,
        hmac_key_version=settings.openbao_hmac_key_version,
        timeout=settings.openbao_timeout_s,
    )
