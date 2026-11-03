# SPDX-License-Identifier: AGPL-3.0-or-later
"""Comandi di servizio e di amministrazione (da eseguire nel container dell'api):

    docker compose exec api python -m pseudogate <comando> ...

  serve                                   avvia l'API (uvicorn)
  migrate                                 migrazioni di DB applicativo e key store
  retention                               esegue una volta la pulizia (per cron)

  blocchi aggiungi --rif PROT (--sub S | --pseudonimo P) [--scope tipo:id] [--nota T]
  blocchi revoca ID --rif PROT
  blocchi elenca
  custodia esporta-escrow (--sub S | --pseudonimo P) [--key-id K] --out FILE|-
  custodia esporta-voci   (--sub S | --pseudonimo P) [--scope tipo:id] [--tag T ...] --out FILE|-
      --out -     su stdout:  docker compose exec -T api python -m pseudogate ... --out - > escrow.json
      --out nome  in /var/lib/pseudogate/esportazioni (= deploy/esportazioni sull'host)
  custodia importa-recuperate --file FILE
  chiavi forza-rotazione (--sub S | --pseudonimo P | --tutti) --motivo TESTO
  cancellazioni esporta [--dir DIR]
  cancellazioni riapplica --file FILE     dopo un ripristino da backup
  registri verifica                       integrità delle catene di hash

Ogni comando amministrativo è registrato in admin_log (append-only, catena di hash) con
l'operatore indicato da --operatore (o dalla variabile PSEUDOGATE_OPERATORE).
--sub calcola lo pseudonimo con la chiave HMAC in OpenBao (deve essere sbloccato).
"""

from __future__ import annotations

import argparse
import json
import os
import sys


def _services():
    from .main import build_services
    from .settings import load_settings
    s = load_settings()
    return build_services(s, auth=object(), tracer=None, detector=object())


def _owner(svc, a) -> str:
    if getattr(a, "pseudonimo", None):
        return a.pseudonimo
    if getattr(a, "sub", None):
        return svc.keys.user_pseudonym(a.sub)
    raise SystemExit("Indicare --sub oppure --pseudonimo")


def _scope_arg(v: str | None):
    if not v:
        return None, None
    t, _, i = v.partition(":")
    from .dictionary import make_scope
    sc = make_scope(t, i)
    return sc.type, sc.id


EXPORT_DIR = "/var/lib/pseudogate/esportazioni"


def _write(path: str, data: dict) -> None:
    """--out -  scrive su stdout (es. `docker compose exec -T api ... --out - > file`);
    un nome senza cartella va in EXPORT_DIR (volume deploy/esportazioni, escluso dai backup)."""
    if path == "-":
        json.dump(data, sys.stdout, ensure_ascii=False, indent=1)
        sys.stdout.write("\n")
        return
    if os.sep not in path and os.path.isdir(EXPORT_DIR):
        path = os.path.join(EXPORT_DIR, path)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=1)


def _parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(prog="python -m pseudogate", description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--operatore", default=os.environ.get("PSEUDOGATE_OPERATORE", ""))
    sub = ap.add_subparsers(dest="cmd")
    sub.add_parser("serve")
    sub.add_parser("migrate")
    sub.add_parser("retention")

    def who(p, required=True):
        g = p.add_mutually_exclusive_group(required=required)
        g.add_argument("--sub")
        g.add_argument("--pseudonimo")
        return g

    b = sub.add_parser("blocchi").add_subparsers(dest="sub_cmd", required=True)
    p = b.add_parser("aggiungi")
    who(p)
    p.add_argument("--rif", required=True)
    p.add_argument("--scope")
    p.add_argument("--nota")
    p = b.add_parser("revoca")
    p.add_argument("id", type=int)
    p.add_argument("--rif", required=True)
    b.add_parser("elenca")

    c = sub.add_parser("custodia").add_subparsers(dest="sub_cmd", required=True)
    p = c.add_parser("esporta-escrow")
    who(p)
    p.add_argument("--key-id")
    p.add_argument("--out", required=True)
    p = c.add_parser("esporta-voci")
    who(p)
    p.add_argument("--scope")
    p.add_argument("--tag", action="append")
    p.add_argument("--out", required=True)
    p = c.add_parser("importa-recuperate")
    p.add_argument("--file", required=True)

    k = sub.add_parser("chiavi").add_subparsers(dest="sub_cmd", required=True)
    p = k.add_parser("forza-rotazione")
    g = who(p)
    g.add_argument("--tutti", action="store_true")
    p.add_argument("--motivo", required=True)

    d = sub.add_parser("cancellazioni").add_subparsers(dest="sub_cmd", required=True)
    p = d.add_parser("esporta")
    p.add_argument("--dir")
    p = d.add_parser("riapplica")
    p.add_argument("--file", required=True)

    r = sub.add_parser("registri").add_subparsers(dest="sub_cmd", required=True)
    r.add_parser("verifica")
    return ap


def main(argv: list[str]) -> int:
    a = _parser().parse_args(argv[1:])
    cmd = a.cmd or "serve"
    if cmd == "serve":
        import uvicorn
        uvicorn.run("pseudogate.main:app_factory", factory=True,
                    host=os.environ.get("HOST", "0.0.0.0"), port=int(os.environ.get("PORT", "8787")),
                    workers=int(os.environ.get("WORKERS", "1")), access_log=False,
                    proxy_headers=True, forwarded_allow_ips=os.environ.get("FORWARDED_ALLOW_IPS", "127.0.0.1"))
        return 0

    from . import registri, retention
    from .db import migrate
    svc = _services()
    migrate(svc.engine, "app")
    migrate(svc.keystore.engine, "keys")
    if cmd == "migrate":
        print(json.dumps({"ok": True}))
        return 0
    if cmd == "retention":
        print(json.dumps(retention.run_once(svc), default=str))
        return 0

    actor = a.operatore or "non indicato"
    if a.cmd != "registri" and not a.operatore and a.sub_cmd not in ("elenca",):
        print("ATTENZIONE: operatore non indicato (--operatore o PSEUDOGATE_OPERATORE)", file=sys.stderr)

    if cmd == "blocchi":
        from .holds import Holds
        h = Holds(svc.engine)
        if a.sub_cmd == "aggiungi":
            st, sid = _scope_arg(a.scope)
            hid = h.add(owner=_owner(svc, a), reference=a.rif, actor=actor, scope_type=st,
                        scope_id=sid, note=a.nota)
            print(json.dumps({"blocco": hid}))
        elif a.sub_cmd == "revoca":
            h.revoke(a.id, actor=actor, reference=a.rif)
            print(json.dumps({"revocato": a.id}))
        else:
            print(json.dumps(h.all(), default=str, indent=1, ensure_ascii=False))
        return 0

    if cmd == "custodia":
        if a.sub_cmd == "esporta-escrow":
            owner = _owner(svc, a)
            data = svc.keystore.export_owner(owner, a.key_id)
            _write(a.out, data)
            registri.log_admin(svc.engine, actor, "escrow_esportato", owner_pseudonym=owner,
                               key_id=a.key_id, escrows=len(data["escrows"]))
            print(json.dumps({"escrows": len(data["escrows"]), "out": a.out}),
                  file=sys.stderr if a.out == "-" else sys.stdout)
        elif a.sub_cmd == "esporta-voci":
            from sqlalchemy import select

            from .db import dict_entries
            owner = _owner(svc, a)
            st, sid = _scope_arg(a.scope)
            q = select(dict_entries).where(dict_entries.c.owner_pseudonym == owner,
                                           dict_entries.c.ciphertext.is_not(None))
            if st:
                q = q.where(dict_entries.c.scope_type == st, dict_entries.c.scope_id == sid)
            if a.tag:
                q = q.where(dict_entries.c.tag.in_(a.tag))
            with svc.engine.connect() as conn:
                rows = conn.execute(q.order_by(dict_entries.c.id)).mappings().all()
            data = {"formato": "pseudomania-voci-export", "versione": 1, "ownerPseudonym": owner,
                    "entries": [{"scopeType": r["scope_type"], "scopeId": r["scope_id"],
                                 "tag": r["tag"], "entityType": r["entity_type"],
                                 "ciphertext": r["ciphertext"], "iv": r["iv"], "keyId": r["key_id"],
                                 # AAD = scope al momento della cifratura (diverso dopo un rebind)
                                 "aadScope": r["aad_scope"]}
                                for r in rows]}
            _write(a.out, data)
            registri.log_admin(svc.engine, actor, "voci_esportate", owner_pseudonym=owner,
                               scope_type=st, scope_id=sid, tags=a.tag, voci=len(rows))
            print(json.dumps({"voci": len(rows), "out": a.out}),
                  file=sys.stderr if a.out == "-" else sys.stdout)
        else:
            with open(a.file, encoding="utf-8") as fh:
                data = json.load(fh)
            items = data.get("keys", data if isinstance(data, list) else [])
            n = svc.keystore.add_recovered(items)
            registri.log_admin(svc.engine, actor, "chiavi_recuperate_importate", count=n,
                               devices=sorted({i.get("deviceKeyId") for i in items}))
            print(json.dumps({"importate": n}))
        return 0

    if cmd == "chiavi":
        owner = "*" if a.tutti else _owner(svc, a)
        svc.keystore.request_rotation(owner, a.motivo)
        registri.log_admin(svc.engine, actor, "rotazione_forzata", owner_pseudonym=owner, motivo=a.motivo)
        print(json.dumps({"rotazione_richiesta": owner}))
        return 0

    if cmd == "cancellazioni":
        if a.sub_cmd == "esporta":
            n = registri.export_deletions(svc.engine, a.dir or svc.settings.deletion_log_dir)
            print(json.dumps({"esportate": n}))
        else:
            print(json.dumps(retention.reapply_deletions(svc, a.file, actor)))
        return 0

    if cmd == "registri":
        out = {}
        for t in ("deletion_log", "admin_log"):
            ok, n, msg = registri.verify(svc.engine, t)
            out[t] = {"integro": ok, "righe": n, "esito": msg}
        print(json.dumps(out, ensure_ascii=False))
        return 0 if all(v["integro"] for v in out.values()) else 1
    return 2


def _cli() -> int:  # entry point "pseudogate" (pyproject)
    return main(sys.argv)


if __name__ == "__main__":
    sys.exit(main(sys.argv))
