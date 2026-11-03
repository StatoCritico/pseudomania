# SPDX-License-Identifier: AGPL-3.0-or-later
"""Langfuse: verifica che l'api invii solo testo pseudonimizzato, con trace_id e userId."""

from __future__ import annotations

from conftest import AUTH
from pseudogate.tracing import LangfuseTracer


class _Obs:
    def end(self):
        pass


class FakeLangfuse:
    def __init__(self):
        self.observations = []
        self.events = []

    def create_trace_id(self):
        return "a" * 32

    def start_observation(self, **kw):
        self.observations.append(kw)
        return _Obs()

    def create_event(self, **kw):
        self.events.append(kw)

    def flush(self):
        pass

    def shutdown(self):
        pass


def test_trace_contains_only_pseudonymized_text(make_client, scope):
    fake = FakeLangfuse()
    tracer = LangfuseTracer("", "", "", "test", "0", client=fake)
    c = make_client(tracer=tracer)
    out = c.post("/v1/pseudonymize", headers=AUTH,
                 json={"scope": scope, "text": "Mario Rossi chiede un parere"}).json()
    assert out["traceId"] == "a" * 32
    c.post("/v1/events", headers=AUTH, json={
        "traceId": out["traceId"], "scope": scope, "event": "response_received",
        "details": {"textPseudonymized": "Gentile [FULLNAME_1], ecco il parere",
                    "unknownTags": []}})
    msg, resp = fake.observations
    assert msg["trace_context"] == {"trace_id": "a" * 32}
    assert msg["name"] == "claude.ai message"
    assert msg["input"] == "[FULLNAME_1] chiede un parere"
    assert msg["metadata"]["entity_counts"] == {"FULLNAME": 1}
    assert resp["output"] == "Gentile [FULLNAME_1], ecco il parere"
    assert "Rossi" not in repr(fake.observations)


def test_source_endpoint(make_client):
    c = make_client(source_url="https://git.ente.local/pseudogate")
    assert c.get("/v1/source").json() == {"license": "AGPL-3.0-or-later",
                                          "source": "https://git.ente.local/pseudogate",
                                          "version": "0.1.0-test"}
