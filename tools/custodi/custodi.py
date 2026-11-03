#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
"""Strumento OFFLINE dei custodi di Pseudomania (Enterprise edition).

Da usare su un computer NON collegato alla rete (es. portatile dedicato avviato da una
chiavetta live), alla presenza dei custodi, con verbale. Requisiti: Python 3.10+ e il
pacchetto `cryptography` (vedi requirements.txt; per l'installazione offline scaricare
prima la wheel con `pip download cryptography==50.0.1`). Facoltativi: `age` o `gpg` per
cifrare le quote per i singoli custodi.

Comandi:
  genera-chiave   genera la coppia RSA-OAEP-4096 di custodia; scrive la chiave PUBBLICA
                  (da copiare sul server in deploy/custodia/) e divide la PRIVATA in quote
                  Shamir (predefinito 2 di 3); la privata non viene mai scritta su disco
  verifica        ricostruisce la chiave dalle quote e controlla che corrisponda alla pubblica
  ridistribuisci  ricostruisce e ridivide la stessa chiave per nuovi custodi / nuova soglia
  ricifra         recupero su nuovo PC: decifra l'escrow della vecchia chiave utente e la
                  ricifra per la chiave pubblica del dispositivo (file per POST /v1/keys/recovered)
  decifra-voci    richiesta dell'autorità giudiziaria: decifra SOLO le voci indicate da
                  un'esportazione del dizionario
  verbale         modelli di verbale in italiano (generazione, recupero, giudiziaria,
                  cancellazione, ridistribuzione)

Le esportazioni lato server si ottengono con:
  docker compose exec api python -m pseudogate --operatore "..." custodia esporta-escrow ...
  docker compose exec api python -m pseudogate --operatore "..." custodia esporta-voci ...
"""

from __future__ import annotations

import argparse
import base64
import csv
import datetime as _dt
import hashlib
import json
import os
import shutil
import subprocess
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import shamir  # noqa: E402

QUOTA_HEADER = "PSEUDOMANIA-QUOTA-CUSTODIA v1"


def _crypto():
    try:
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import padding, rsa
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    except ImportError:  # pragma: no cover
        sys.exit("Manca il pacchetto 'cryptography' (pip install -r requirements.txt)")
    oaep = padding.OAEP(mgf=padding.MGF1(algorithm=hashes.SHA256()), algorithm=hashes.SHA256(), label=None)
    return serialization, rsa, AESGCM, oaep


def _write_private(path: Path, data: str | bytes) -> None:
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "wb") as fh:
        fh.write(data.encode("utf-8") if isinstance(data, str) else data)


def fingerprint(pub) -> str:
    serialization, *_ = _crypto()
    der = pub.public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)
    return hashlib.sha256(der).hexdigest()


# --------------------------------------------------------------------------- quote
def format_share(key_id: str, x: int, k: int, n: int, fp: str, share: bytes) -> str:
    q = base64.b64encode(share).decode("ascii")
    check = hashlib.sha256(share).hexdigest()[:16]
    return (f"{QUOTA_HEADER}\nescrowKeyId: {key_id}\nindice: {x}\nsoglia: {k}\ntotale: {n}\n"
            f"impronta: {fp}\nquota: {q}\ncontrollo: {check}\n")


def parse_share(text: str) -> dict:
    lines = [ln.strip() for ln in text.strip().splitlines() if ln.strip()]
    if not lines or lines[0] != QUOTA_HEADER:
        raise ValueError("non è una quota di custodia di Pseudomania")
    d = dict(ln.split(": ", 1) for ln in lines[1:] if ": " in ln)
    share = base64.b64decode(d["quota"], validate=True)
    if hashlib.sha256(share).hexdigest()[:16] != d["controllo"]:
        raise ValueError(f"quota {d.get('indice')}: codice di controllo errato (copiata male?)")
    return {"key_id": d["escrowKeyId"], "x": int(d["indice"]), "k": int(d["soglia"]),
            "n": int(d["totale"]), "fp": d["impronta"], "share": share}


def _decrypt_external(path: Path, age_identity: str | None) -> str:
    if path.suffix == ".age":
        if not shutil.which("age"):
            sys.exit("'age' non installato")
        cmd = ["age", "-d"] + (["-i", age_identity] if age_identity else []) + [str(path)]
    elif path.suffix in (".gpg", ".asc", ".pgp"):
        if not shutil.which("gpg"):
            sys.exit("'gpg' non installato")
        cmd = ["gpg", "--quiet", "--decrypt", str(path)]
    else:
        return path.read_text(encoding="utf-8")
    return subprocess.run(cmd, check=True, capture_output=True).stdout.decode("utf-8")


def read_shares(paths: list[str], age_identity: str | None = None) -> list[dict]:
    out = []
    for p in paths:
        if p == "-":
            print("Incolla la quota (righe da PSEUDOMANIA-QUOTA... a controllo:), poi riga vuota:",
                  file=sys.stderr)
            buf = []
            while True:
                ln = sys.stdin.readline()
                if not ln or not ln.strip():
                    if buf:
                        break
                    continue
                buf.append(ln)
            out.append(parse_share("".join(buf)))
        else:
            out.append(parse_share(_decrypt_external(Path(p), age_identity)))
    return out


def reconstruct(shares: list[dict]):
    """Ricostruisce la chiave privata di custodia (solo in memoria)."""
    serialization, rsa, _, _ = _crypto()
    if not shares:
        raise ValueError("nessuna quota")
    ids = {s["key_id"] for s in shares}
    fps = {s["fp"] for s in shares}
    if len(ids) != 1 or len(fps) != 1:
        raise ValueError("le quote appartengono a chiavi di custodia diverse")
    k = shares[0]["k"]
    if len(shares) < k:
        raise ValueError(f"servono almeno {k} quote, ricevute {len(shares)}")
    secret = shamir.combine([(s["x"], s["share"]) for s in shares[:k]])
    try:
        key = serialization.load_der_private_key(secret, password=None)
    except ValueError as e:
        raise ValueError("ricostruzione fallita: quote non compatibili") from e
    if fingerprint(key.public_key()) != shares[0]["fp"]:
        raise ValueError("la chiave ricostruita non corrisponde all'impronta delle quote")
    return key, shares[0]["key_id"]


def _encrypt_share_for(text: str, spec: str, dest: Path) -> Path:
    kind, _, recipient = spec.partition(":")
    if kind == "age":
        if not shutil.which("age"):
            sys.exit("'age' non installato")
        out = dest.with_suffix(dest.suffix + ".age")
        subprocess.run(["age", "-r", recipient, "-o", str(out)], input=text.encode(), check=True)
    elif kind == "gpg":
        if not shutil.which("gpg"):
            sys.exit("'gpg' non installato")
        out = dest.with_suffix(dest.suffix + ".gpg")
        subprocess.run(["gpg", "--batch", "--yes", "--trust-model", "always", "-r", recipient,
                        "-o", str(out), "--encrypt"], input=text.encode(), check=True)
    else:
        sys.exit(f"cifratura non riconosciuta: {spec} (usa age:<destinatario> o gpg:<id>)")
    return out


def write_shares(key, key_id: str, n: int, k: int, outdir: Path, cifra: dict[int, str]) -> list[Path]:
    serialization, *_ = _crypto()
    der = bytearray(key.private_bytes(serialization.Encoding.DER, serialization.PrivateFormat.PKCS8,
                                      serialization.NoEncryption()))
    fp = fingerprint(key.public_key())
    shares = shamir.split(bytes(der), n, k)
    # controllo: ogni combinazione minima di quote consecutive ricostruisce la chiave
    for i in range(n - k + 1):
        if shamir.combine(shares[i:i + k]) != bytes(der):
            raise RuntimeError("autoverifica delle quote fallita")
    for i in range(len(der)):
        der[i] = 0
    paths = []
    for x, sh in shares:
        text = format_share(key_id, x, k, n, fp, sh)
        dest = outdir / f"quota-{x}-di-{n}.txt"
        if x in cifra:
            paths.append(_encrypt_share_for(text, cifra[x], dest))
        else:
            _write_private(dest, text)
            paths.append(dest)
    return paths


def _parse_cifra(items: list[str] | None) -> dict[int, str]:
    out = {}
    for it in items or []:
        idx, _, spec = it.partition("=")
        out[int(idx)] = spec
    return out


# --------------------------------------------------------------------------- comandi
def cmd_genera(a) -> int:
    serialization, rsa, _, _ = _crypto()
    outdir = Path(a.out)
    outdir.mkdir(parents=True, exist_ok=True)
    key = rsa.generate_private_key(public_exponent=65537, key_size=a.bit)
    key_id = str(uuid.uuid4())
    pem = key.public_key().public_bytes(serialization.Encoding.PEM,
                                        serialization.PublicFormat.SubjectPublicKeyInfo)
    (outdir / "escrow_public.pem").write_bytes(pem)
    (outdir / "escrow_key_id.txt").write_text(key_id + "\n", encoding="utf-8")
    paths = write_shares(key, key_id, a.quote, a.soglia, outdir, _parse_cifra(a.cifra))
    fp = fingerprint(key.public_key())
    del key
    print(json.dumps({"escrowKeyId": key_id, "impronta": fp, "pubblica": str(outdir / "escrow_public.pem"),
                      "quote": [str(p) for p in paths], "soglia": a.soglia}, indent=1, ensure_ascii=False))
    print("\nConsegnare UNA quota a ciascun custodio; copiare escrow_public.pem ed escrow_key_id.txt "
          "sul server in deploy/custodia/. La chiave privata non è stata scritta su disco.",
          file=sys.stderr)
    return 0


def cmd_verifica(a) -> int:
    serialization, *_ = _crypto()
    key, key_id = reconstruct(read_shares(a.quota, a.identita_age))
    res = {"escrowKeyId": key_id, "impronta": fingerprint(key.public_key()), "esito": "quote valide"}
    if a.pubblica:
        pub = serialization.load_pem_public_key(Path(a.pubblica).read_bytes())
        res["corrisponde_alla_pubblica"] = fingerprint(pub) == res["impronta"]
        if not res["corrisponde_alla_pubblica"]:
            res["esito"] = "ATTENZIONE: la chiave non corrisponde alla pubblica indicata"
    print(json.dumps(res, indent=1, ensure_ascii=False))
    return 0 if res.get("corrisponde_alla_pubblica", True) else 1


def cmd_ridistribuisci(a) -> int:
    key, key_id = reconstruct(read_shares(a.quota, a.identita_age))
    outdir = Path(a.out)
    outdir.mkdir(parents=True, exist_ok=True)
    paths = write_shares(key, key_id, a.quote, a.soglia, outdir, _parse_cifra(a.cifra))
    print(json.dumps({"escrowKeyId": key_id, "quote": [str(p) for p in paths], "soglia": a.soglia},
                     indent=1, ensure_ascii=False))
    print("Distruggere le quote precedenti (verbale di ridistribuzione).", file=sys.stderr)
    return 0


def _load_json(path: str) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def _unwrap_user_key(priv, export: dict, key_id: str) -> bytes:
    _, _, _, oaep = _crypto()
    e = next((e for e in export["escrows"] if e["keyId"] == key_id), None)
    if e is None:
        raise ValueError(f"escrow della chiave {key_id} non presente nell'esportazione")
    return priv.decrypt(base64.b64decode(e["wrappedKey"]), oaep)


def cmd_ricifra(a) -> int:
    serialization, _, _, oaep = _crypto()
    priv, escrow_key_id = reconstruct(read_shares(a.quota, a.identita_age))
    export = _load_json(a.escrow)
    dev = next((d for d in export.get("deviceKeys", []) if d["deviceKeyId"] == a.dispositivo), None)
    if dev is None:
        sys.exit(f"Dispositivo {a.dispositivo} non presente nell'esportazione")
    dev_pub = serialization.load_der_public_key(base64.b64decode(dev["publicKey"]))
    key_ids = a.key_id or [e["keyId"] for e in export["escrows"] if e["escrowKeyId"] == escrow_key_id]
    items = []
    for kid in key_ids:
        raw = bytearray(_unwrap_user_key(priv, export, kid))
        items.append({"ownerPseudonym": export["ownerPseudonym"], "deviceKeyId": a.dispositivo,
                      "keyId": kid, "wrappedKey": base64.b64encode(dev_pub.encrypt(bytes(raw), oaep)).decode()})
        for i in range(len(raw)):
            raw[i] = 0
    _write_private(Path(a.out), json.dumps({"formato": "pseudomania-chiavi-recuperate", "versione": 1,
                                            "keys": items}, indent=1))
    print(json.dumps({"chiavi": len(items), "out": a.out}))
    return 0


def cmd_decifra_voci(a) -> int:
    _, _, AESGCM, _ = _crypto()
    priv, _ = reconstruct(read_shares(a.quota, a.identita_age))
    export = _load_json(a.escrow)
    voci = _load_json(a.voci)
    if voci.get("ownerPseudonym") != export.get("ownerPseudonym"):
        sys.exit("Le due esportazioni riguardano utenti diversi")
    scope = tuple(a.scope.split(":", 1)) if a.scope else None
    wanted = set(a.tag or [])
    selected = [e for e in voci["entries"]
                if (not wanted or e["tag"] in wanted)
                and (scope is None or (e["scopeType"], e["scopeId"]) == scope)]
    keys: dict[str, bytes] = {}
    rows = []
    for e in selected:
        if e["keyId"] not in keys:
            keys[e["keyId"]] = _unwrap_user_key(priv, export, e["keyId"])
        aad_scope = e.get("aadScope") or f"{e['scopeType']}|{e['scopeId']}"
        aad = f"{aad_scope}|{e['tag']}".encode("utf-8")
        value = AESGCM(keys[e["keyId"]]).decrypt(base64.b64decode(e["iv"]),
                                                 base64.b64decode(e["ciphertext"]), aad).decode("utf-8")
        rows.append({"scopeType": e["scopeType"], "scopeId": e["scopeId"], "tag": e["tag"],
                     "tipo": e.get("entityType", ""), "valore": value})
    fd = os.open(a.out, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=["scopeType", "scopeId", "tag", "tipo", "valore"])
        w.writeheader()
        w.writerows(rows)
    keys.clear()
    print(json.dumps({"voci_decifrate": len(rows), "out": a.out}))
    print("Il file contiene dati personali in chiaro: consegnarlo secondo il verbale e distruggerlo.",
          file=sys.stderr)
    return 0


VERBALI = {
    "generazione": ("Verbale di generazione della chiave di custodia", [
        "Data, ora e luogo della cerimonia", "Presenti (custodi, testimone, DPO)",
        "Computer usato (non collegato alla rete) e versione dello strumento (commit)",
        "Comando eseguito: custodi.py genera-chiave --quote __ --soglia __",
        "escrowKeyId: ____________________   Impronta SHA-256: ____________________",
        "Consegna delle quote: quota 1 a ____________, quota 2 a ____________, quota 3 a ____________ "
        "(modalità: busta sigillata / file cifrato age o gpg)",
        "Copia di escrow_public.pem ed escrow_key_id.txt sul server (operatore, data)",
        "Verifica: custodi.py verifica con le quote ____ e ____: esito ________",
        "Distruzione dei file temporanei e spegnimento del computer"]),
    "recupero": ("Verbale di recupero della chiave di un utente (cambio PC, solo progetti)", [
        "Richiesta motivata: protocollo n. ______ del ______; richiedente (pseudonimo e struttura)",
        "Verifica dell'identità del richiedente (modalità)", "Presenti (almeno __ custodi)",
        "Esportazioni usate: esporta-escrow (operatore, data, file)",
        "deviceKeyId del nuovo dispositivo: ____________   keyId recuperati: ____________",
        "Comando: custodi.py ricifra ... --out chiavi-recuperate.json",
        "Caricamento sul server (POST /v1/keys/recovered o custodia importa-recuperate): operatore, data",
        "Conferma dell'utente dell'avvenuto ripristino",
        "Distruzione delle esportazioni e dei file prodotti"]),
    "giudiziaria": ("Verbale di estrazione su richiesta dell'autorità giudiziaria", [
        "Autorità richiedente, procedimento, protocollo della richiesta, data",
        "Dati richiesti (utente, scope, periodo, segnaposto): ____________",
        "Blocco della cancellazione attivato? (python -m pseudogate blocchi aggiungi, id ____)",
        "Presenti (custodi, testimone, DPO)",
        "Esportazioni usate: esporta-escrow ed esporta-voci (filtri, operatore, impronte SHA-256 dei file)",
        "Comando: custodi.py decifra-voci ... (filtri usati)",
        "Numero di voci decifrate: ____   impronta SHA-256 del file consegnato: ____________",
        "Modalità di consegna all'autorità", "Distruzione delle copie e dei file intermedi",
        "Eventuale revoca del blocco (data, protocollo)"]),
    "cancellazione": ("Verbale di cancellazione crittografica / riapplicazione dopo ripristino", [
        "Motivo (scadenza, richiesta dell'interessato, ripristino da backup del ______)",
        "Comando eseguito (es. cancellazioni riapplica --file ...), operatore",
        "Esito: scope ____, voci ____, escrow distrutti ____",
        "Verifica dell'integrità dei registri (registri verifica): esito ____"]),
    "ridistribuzione": ("Verbale di ridistribuzione delle quote", [
        "Motivo (cambio di un custode, nuova soglia)", "Presenti",
        "Quote usate per la ricostruzione (indici)", "Nuove quote: totale __, soglia __, assegnazione",
        "Distruzione delle quote precedenti (modalità, testimoni)"]),
}


def cmd_verbale(a) -> int:
    title, items = VERBALI[a.tipo]
    lines = [f"# {title}", "", "Pseudomania - Enterprise edition", "",
             f"Protocollo n. __________ del __________ (bozza generata il {_dt.date.today().isoformat()})", ""]
    for i, it in enumerate(items, 1):
        lines += [f"{i}. {it}", "", "   ______________________________________________", ""]
    lines += ["Firme", "", "| Ruolo | Nome e cognome | Firma |", "|---|---|---|",
              "| Custode | | |", "| Custode | | |", "| Testimone / DPO | | |", ""]
    text = "\n".join(lines)
    if a.out:
        Path(a.out).write_text(text, encoding="utf-8")
        print(a.out)
    else:
        print(text)
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="custodi.py", description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    def quote_args(p):
        p.add_argument("--quota", action="append", required=True,
                       help="file di una quota (anche .age/.gpg) oppure '-' per incollarla")
        p.add_argument("--identita-age", help="file identità age per le quote .age")

    p = sub.add_parser("genera-chiave")
    p.add_argument("--out", required=True)
    p.add_argument("--quote", type=int, default=3)
    p.add_argument("--soglia", type=int, default=2)
    p.add_argument("--bit", type=int, default=4096, choices=[4096])
    p.add_argument("--cifra", action="append", help="N=age:<destinatario> oppure N=gpg:<id-chiave>")
    p.set_defaults(fn=cmd_genera)
    p = sub.add_parser("verifica")
    quote_args(p)
    p.add_argument("--pubblica")
    p.set_defaults(fn=cmd_verifica)
    p = sub.add_parser("ridistribuisci")
    quote_args(p)
    p.add_argument("--out", required=True)
    p.add_argument("--quote", type=int, default=3)
    p.add_argument("--soglia", type=int, default=2)
    p.add_argument("--cifra", action="append")
    p.set_defaults(fn=cmd_ridistribuisci)
    p = sub.add_parser("ricifra")
    quote_args(p)
    p.add_argument("--escrow", required=True, help="esportazione esporta-escrow (JSON)")
    p.add_argument("--dispositivo", required=True, help="deviceKeyId del nuovo PC")
    p.add_argument("--key-id", action="append", help="chiavi da recuperare (predefinito: tutte)")
    p.add_argument("--out", required=True)
    p.set_defaults(fn=cmd_ricifra)
    p = sub.add_parser("decifra-voci")
    quote_args(p)
    p.add_argument("--escrow", required=True)
    p.add_argument("--voci", required=True, help="esportazione esporta-voci (JSON)")
    p.add_argument("--scope", help="tipo:id")
    p.add_argument("--tag", action="append")
    p.add_argument("--out", required=True, help="CSV con i valori decifrati")
    p.set_defaults(fn=cmd_decifra_voci)
    p = sub.add_parser("verbale")
    p.add_argument("--tipo", required=True, choices=sorted(VERBALI))
    p.add_argument("--out")
    p.set_defaults(fn=cmd_verbale)
    a = ap.parse_args(argv)
    try:
        return a.fn(a)
    except ValueError as e:
        print(f"Errore: {e}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
