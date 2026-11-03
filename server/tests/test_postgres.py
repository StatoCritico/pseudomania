# SPDX-License-Identifier: AGPL-3.0-or-later
"""Flussi principali su PostgreSQL (DB applicativo e key store separati). Eseguito solo con
PG_TEST_URL e PG_TEST_KEYS_URL, es.
  PG_TEST_URL=postgresql://pseudogate_app:pw@127.0.0.1:5432/pseudogate
  PG_TEST_KEYS_URL=postgresql://pseudogate_keys_app:pw@127.0.0.1:5432/pseudogate_keys"""

from __future__ import annotations

from datetime import timedelta

import pytest
from sqlalchemy import text, update

from conftest import AUTH, pg_keys_url, pg_url
from support.client import ExtensionEmulator

pytestmark = pytest.mark.skipif(not (pg_url() and pg_keys_url()),
                                reason="PG_TEST_URL / PG_TEST_KEYS_URL non impostati")


@pytest.fixture
def pg_client(make_client):
    from pseudogate.db import make_engine
    engine, kengine = make_engine(pg_url()), make_engine(pg_keys_url())
    with engine.begin() as c:
        c.execute(text("DROP TABLE IF EXISTS dict_entries, dict_scopes, audit_events, audit_daily, "
                       "judicial_holds, deletion_log, admin_log, schema_migrations CASCADE"))
    with kengine.begin() as c:
        c.execute(text("DROP TABLE IF EXISTS escrows, device_keys, recovered_keys, rotation_requests, "
                       "schema_migrations CASCADE"))
    return make_client(engine=engine, keys_engine=kengine)


def test_pg_flow(pg_client, scope):
    c = pg_client
    ext = ExtensionEmulator(c, AUTH)
    ext.setup()
    out = ext.pseudonymize(scope, "Mario Rossi e Giulia Bianchi, ancora mario rossi")
    assert out["text"] == "[FULLNAME_1] e [FULLNAME_2], ancora [FULLNAME_1]"
    assert ext.dictionary(scope) == {"[FULLNAME_1]": "Mario Rossi", "[FULLNAME_2]": "Giulia Bianchi"}
    pending = {"type": "conversation", "id": "pending:aaaa-bbbb"}
    ext.pseudonymize(pending, "Luca Verdi")
    other = {"type": "conversation", "id": "e1a3c7a2-0000-4000-8000-000000000001"}
    assert c.post("/v1/scopes/rebind", headers=AUTH, json={"from": pending, "to": other}).status_code == 204
    assert ext.dictionary(other) == {"[FULLNAME_1]": "Luca Verdi"}
    svc = c.app.state.svc
    from pseudogate import registri, retention
    from pseudogate.db import audit_events, utcnow
    c.delete(f"/v1/scopes/{other['type']}/{other['id']}", headers=AUTH)
    with svc.engine.begin() as conn:
        conn.execute(update(audit_events).values(ts=utcnow() - timedelta(days=91)))
    counts = retention.run_once(svc)
    assert counts.get("audit_aggregati", 0) >= 1
    assert registri.verify(svc.engine, "deletion_log")[0]
    # trigger append-only attivo in PostgreSQL
    with pytest.raises(Exception):
        with svc.engine.begin() as conn:
            conn.execute(text("UPDATE deletion_log SET reason = 'x'"))
    with svc.engine.connect() as conn:
        n = conn.execute(text("SELECT count(*) FROM audit_daily WHERE entity_counts ? 'FULLNAME'")).scalar()
    assert n >= 1
