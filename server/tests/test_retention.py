# SPDX-License-Identifier: AGPL-3.0-or-later
from __future__ import annotations

import json
from datetime import timedelta

import httpx
import pytest
from sqlalchemy import func, select, update

from conftest import AUTH
from pseudogate import registri, retention
from pseudogate.db import (audit_daily, audit_events, deletion_log, dict_entries, dict_scopes,
                           escrows, utcnow)
from pseudogate.holds import Holds


def _count(engine, table, **where):
    q = select(func.count()).select_from(table)
    for k, v in where.items():
        q = q.where(getattr(table.c, k) == v)
    with engine.connect() as c:
        return c.execute(q).scalar()


def _age(engine, scope_id, **vals):
    with engine.begin() as c:
        c.execute(update(dict_scopes).where(dict_scopes.c.scope_id == scope_id).values(**vals))


def test_retention_rules_holds_and_escrow(ext, client):
    svc = client.app.state.svc
    now = utcnow()
    scopes = {
        "c-old": ("conversation", dict(last_used_at=now - timedelta(days=31))),
        "c-new": ("conversation", dict(created_at=now - timedelta(days=200), last_used_at=now - timedelta(days=29))),
        "p-idle": ("project", dict(last_used_at=now - timedelta(days=31))),
        "p-unconfirmed": ("project", dict(created_at=now - timedelta(days=366))),
        "p-confirmed": ("project", dict(created_at=now - timedelta(days=500),
                                        confirmed_at=now - timedelta(days=100))),
        "pending:abc": ("conversation", dict(created_at=now - timedelta(hours=25))),
        "c-held": ("conversation", dict(last_used_at=now - timedelta(days=60))),
    }
    for sid, (st, _) in scopes.items():
        ext.pseudonymize({"type": st, "id": sid}, "Mario Rossi")
    for sid, (_, vals) in scopes.items():
        _age(svc.engine, sid, **vals)
    owner = svc.auth.map[AUTH["Authorization"][7:]].user_pseudonym
    Holds(svc.engine).add(owner=owner, reference="Prot. 1/2026", actor="test",
                          scope_type="conversation", scope_id="c-held")
    counts = retention.run_once(svc)
    left = {r[0] for r in svc.engine.connect().execute(select(dict_entries.c.scope_id).distinct())}
    assert left == {"c-new", "p-confirmed", "c-held"}
    assert counts["scope"] == 4 and counts["scope_bloccati"] == 1
    # l'escrow resta: la chiave ha ancora voci vive
    assert _count(svc.keystore.engine, escrows) == 1
    # cancellazione di tutto: l'escrow della chiave senza voci viene distrutto
    for sid in ("c-new", "p-confirmed"):
        client.delete(f"/v1/scopes/{scopes[sid][0]}/{sid}", headers=AUTH)
    retention.run_once(svc)
    assert _count(svc.keystore.engine, escrows) == 1  # c-held è bloccato -> chiave ancora viva
    hold_id = Holds(svc.engine).active()[0]["id"]
    Holds(svc.engine).revoke(hold_id, actor="test", reference="Prot. 2/2026")
    retention.run_once(svc)
    assert _count(svc.engine, dict_entries) == 0
    assert _count(svc.keystore.engine, escrows) == 0
    ok, n, _ = registri.verify(svc.engine, "deletion_log")
    assert ok and n >= 7
    ok, _, _ = registri.verify(svc.engine, "admin_log")
    assert ok
    # esportazione JSONL del registro cancellazioni
    lines = (svc.settings.deletion_log_dir + "/cancellazioni.jsonl")
    rows = [json.loads(x) for x in open(lines, encoding="utf-8")]
    assert {r["object"] for r in rows} == {"scope", "escrow"}
    assert all("Mario" not in json.dumps(r) for r in rows)


def test_new_key_without_entries_is_not_deleted(ext, client):
    svc = client.app.state.svc
    retention.run_once(svc)
    assert _count(svc.keystore.engine, escrows) == 1


def test_audit_aggregation(client, scope):
    client.post("/v1/pseudonymize", headers=AUTH, json={"scope": scope, "text": "Mario Rossi"})
    client.post("/v1/pseudonymize", headers=AUTH, json={"scope": scope, "text": "Luca Verdi"})
    svc = client.app.state.svc
    with svc.engine.begin() as c:
        c.execute(update(audit_events).values(ts=utcnow() - timedelta(days=91)))
    retention.run_once(svc)
    assert _count(svc.engine, audit_events) == 0
    with svc.engine.connect() as c:
        rows = c.execute(select(audit_daily)).mappings().all()
    ps = [r for r in rows if r["action"] == "pseudonymize"][0]
    counts = ps["entity_counts"] if isinstance(ps["entity_counts"], dict) else json.loads(ps["entity_counts"])
    assert ps["events"] == 2 and counts == {"FULLNAME": 2} and ps["office"] == "Ufficio Tributi"
    assert "user_pseudonym" not in ps


def test_append_only_registry(ext, client, scope):
    svc = client.app.state.svc
    ext.pseudonymize(scope, "Mario Rossi")
    client.delete(f"/v1/scopes/{scope['type']}/{scope['id']}", headers=AUTH)
    with pytest.raises(Exception):
        with svc.engine.begin() as c:
            c.execute(update(deletion_log).values(reason="falso"))
    with pytest.raises(Exception):
        with svc.engine.begin() as c:
            c.execute(deletion_log.delete())


def test_reapply_deletions_after_restore(ext, client, scope, tmp_path):
    """Simula un ripristino: il DB torna allo stato precedente alla cancellazione e
    l'esportazione del registro viene riapplicata."""
    import shutil
    svc = client.app.state.svc
    ext.pseudonymize(scope, "Mario Rossi")
    svc.engine.dispose()
    db_file = svc.settings.database_url[len("sqlite:///"):]
    shutil.copy(db_file, tmp_path / "backup.sqlite3")
    client.delete(f"/v1/scopes/{scope['type']}/{scope['id']}", headers=AUTH)
    retention.run_once(svc)  # esporta il registro
    svc.engine.dispose()
    for suffix in ("-wal", "-shm"):
        try:
            (tmp_path / ("app.sqlite3" + suffix)).unlink()
        except FileNotFoundError:
            pass
    shutil.copy(tmp_path / "backup.sqlite3", db_file)  # "ripristino"
    assert _count(svc.engine, dict_entries) == 1
    done = retention.reapply_deletions(svc, svc.settings.deletion_log_dir + "/cancellazioni.jsonl", "test")
    assert done["voci"] == 1 and _count(svc.engine, dict_entries) == 0


def test_langfuse_purge_v4_observations_api():
    calls = []

    def handler(req: httpx.Request):
        calls.append((req.method, req.url.path, dict(req.url.params)))
        if req.url.path == "/api/public/v2/observations":
            if "cursor" not in req.url.params:
                return httpx.Response(200, json={"data": [{"traceId": "t1"}, {"traceId": "t1"},
                                                          {"traceId": "t2"}], "meta": {"cursor": "c2"}})
            return httpx.Response(200, json={"data": [{"traceId": "t3"}], "meta": {}})
        assert req.method == "DELETE" and req.url.path == "/api/public/traces"
        assert req.headers["authorization"].startswith("Basic ")
        assert json.loads(req.content) == {"traceIds": ["t1", "t2", "t3"]}
        return httpx.Response(200, json={"message": "Traces deleted successfully"})
    n = retention.purge_langfuse("http://lf", "pk", "sk", 7, transport=httpx.MockTransport(handler))
    assert n == 3
    assert "toStartTime" in calls[0][2] and calls[0][2]["limit"] == "1000"


def test_langfuse_purge_legacy_fallback():
    calls = []

    def handler(req: httpx.Request):
        calls.append((req.method, req.url.path))
        if req.url.path == "/api/public/v2/observations":
            return httpx.Response(404, json={"message": "not available"})
        if req.method == "GET":
            return httpx.Response(200, json={"data": [{"id": "a"}, {"id": "b"}]})
        assert json.loads(req.content) == {"traceIds": ["a", "b"]}
        return httpx.Response(200, json={})
    assert retention.purge_langfuse("http://lf", "pk", "sk", 7, transport=httpx.MockTransport(handler)) == 2
    assert ("GET", "/api/public/traces") in calls
