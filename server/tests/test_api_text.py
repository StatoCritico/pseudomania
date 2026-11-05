# SPDX-License-Identifier: AGPL-3.0-or-later
from __future__ import annotations

import json
from datetime import timedelta
from pathlib import Path

from sqlalchemy import select, update

from conftest import AUTH, AUTH2
from pseudogate.db import audit_events, dict_entries, utcnow
from support.client import ExtensionEmulator


def _ps(client, scope, text, kind="message", headers=AUTH):
    r = client.post("/v1/pseudonymize", headers=headers,
                    json={"scope": scope, "site": "claude.ai", "kind": kind, "text": text})
    assert r.status_code == 200, r.text
    return r.json()


def test_health_without_auth(client):
    r = client.get("/v1/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "version": "0.1.0-test", "mode": "ente",
                        "detector": "ok", "keys": "ok"}


def test_health_detector_down(client, fake_rizzo):
    fake_rizzo.down = True
    h = client.get("/v1/health").json()
    assert h["detector"] == "down" and h["status"] == "degraded"


def test_config_requires_auth(client):
    r = client.get("/v1/config")
    assert r.status_code == 401
    assert r.json()["error"] == "unauthorized"


def test_config(client, escrow_key):
    c = client.get("/v1/config", headers=AUTH).json()
    assert {"mode", "failClosed", "allowDisable", "tagInstruction", "allowlist", "policyVersion",
            "maxFileMB", "escrowPublicKey", "escrowKeyId", "rotateKey"} <= set(c)
    assert c["mode"] == "ente"
    assert c["tagInstruction"] == (
        "I testi contengono segnaposto tra parentesi quadre come [FULLNAME_n] o [CF_n] (n = numero). "
        "Riportali esattamente come sono, senza modificarli, tradurli, declinarli o spiegarli, "
        "e non crearne di nuovi.")
    assert c["escrowKeyId"] == escrow_key[2]
    from cryptography.hazmat.primitives import serialization
    import base64
    pub = serialization.load_der_public_key(base64.b64decode(c["escrowPublicKey"]))
    assert pub.key_size == 4096
    assert c["rotateKey"] is False


def test_pseudonymize_offsets_newentries_and_same_tag(client, scope):
    text = "  Ciao, sono Mario Rossi (mario.rossi@example.it). Scrivi a MARIO ROSSI."
    out = _ps(client, scope, text)
    assert out["text"] == "  Ciao, sono [FULLNAME_1] ([EMAIL_1]). Scrivi a [FULLNAME_1]."
    for e in out["entities"]:
        assert text[e["start"]:e["end"]].casefold() in ("mario rossi", "mario.rossi@example.it")
    assert out["newEntries"] == [{"tag": "[FULLNAME_1]", "value": "Mario Rossi"},
                                 {"tag": "[EMAIL_1]", "value": "mario.rossi@example.it"}]


def test_pending_entries_reoffered_until_uploaded(ext, client, scope):
    out = ext.pseudonymize(scope, "Mario Rossi", upload=False)
    assert out["newEntries"] == [{"tag": "[FULLNAME_1]", "value": "Mario Rossi"}]
    # non caricata: riproposta alla volta successiva
    out = ext.pseudonymize(scope, "di nuovo Mario Rossi")
    assert out["newEntries"] == [{"tag": "[FULLNAME_1]", "value": "Mario Rossi"}]
    # caricata: non più proposta
    assert ext.pseudonymize(scope, "Mario Rossi ancora")["newEntries"] == []


def test_full_roundtrip_client_side(ext, scope):
    out = ext.pseudonymize(scope, "Mario Rossi, CF RSSMRA85H12F205Y, scrive a Giulia Bianchi")
    assert out["text"] == "[FULLNAME_1], CF [CF_1], scrive a [FULLNAME_2]"
    reply = "Gentile [FULLNAME_1], il CF \\[CF\\_1\\] di [FULLNAME_2] e [FULLNAME_9]."
    assert ext.restore(scope, reply) == ("Gentile Mario Rossi, il CF RSSMRA85H12F205Y di Giulia "
                                         "Bianchi e [FULLNAME_9].")


def test_dictionary_shape_and_no_plaintext(ext, client, scope):
    ext.pseudonymize(scope, "Mario Rossi")
    d = client.get("/v1/dictionary", headers=AUTH,
                   params={"scope_type": scope["type"], "scope_id": scope["id"]}).json()
    e = d["entries"]["[FULLNAME_1]"]
    assert set(e) == {"ciphertext", "iv", "keyId"} and e["keyId"] == ext.key_id
    assert "Mario" not in json.dumps(d)
    assert d["expiresAt"].endswith("+00:00") and d["confirmBy"] is None


def test_upload_validation(ext, client, scope):
    ext.pseudonymize(scope, "Mario Rossi e Giulia Bianchi", upload=False)
    good = ext.encrypt(scope, "[FULLNAME_1]", "Mario Rossi")
    bad_iv = dict(ext.encrypt(scope, "[FULLNAME_2]", "Giulia Bianchi"), iv="AAAA")
    unknown_key = ext.encrypt(scope, "[FULLNAME_2]", "Giulia Bianchi")
    unknown_key["keyId"] = "11111111-2222-3333-4444-555555555555"
    missing = ext.encrypt(scope, "[FULLNAME_7]", "x")
    r = client.post("/v1/dictionary/entries", headers=AUTH, json={
        "scope": scope, "entries": [good, bad_iv, unknown_key, missing]}).json()
    assert r["stored"] == 1
    reasons = {x["reason"] for x in r["rejected"]}
    assert reasons == {"iv_non_valido", "keyId_senza_escrow", "non_in_attesa_o_scaduta"}
    # una voce già caricata non si sovrascrive
    r = client.post("/v1/dictionary/entries", headers=AUTH, json={"scope": scope, "entries": [good]}).json()
    assert r["stored"] == 0


def test_pending_upload_expires(ext, client, scope):
    out = ext.pseudonymize(scope, "Mario Rossi", upload=False)
    svc = client.app.state.svc
    with svc.engine.begin() as c:
        c.execute(update(dict_entries).values(pending_until=utcnow() - timedelta(minutes=1)))
    r = ext.upload(scope, out["newEntries"])
    assert r["stored"] == 0 and r["rejected"][0]["reason"] == "non_in_attesa_o_scaduta"


def test_special_category_blocked(client, scope):
    out = _ps(client, scope, "Mario Rossi ha consegnato il certificato medico ieri.")
    assert out["blocked"] is True and out["text"] == "" and out["newEntries"] == []
    assert "art. 9" in out["blockReason"]
    assert "«Segnala blocco errato»" in out["blockReason"] and "pannello laterale" in out["blockReason"]
    svc = client.app.state.svc
    with svc.engine.connect() as c:
        assert c.execute(select(dict_entries)).all() == []
        rows = c.execute(select(audit_events)).mappings().all()
    assert rows[-1]["blocked"] and rows[-1]["block_category"] == "salute"


def test_allowlist_terms_not_masked(client, scope):
    out = _ps(client, scope, "Il Comune di Esempio scrive a Mario Rossi")
    assert out["text"] == "Il Comune di Esempio scrive a [FULLNAME_1]"


def test_rebind_and_conflict(ext, client, scope):
    pending = {"type": "conversation", "id": "pending:7d444840-9dc0-11d1-b245-5ffdce74fad2"}
    ext.pseudonymize(pending, "Anna Neri")
    r = client.post("/v1/scopes/rebind", headers=AUTH, json={"from": pending, "to": scope})
    assert r.status_code == 204
    d = client.get("/v1/dictionary", headers=AUTH,
                   params={"scope_type": scope["type"], "scope_id": scope["id"]}).json()
    assert d["entries"]["[FULLNAME_1]"]["aadScope"] == pending
    assert ext.dictionary(scope) == {"[FULLNAME_1]": "Anna Neri"}
    other = {"type": "conversation", "id": "pending:11111111-2222-3333-4444-555555555555"}
    ext.pseudonymize(other, "Luca Verdi")
    r = client.post("/v1/scopes/rebind", headers=AUTH, json={"from": other, "to": scope})
    assert r.status_code == 409 and r.json()["error"] == "rebind_conflict"


def test_delete_scope_logs_deletion(ext, client, scope):
    ext.pseudonymize(scope, "Mario Rossi")
    assert client.delete(f"/v1/scopes/{scope['type']}/{scope['id']}", headers=AUTH).status_code == 204
    assert ext.dictionary(scope) == {}
    from pseudogate import registri
    ok, n, _ = registri.verify(client.app.state.svc.engine, "deletion_log")
    assert ok and n == 1


def test_users_isolated(ext, client, scope):
    ext.pseudonymize(scope, "Mario Rossi")
    other = ExtensionEmulator(client, AUTH2)
    other.setup()
    assert other.dictionary(scope) == {}
    out = other.pseudonymize(scope, "Luca Verdi")
    assert out["text"] == "[FULLNAME_1]"
    # non può caricare voci con la chiave di un altro utente
    r = client.post("/v1/dictionary/entries", headers=AUTH2, json={
        "scope": scope, "entries": [ext.encrypt(scope, "[FULLNAME_1]", "x")]}).json()
    assert r["rejected"][0]["reason"] in ("keyId_senza_escrow", "non_in_attesa_o_scaduta")


def test_project_confirm(ext, client):
    proj = {"type": "project", "id": "c6f0b2d6-1b5c-4f5e-9d47-7a6f1f6a2b11"}
    ext.pseudonymize(proj, "Mario Rossi")
    d1 = client.get("/v1/dictionary", headers=AUTH, params={"scope_type": "project", "scope_id": proj["id"]}).json()
    assert d1["confirmBy"]
    assert client.post(f"/v1/scopes/project/{proj['id']}/confirm", headers=AUTH).status_code == 204
    assert client.post("/v1/scopes/conversation/abc/confirm", headers=AUTH).status_code == 400


def test_events_and_sha256(client, scope):
    out = _ps(client, scope, "Mario Rossi")
    r = client.post("/v1/events", headers=AUTH, json={
        "traceId": out["traceId"], "scope": scope, "event": "response_received",
        "details": {"textPseudonymized": "Ciao [FULLNAME_1]", "unknownTags": []}})
    assert r.status_code == 204
    svc = client.app.state.svc
    with svc.engine.connect() as c:
        rows = c.execute(select(audit_events).order_by(audit_events.c.id)).mappings().all()
    import hashlib
    ps = [r for r in rows if r["action"] == "pseudonymize"][0]
    assert ps["prompt_sha256"] == hashlib.sha256(out["text"].encode()).hexdigest()
    assert ps["office"] == "Ufficio Tributi"


def test_detector_down_returns_503(client, scope, fake_rizzo):
    fake_rizzo.down = True
    r = client.post("/v1/pseudonymize", headers=AUTH, json={"scope": scope, "text": "Mario Rossi"})
    assert r.status_code == 503 and r.json()["error"] == "detector_unavailable"


def test_no_plaintext_in_databases(ext, client, scope, tmp_path):
    ext.pseudonymize(scope, "Mario Rossi scrive a giulia bianchi")
    ext.dictionary(scope)
    svc = client.app.state.svc
    svc.engine.dispose()
    svc.keystore.engine.dispose()
    blob = b"".join(p.read_bytes() for p in Path(tmp_path).glob("*.sqlite3*"))
    assert b"Mario" not in blob and b"giulia" not in blob.lower() and b"Rossi" not in blob


def test_cors_put_and_rebind_conflict_event(client):
    r = client.options("/v1/dictionary/rekey", headers={
        "Origin": "chrome-extension://abcdefghijklmnopabcdefghijklmnop",
        "Access-Control-Request-Method": "PUT"})
    assert r.status_code == 200 and "PUT" in r.headers["access-control-allow-methods"]
    for body in ({"event": "scope_rebind_conflict", "details": {}},
                 {"event": "page_unrecognized", "details": {"reason": "scope_rebind_conflict"}}):
        assert client.post("/v1/events", headers=AUTH, json=body).status_code == 204


def test_image_events_only_safe_details(client, scope):
    """Eventi delle immagini e dei file: accettati, nel registro solo motivi e contatori."""
    for body in ({"event": "image_sent_confirmed", "details": {"kind": "attachment", "bytes": 1234}},
                 {"event": "image_cancelled", "details": {"kind": "attachment"}},
                 {"event": "blocked", "details": {"reason": "image", "policy": "block",
                                                  "nome": "Screenshot Mario Rossi.png"}},
                 {"event": "network_blocked", "details": {"reason": "Mario Rossi ha scritto"}}):
        assert client.post("/v1/events", headers=AUTH, json=dict(body, scope=scope)).status_code == 204
    svc = client.app.state.svc
    with svc.engine.connect() as c:
        rows = c.execute(select(audit_events).order_by(audit_events.c.id)).mappings().all()
    dump = json.dumps([dict(r) for r in rows], default=str)
    assert "Mario" not in dump
    acts = [r["action"] for r in rows]
    assert "image_sent_confirmed" in acts and "image_cancelled" in acts
