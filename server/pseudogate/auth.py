# SPDX-License-Identifier: AGPL-3.0-or-later
"""Autenticazione.

- ente: JWT OIDC firmato dall'identity provider; firma verificata con le chiavi JWKS,
  controllo di `iss`, `aud`, `exp`/`nbf`. Identità = claim OIDC_USER_CLAIM (default `sub`,
  in mancanza `preferred_username`). L'identità non viene mai salvata: si usa solo
  user_pseudonym = HMAC-SHA256(chiave user-hmac, sub).
"""

from __future__ import annotations

import json
import logging
import ssl
import threading
import urllib.request
from dataclasses import dataclass

import jwt

from .errors import Unauthorized

log = logging.getLogger("pseudogate.auth")


@dataclass(frozen=True)
class Principal:
    user_pseudonym: str
    office: str | None = None  # dal claim OIDC_OFFICE_CLAIM, solo per gli aggregati anonimi


def _bearer(authorization: str | None) -> str:
    if not authorization:
        raise Unauthorized("Autenticazione richiesta.")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise Unauthorized("Intestazione Authorization non valida.")
    return token.strip()


class OIDCAuth:
    def __init__(self, issuer: str, audience: str, keys, *, jwks_url: str = "",
                 user_claim: str = "sub", algorithms: list[str] | None = None, leeway: int = 30,
                 jwk_client=None, ca_file: str = "", office_claim: str = ""):
        self.issuer = issuer.rstrip("/")
        self.audience = audience
        self.keys = keys
        self.user_claim = user_claim
        self.algorithms = algorithms or ["RS256"]
        self.leeway = leeway
        self._jwks_url = jwks_url
        self._jwk_client = jwk_client
        self.office_claim = office_claim
        # CA pubbliche del sistema + eventuali CA interne dell'ente (EXTRA_CA_FILE).
        # Il proxy (HTTPS_PROXY/NO_PROXY) è letto dall'ambiente da urllib.
        self._ssl = ssl.create_default_context()
        if ca_file:
            self._ssl.load_verify_locations(cafile=ca_file)
        self._lock = threading.Lock()

    def _discover_jwks_url(self) -> str:
        url = f"{self.issuer}/.well-known/openid-configuration"
        with urllib.request.urlopen(url, timeout=10, context=self._ssl) as r:  # noqa: S310
            return json.load(r)["jwks_uri"]

    def _client(self):
        with self._lock:
            if self._jwk_client is None:
                if not self._jwks_url:
                    try:
                        self._jwks_url = self._discover_jwks_url()
                    except Exception as e:
                        log.error("OIDC discovery fallita su %s: %s", self.issuer, e)
                        raise Unauthorized("Impossibile verificare il token: identity provider "
                                           "non raggiungibile.") from e
                self._jwk_client = jwt.PyJWKClient(self._jwks_url, cache_keys=True,
                                                   lifespan=3600, timeout=10,
                                                   ssl_context=self._ssl)
            return self._jwk_client

    def authenticate(self, authorization: str | None) -> Principal:
        token = _bearer(authorization)
        try:
            signing_key = self._client().get_signing_key_from_jwt(token)
            claims = jwt.decode(
                token, signing_key.key, algorithms=self.algorithms, audience=self.audience,
                issuer=self.issuer, leeway=self.leeway,
                options={"require": ["exp", "iss", "aud"]},
            )
        except Unauthorized:
            raise
        except jwt.PyJWKClientError as e:
            log.info("Chiave JWKS non trovata: %s", e)
            raise Unauthorized() from e
        except jwt.InvalidTokenError as e:
            log.info("Token OIDC rifiutato: %s", type(e).__name__)
            raise Unauthorized() from e
        subject = claims.get(self.user_claim) or claims.get("preferred_username")
        if not subject or not isinstance(subject, str):
            raise Unauthorized("Il token non contiene l'identità dell'utente.")
        office = claims.get(self.office_claim) if self.office_claim else None
        if isinstance(office, list):
            office = office[0] if office else None
        return Principal(self.keys.user_pseudonym(subject),
                         str(office)[:100] if office is not None else None)


def build_auth(settings, keys):
    return OIDCAuth(settings.oidc_issuer, settings.oidc_audience, keys,
                    jwks_url=settings.oidc_jwks_url, user_claim=settings.oidc_user_claim,
                    algorithms=settings.oidc_algorithms, leeway=settings.oidc_leeway_s,
                    ca_file=settings.extra_ca_file, office_claim=settings.oidc_office_claim)
