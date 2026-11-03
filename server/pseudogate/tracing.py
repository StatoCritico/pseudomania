# SPDX-License-Identifier: AGPL-3.0-or-later
"""Tracce Langfuse (opzionali, LANGFUSE_ENABLED). Solo testo PSEUDONIMIZZATO.

Una trace per invio: name="claude.ai message", userId=user_pseudonym, input = testo
pseudonimizzato, metadata = conteggi entità e latenza. La risposta di Claude arriva
più tardi (evento response_received) e viene agganciata alla stessa trace come
osservazione figlia con output = risposta pseudonimizzata.

Usa l'SDK Python di Langfuse v3+ (basato su OpenTelemetry). Ogni errore di tracciamento
viene registrato e ignorato: Langfuse non deve mai bloccare il servizio.
"""

from __future__ import annotations

import logging
import uuid

log = logging.getLogger("pseudogate.tracing")

TRACE_NAME = "claude.ai message"


class NoopTracer:
    enabled = False

    def new_trace_id(self) -> str:
        return uuid.uuid4().hex

    def message(self, **kw) -> None:
        return None

    def response(self, **kw) -> None:
        return None

    def event(self, **kw) -> None:
        return None

    def shutdown(self) -> None:
        return None


class LangfuseTracer(NoopTracer):
    enabled = True

    def __init__(self, host: str, public_key: str, secret_key: str, environment: str, release: str,
                 client=None):
        if client is None:
            from langfuse import Langfuse

            client = Langfuse(public_key=public_key, secret_key=secret_key, host=host,
                              environment=environment, release=release)
        self._lf = client

    def new_trace_id(self) -> str:
        try:
            return self._lf.create_trace_id()
        except Exception:
            return uuid.uuid4().hex

    def _observe(self, *, trace_id: str, user: str, name: str, input=None, output=None,
                 metadata=None, as_type: str = "span") -> None:
        try:
            from langfuse import propagate_attributes
        except Exception:  # pragma: no cover - SDK non installato
            propagate_attributes = None
        try:
            if propagate_attributes is not None:
                with propagate_attributes(user_id=user, trace_name=TRACE_NAME):
                    obs = self._lf.start_observation(trace_context={"trace_id": trace_id},
                                                     name=name, as_type=as_type, input=input,
                                                     output=output, metadata=metadata)
                    obs.end()
            else:
                obs = self._lf.start_observation(trace_context={"trace_id": trace_id}, name=name,
                                                 as_type=as_type, input=input, output=output,
                                                 metadata=metadata)
                obs.end()
        except Exception:
            log.warning("Invio della traccia a Langfuse non riuscito", exc_info=True)

    def message(self, *, trace_id: str, user: str, text: str, metadata: dict) -> None:
        self._observe(trace_id=trace_id, user=user, name=TRACE_NAME, input=text, metadata=metadata)

    def response(self, *, trace_id: str, user: str, text: str, metadata: dict) -> None:
        self._observe(trace_id=trace_id, user=user, name="claude.ai response", output=text,
                      metadata=metadata, as_type="generation")

    def event(self, *, trace_id: str, user: str, name: str, metadata: dict) -> None:
        try:
            self._lf.create_event(trace_context={"trace_id": trace_id}, name=name, metadata=metadata)
        except Exception:
            log.warning("Invio dell'evento a Langfuse non riuscito", exc_info=True)

    def shutdown(self) -> None:
        try:
            self._lf.flush()
            self._lf.shutdown()
        except Exception:
            pass


def build_tracer(settings):
    if not settings.langfuse_enabled:
        return NoopTracer()
    try:
        return LangfuseTracer(settings.langfuse_host, settings.langfuse_public_key,
                              settings.langfuse_secret_key, settings.langfuse_environment,
                              settings.version)
    except Exception:
        log.exception("Langfuse non inizializzato: tracciamento disattivato")
        return NoopTracer()
