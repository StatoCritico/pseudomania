# SPDX-License-Identifier: AGPL-3.0-or-later
"""Configurazione da variabili d'ambiente (nomi come in SPEC.md e deploy/.env.example).

Esiste solo l'edizione enti: la modalità "personale" del server è stata eliminata
(DECISIONI.md, punto 5: l'edizione personale è solo estensione + Rizzo-PII locale).
"""

from __future__ import annotations

import base64
import os
from dataclasses import dataclass, field
from pathlib import Path

_TRUE = {"1", "true", "yes", "on", "si", "sì"}
_FALSE = {"0", "false", "no", "off"}


def _bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return default
    v = raw.strip().lower()
    if v in _TRUE:
        return True
    if v in _FALSE:
        return False
    raise ValueError(f"{name}: valore booleano non valido: {raw!r}")


def _int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    return default if raw is None or raw.strip() == "" else int(raw)


def _str(name: str, default: str = "") -> str:
    raw = os.environ.get(name)
    return default if raw is None or raw.strip() == "" else raw.strip()


def _list(name: str, default: list[str]) -> list[str]:
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return list(default)
    return [x.strip() for x in raw.replace(";", ",").split(",") if x.strip()]


def _secret(name: str) -> str:
    """Valore da NAME oppure dal file indicato in NAME_FILE (Docker secrets)."""
    path = os.environ.get(f"{name}_FILE")
    if path and Path(path).is_file():
        return Path(path).read_text(encoding="utf-8").strip()
    return _str(name)


_CONFIG_DIR = Path(__file__).resolve().parent.parent / "config"


def load_escrow_public_key(path: str) -> tuple[str, int]:
    """PEM (SubjectPublicKeyInfo) -> (SPKI DER in base64, bit della chiave)."""
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import rsa

    key = serialization.load_pem_public_key(Path(path).read_bytes())
    if not isinstance(key, rsa.RSAPublicKey):
        raise ValueError("La chiave pubblica di custodia deve essere RSA")
    der = key.public_bytes(serialization.Encoding.DER,
                           serialization.PublicFormat.SubjectPublicKeyInfo)
    return base64.b64encode(der).decode("ascii"), key.key_size


@dataclass
class Settings:
    version: str = ""

    # --- database -----------------------------------------------------------
    database_url: str = ""            # DB applicativo "pseudogate"
    keystore_database_url: str = ""   # key store separato "pseudogate_keys" (escrow)
    migrate_on_start: bool = True

    # --- autenticazione -----------------------------------------------------
    oidc_issuer: str = ""
    oidc_audience: str = ""
    oidc_jwks_url: str = ""
    oidc_user_claim: str = "sub"
    oidc_office_claim: str = ""       # facoltativo: claim con l'ufficio (aggregati anonimi)
    oidc_algorithms: list[str] = field(default_factory=lambda: ["RS256", "PS256", "ES256"])
    oidc_leeway_s: int = 30
    extra_ca_file: str = ""            # CA interne (PEM) aggiunte a quelle pubbliche, per ogni chiamata HTTPS
    admin_api_token: str = ""         # facoltativo: abilita POST /v1/keys/recovered

    # --- OpenBao: solo chiave HMAC (i valori sono cifrati dall'estensione) ---
    openbao_addr: str = "http://openbao:8200"
    openbao_token: str = ""
    openbao_role_id: str = ""
    openbao_secret_id: str = ""
    openbao_transit_mount: str = "transit"
    openbao_hmac_key: str = "user-hmac"
    openbao_hmac_key_version: int = 1
    openbao_timeout_s: float = 10.0

    # --- custodia delle chiavi utente ----------------------------------------
    escrow_public_key_file: str = ""
    escrow_key_id: str = ""
    escrow_public_key_b64: str = ""   # calcolato da escrow_public_key_file
    key_rotation_days: int = 90
    pending_entry_minutes: int = 10
    recovered_key_ttl_days: int = 7
    device_key_ttl_days: int = 30

    # --- rilevatore Rizzo-PII ----------------------------------------------
    rizzo_url: str = "http://rizzo-pii:5005"
    rizzo_timeout_s: float = 600.0
    detector_exclude_tags: list[str] = field(default_factory=list)
    detector_batch_chars: int = 200_000

    # --- policy -------------------------------------------------------------
    fail_closed: bool = True
    allow_disable: bool = False
    max_file_mb: int = 20
    policy_version: str = ""
    allowlist_file: str = str(_CONFIG_DIR / "allowlist.yml")
    special_categories_file: str = str(_CONFIG_DIR / "special_categories.yml")
    special_categories_enabled: bool = True
    sites: list[str] = field(default_factory=lambda: ["claude.ai"])

    # --- conservazione (DECISIONI.md) ---------------------------------------
    dict_ttl_conversation_days: int = 30         # dall'ultimo uso
    dict_ttl_project_inactivity_days: int = 30   # dall'ultimo uso
    project_confirm_interval_days: int = 365     # conferma annuale dell'utente
    pending_scope_ttl_hours: int = 24
    audit_retention_days: int = 90               # poi solo aggregati anonimi
    admin_log_retention_days: int = 730          # registri tecnici: 24 mesi
    retention_job: str = "internal"              # internal | off
    retention_interval_minutes: int = 60
    deletion_log_dir: str = "/var/lib/pseudogate/registro"

    # --- Langfuse -----------------------------------------------------------
    langfuse_enabled: bool = False
    langfuse_host: str = "http://langfuse-web:3000"
    langfuse_public_key: str = ""
    langfuse_secret_key: str = ""
    langfuse_environment: str = "production"
    langfuse_retention_days: int = 30            # 30 nel pilota, poi 7; 0 = job disattivato

    # --- HTTP ---------------------------------------------------------------
    cors_allow_origin_regex: str = r"^chrome-extension://[a-p]{32}"
    log_level: str = "INFO"
    source_url: str = ""

    @property
    def mode(self) -> str:  # compatibilità del contratto: esiste solo l'edizione enti
        return "ente"

    @property
    def max_file_bytes(self) -> int:
        return self.max_file_mb * 1024 * 1024

    def validate(self) -> None:
        missing = [n for n, v in (("DATABASE_URL", self.database_url),
                                  ("KEYSTORE_DATABASE_URL", self.keystore_database_url),
                                  ("OIDC_ISSUER", self.oidc_issuer),
                                  ("OIDC_AUDIENCE", self.oidc_audience),
                                  ("ESCROW_PUBLIC_KEY_FILE", self.escrow_public_key_file),
                                  ("ESCROW_KEY_ID", self.escrow_key_id)) if not v]
        if missing:
            raise ValueError("Variabili obbligatorie mancanti: " + ", ".join(missing))
        if self.database_url == self.keystore_database_url:
            raise ValueError("KEYSTORE_DATABASE_URL deve indicare un database diverso da DATABASE_URL")
        if not (self.openbao_token or (self.openbao_role_id and self.openbao_secret_id)):
            raise ValueError("Servono OPENBAO_TOKEN oppure OPENBAO_ROLE_ID(_FILE) e "
                             "OPENBAO_SECRET_ID(_FILE)")
        if not self.escrow_public_key_b64:
            self.escrow_public_key_b64, bits = load_escrow_public_key(self.escrow_public_key_file)
            if bits < 4096:
                raise ValueError(f"La chiave pubblica di custodia è di {bits} bit: servono 4096")
        if self.langfuse_enabled and not (self.langfuse_public_key and self.langfuse_secret_key):
            raise ValueError("LANGFUSE_ENABLED=true richiede LANGFUSE_PUBLIC_KEY e LANGFUSE_SECRET_KEY")


def _escrow_key_id() -> str:
    v = _str("ESCROW_KEY_ID")
    if v:
        return v
    f = _str("ESCROW_KEY_ID_FILE")
    return Path(f).read_text(encoding="utf-8").strip() if f and Path(f).is_file() else ""


def load_settings() -> Settings:
    from . import __version__

    if _str("PG_MODE") and _str("PG_MODE") != "ente":
        raise ValueError("PG_MODE=personale non esiste più: l'edizione personale non usa il server")
    s = Settings(
        version=__version__,
        database_url=_secret("DATABASE_URL"),
        keystore_database_url=_secret("KEYSTORE_DATABASE_URL"),
        migrate_on_start=_bool("MIGRATE_ON_START", True),
        oidc_issuer=_str("OIDC_ISSUER").rstrip("/"),
        oidc_audience=_str("OIDC_AUDIENCE"),
        oidc_jwks_url=_str("OIDC_JWKS_URL"),
        oidc_user_claim=_str("OIDC_USER_CLAIM", "sub"),
        oidc_office_claim=_str("OIDC_OFFICE_CLAIM"),
        oidc_algorithms=_list("OIDC_ALGORITHMS", ["RS256", "PS256", "ES256"]),
        oidc_leeway_s=_int("OIDC_LEEWAY_S", 30),
        # EXTRA_CA_FILE; OIDC_CA_FILE resta accettata come nome precedente
        extra_ca_file=_str("EXTRA_CA_FILE", _str("OIDC_CA_FILE")),
        admin_api_token=_secret("ADMIN_API_TOKEN"),
        openbao_addr=_str("OPENBAO_ADDR", "http://openbao:8200").rstrip("/"),
        openbao_token=_secret("OPENBAO_TOKEN"),
        openbao_role_id=_secret("OPENBAO_ROLE_ID"),
        openbao_secret_id=_secret("OPENBAO_SECRET_ID"),
        openbao_transit_mount=_str("OPENBAO_TRANSIT_MOUNT", "transit"),
        openbao_hmac_key=_str("OPENBAO_HMAC_KEY", "user-hmac"),
        openbao_hmac_key_version=_int("OPENBAO_HMAC_KEY_VERSION", 1),
        openbao_timeout_s=float(_str("OPENBAO_TIMEOUT_S", "10")),
        escrow_public_key_file=_str("ESCROW_PUBLIC_KEY_FILE"),
        escrow_key_id=_escrow_key_id(),
        key_rotation_days=_int("KEY_ROTATION_DAYS", 90),
        pending_entry_minutes=_int("PENDING_ENTRY_MINUTES", 10),
        recovered_key_ttl_days=_int("RECOVERED_KEY_TTL_DAYS", 7),
        device_key_ttl_days=_int("DEVICE_KEY_TTL_DAYS", 30),
        rizzo_url=_str("RIZZO_URL", "http://rizzo-pii:5005").rstrip("/"),
        rizzo_timeout_s=float(_str("RIZZO_TIMEOUT_S", "600")),
        detector_exclude_tags=[t.upper() for t in _list("DETECTOR_EXCLUDE_TAGS", [])],
        detector_batch_chars=_int("DETECTOR_BATCH_CHARS", 200_000),
        fail_closed=_bool("FAIL_CLOSED", True),
        allow_disable=_bool("ALLOW_DISABLE", False),
        max_file_mb=_int("MAX_FILE_MB", 20),
        policy_version=_str("POLICY_VERSION"),
        allowlist_file=_str("ALLOWLIST_FILE", str(_CONFIG_DIR / "allowlist.yml")),
        special_categories_file=_str("SPECIAL_CATEGORIES_FILE",
                                     str(_CONFIG_DIR / "special_categories.yml")),
        special_categories_enabled=_bool("SPECIAL_CATEGORIES_ENABLED", True),
        sites=_list("SITES", ["claude.ai"]),
        dict_ttl_conversation_days=_int("DICT_TTL_CONVERSATION_DAYS", 30),
        dict_ttl_project_inactivity_days=_int("DICT_TTL_PROJECT_INACTIVITY_DAYS", 30),
        project_confirm_interval_days=_int("PROJECT_CONFIRM_INTERVAL_DAYS", 365),
        pending_scope_ttl_hours=_int("PENDING_SCOPE_TTL_HOURS", 24),
        audit_retention_days=_int("AUDIT_RETENTION_DAYS", 90),
        admin_log_retention_days=_int("ADMIN_LOG_RETENTION_DAYS", 730),
        retention_job=_str("RETENTION_JOB", "internal").lower(),
        retention_interval_minutes=_int("RETENTION_INTERVAL_MINUTES", 60),
        deletion_log_dir=_str("DELETION_LOG_DIR", "/var/lib/pseudogate/registro"),
        langfuse_enabled=_bool("LANGFUSE_ENABLED", False),
        langfuse_host=_str("LANGFUSE_HOST", "http://langfuse-web:3000").rstrip("/"),
        langfuse_public_key=_secret("LANGFUSE_PUBLIC_KEY"),
        langfuse_secret_key=_secret("LANGFUSE_SECRET_KEY"),
        langfuse_environment=_str("LANGFUSE_ENVIRONMENT", "production"),
        langfuse_retention_days=_int("LANGFUSE_RETENTION_DAYS", 30),
        cors_allow_origin_regex=_str("CORS_ALLOW_ORIGIN_REGEX", r"^chrome-extension://[a-p]{32}"),
        log_level=_str("LOG_LEVEL", "INFO").upper(),
        source_url=_str("SOURCE_URL"),
    )
    s.validate()
    return s
