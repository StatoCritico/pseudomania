# SPDX-License-Identifier: AGPL-3.0-or-later
"""Fiducia delle CA per TUTTE le chiamate HTTPS in uscita (IdP OIDC, Langfuse condiviso, ...).

EXTRA_CA_FILE (PEM, una o più CA interne dell'ente) viene AGGIUNTO alle CA pubbliche del
sistema: all'avvio si crea un bundle combinato e lo si indica a OpenSSL/urllib
(SSL_CERT_FILE), a httpx (SSL_CERT_FILE) e a requests (REQUESTS_CA_BUNDLE, usato
dall'esportatore OpenTelemetry dell'SDK Langfuse). Il proxy si configura con le variabili
standard HTTPS_PROXY / NO_PROXY (vedi deploy/.env.example).
"""

from __future__ import annotations

import logging
import os
import ssl
import tempfile
from pathlib import Path

log = logging.getLogger("pseudogate.outbound")
_configured: str | None = None


def _system_bundle() -> str | None:
    paths = ssl.get_default_verify_paths()
    for p in (os.environ.get("SSL_CERT_FILE"), paths.cafile, paths.openssl_cafile,
              "/etc/ssl/certs/ca-certificates.crt"):
        if p and Path(p).is_file():
            return p
    try:
        import certifi
        return certifi.where()
    except ImportError:  # pragma: no cover
        return None


def configure_extra_ca(extra_file: str) -> str | None:
    """Crea il bundle combinato e imposta le variabili d'ambiente. -> percorso o None."""
    global _configured
    if not extra_file:
        return None
    if _configured:
        return _configured
    extra = Path(extra_file).read_text(encoding="utf-8")
    if "BEGIN CERTIFICATE" not in extra:
        raise ValueError(f"EXTRA_CA_FILE non contiene certificati PEM: {extra_file}")
    base = _system_bundle()
    content = (Path(base).read_text(encoding="utf-8") if base else "") + "\n" + extra
    fd, path = tempfile.mkstemp(prefix="pseudogate-ca-", suffix=".pem")
    with os.fdopen(fd, "w", encoding="utf-8") as fh:
        fh.write(content)
    os.environ["SSL_CERT_FILE"] = path
    os.environ["REQUESTS_CA_BUNDLE"] = path
    _configured = path
    log.info("CA aggiuntive caricate da %s", extra_file)
    return path


def ssl_context(extra_file: str = "") -> ssl.SSLContext:
    ctx = ssl.create_default_context()
    if extra_file:
        ctx.load_verify_locations(cafile=extra_file)
    return ctx
