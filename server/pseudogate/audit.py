# SPDX-License-Identifier: AGPL-3.0-or-later
"""Registro delle tracce (tabella audit_events). Mai valori originali: solo
pseudonimi, hash, conteggi e metadati."""

from __future__ import annotations

import hashlib
import logging
from sqlalchemy.engine import Engine

from .db import audit_events, utcnow

log = logging.getLogger("pseudogate.audit")


def sha256(text: str | bytes | None) -> str | None:
    if text is None:
        return None
    if isinstance(text, str):
        text = text.encode("utf-8")
    return hashlib.sha256(text).hexdigest()


class AuditLog:
    def __init__(self, engine: Engine):
        self.engine = engine

    def record(self, *, user_pseudonym: str, action: str, office: str | None = None,
               site: str | None = None,
               scope_type: str | None = None, scope_hash: str | None = None,
               kind: str | None = None, entity_counts: dict | None = None,
               blocked: bool = False, block_category: str | None = None,
               prompt_sha256: str | None = None, response_sha256: str | None = None,
               latency_ms: int | None = None, trace_id: str | None = None,
               details: dict | None = None) -> None:
        row = dict(ts=utcnow(), user_pseudonym=user_pseudonym, office=office, action=action, site=site,
                   scope_type=scope_type, scope_hash=scope_hash, kind=kind,
                   entity_counts=entity_counts or {}, blocked=blocked,
                   block_category=block_category, prompt_sha256=prompt_sha256,
                   response_sha256=response_sha256, latency_ms=latency_ms,
                   trace_id=trace_id, details=details or {})
        try:
            with self.engine.begin() as conn:
                conn.execute(audit_events.insert(), [row])
        except Exception:
            # il registro è obbligatorio: l'errore risale e la richiesta fallisce
            log.exception("Scrittura del registro fallita (azione %s)", action)
            raise

