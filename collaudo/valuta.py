# SPDX-License-Identifier: AGPL-3.0-or-later
"""Valutazione di Pseudomania (Server edition) sul corpus sintetico (collaudo, fase 4).

Esegue ogni documento di collaudo/corpus/manifest.json contro un'API di Pseudomania in
esecuzione e produce un rapporto Markdown in italiano con:
  - recall e precisione per tipo di entità (testi: confronto per span; file: per valore);
  - rispetto dell'allowlist (termini che NON devono essere mascherati);
  - accuratezza dei blocchi per categorie particolari (artt. 9-10 GDPR);
  - fedeltà del ripristino: pseudonimizza -> reidentifica == originale (testo, DOCX, XLSX),
    formule di Excel intatte;
  - fughe: valori reali ancora presenti nell'output pseudonimizzato;
  - latenza per endpoint.

Il ripristino è fatto come lo fa l'estensione (DECISIONI.md): chiave utente AES-GCM
generata qui, copia di custodia cifrata con la chiave pubblica di /v1/config
(POST /v1/keys/escrow), newEntries cifrate e caricate (POST /v1/dictionary/entries),
dizionario scaricato e decifrato localmente; per i file i valori decifrati vanno in
POST /v1/reidentify/file. Richiede il pacchetto `cryptography` (pypdf facoltativo per i PDF).

    python collaudo/valuta.py --url https://pseudogate.ente.local --token <JWT OIDC di prova> \
        --out collaudo/rapporto.md --etichetta "Modello reale v1.5.0"

Ogni documento usa uno scope di conversazione nuovo, cancellato alla fine.
"""

from __future__ import annotations

import argparse
import base64
import html
import json
import os
import re
import statistics
import sys
import time
import urllib.error
import urllib.request
import uuid
import zipfile
from collections import defaultdict
from datetime import datetime
from io import BytesIO
from pathlib import Path

MIME = {"docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "pdf": "application/pdf", "txt": "text/plain"}


# --------------------------------------------------------------------------- HTTP
class Api:
    def __init__(self, url: str, token: str, timeout: float):
        self.url = url.rstrip("/")
        self.token = token
        self.timeout = timeout
        self.lat: dict[str, list[float]] = defaultdict(list)

    def call(self, method: str, path: str, *, body=None, files=None, fields=None, label=None):
        headers = {"Authorization": f"Bearer {self.token}"}
        data = None
        if body is not None:
            data = json.dumps(body).encode()
            headers["Content-Type"] = "application/json"
        elif files is not None:
            boundary = uuid.uuid4().hex
            parts = []
            for k, v in (fields or {}).items():
                parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
            for k, (fname, content, mime) in files.items():
                parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"; '
                             f'filename="{fname}"\r\nContent-Type: {mime}\r\n\r\n'.encode() + content + b"\r\n")
            parts.append(f"--{boundary}--\r\n".encode())
            data = b"".join(parts)
            headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"
        req = urllib.request.Request(self.url + path, data=data, method=method, headers=headers)
        t0 = time.perf_counter()
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as r:
                status, raw = r.status, r.read()
        except urllib.error.HTTPError as e:
            status, raw = e.code, e.read()
        ms = (time.perf_counter() - t0) * 1000
        self.lat[label or f"{method} {path.split('?')[0]}"].append(ms)
        try:
            payload = json.loads(raw) if raw else None
        except ValueError:
            payload = None
        return status, payload

    def delete_scope(self, scope):
        self.call("DELETE", f"/v1/scopes/{scope['type']}/{scope['id']}", label="DELETE /v1/scopes")


# ------------------------------------------------------------------- lato client
class ClientCrypto:
    """Emula l'estensione: chiave utente, escrow, cifratura e decifratura delle voci."""

    def __init__(self, api: Api):
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import padding
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        self.AESGCM = AESGCM
        self.api = api
        status, cfg = api.call("GET", "/v1/config", label="GET /v1/config")
        if status != 200:
            raise SystemExit(f"/v1/config: HTTP {status} {cfg}")
        pub = serialization.load_der_public_key(base64.b64decode(cfg["escrowPublicKey"]))
        oaep = padding.OAEP(mgf=padding.MGF1(algorithm=hashes.SHA256()), algorithm=hashes.SHA256(), label=None)
        self.key = AESGCM.generate_key(bit_length=256)
        self.key_id = str(uuid.uuid4())
        status, res = api.call("POST", "/v1/keys/escrow", label="POST /v1/keys/escrow", body={
            "keyId": self.key_id, "escrowKeyId": cfg["escrowKeyId"],
            "wrappedKey": base64.b64encode(pub.encrypt(self.key, oaep)).decode()})
        if status != 204:
            raise SystemExit(f"/v1/keys/escrow: HTTP {status} {res}")

    @staticmethod
    def _aad(scope: dict, tag: str) -> bytes:
        return f"{scope['type']}|{scope['id']}|{tag}".encode("utf-8")

    def upload(self, scope: dict, new_entries: list[dict]) -> None:
        if not new_entries:
            return
        entries = []
        for e in new_entries:
            iv = os.urandom(12)
            ct = self.AESGCM(self.key).encrypt(iv, e["value"].encode("utf-8"), self._aad(scope, e["tag"]))
            entries.append({"tag": e["tag"], "ciphertext": base64.b64encode(ct).decode(),
                            "iv": base64.b64encode(iv).decode(), "keyId": self.key_id})
        self.api.call("POST", "/v1/dictionary/entries", label="POST /v1/dictionary/entries",
                      body={"scope": scope, "entries": entries})

    def dictionary(self, scope: dict) -> dict[str, str]:
        status, res = self.api.call(
            "GET", f"/v1/dictionary?scope_type={scope['type']}&scope_id={scope['id']}",
            label="GET /v1/dictionary")
        out = {}
        for tag, e in (res or {}).get("entries", {}).items():
            if e["keyId"] != self.key_id:
                continue
            aad_scope = e.get("aadScope") or scope
            out[tag] = self.AESGCM(self.key).decrypt(base64.b64decode(e["iv"]),
                                                     base64.b64decode(e["ciphertext"]),
                                                     self._aad(aad_scope, tag)).decode("utf-8")
        return out


TAG_RX = re.compile(r"\\?\[([A-Z][A-Z]*(?:\\?_[A-Z]+)*)\\?_(\d{1,6})\\?\]")


def restore_text(text: str, entries: dict[str, str]) -> tuple[str, list[str]]:
    unknown = []

    def sub(m):
        tag = m.group(0).replace("\\", "")
        if tag in entries:
            return entries[tag]
        unknown.append(tag)
        return m.group(0)
    return TAG_RX.sub(sub, text), unknown


# ------------------------------------------------------------------- testo nei file
def office_texts(data: bytes) -> dict[str, str]:
    """Testo di ogni parte XML (tag rimossi, run adiacenti uniti)."""
    out = {}
    with zipfile.ZipFile(BytesIO(data)) as z:
        for n in z.namelist():
            if n.endswith((".xml", ".rels")):
                raw = z.read(n).decode("utf-8", "replace")
                txt = re.sub(r"<[^>]+>", "", raw)
                attrs = " ".join(a for a in re.findall(
                    r'(?:author|Target|displayName|initials)="([^"]*)"', raw)
                    if not a.lstrip("/").startswith("docProps/thumbnail"))  # anteprima rimossa di proposito
                out[n] = re.sub(r"\s+", " ", html.unescape(txt + " " + attrs)).strip()
    return out


def xlsx_formulas(data: bytes) -> dict[str, str]:
    out = {}
    with zipfile.ZipFile(BytesIO(data)) as z:
        for n in z.namelist():
            if re.match(r"xl/worksheets/sheet\d+\.xml$", n):
                for ref, f in re.findall(r'<c r="([A-Z]+\d+)"[^>]*>\s*<f>(.*?)</f>', z.read(n).decode()):
                    out[ref] = "=" + html.unescape(f)
    return out


def pdf_text(data: bytes) -> str | None:
    try:
        import pypdf
    except ImportError:
        return None
    return "\n".join(p.extract_text() or "" for p in pypdf.PdfReader(BytesIO(data)).pages)


def contains(hay: str, needle: str) -> bool:
    return re.sub(r"\s+", " ", needle).casefold() in re.sub(r"\s+", " ", hay).casefold()


# --------------------------------------------------------------------------- metriche
class Stats:
    def __init__(self):
        self.span_tot = defaultdict(int)       # entità da mascherare (testi) per tipo GT
        self.span_hit = defaultdict(int)       # mascherate (sovrapposte da un'entità)
        self.span_typed = defaultdict(int)     # mascherate con il tipo giusto
        self.span_full = defaultdict(int)      # coperte per intero
        self.pred_tot = defaultdict(int)       # entità previste (non neutre) per tipo previsto
        self.pred_tp = defaultdict(int)
        self.val_tot = defaultdict(int)        # valori da mascherare (file) per tipo
        self.val_hit = defaultdict(int)
        self.allow_tot = 0
        self.allow_ok = 0
        self.allow_viol: list[str] = []
        self.blocks = {"tp": 0, "fn": 0, "fp": 0, "tn": 0}
        self.unsupported: list[tuple[str, str, str]] = []
        self.block_rows: list[tuple] = []
        self.roundtrip: list[tuple[str, str, bool, str]] = []
        self.leaks: list[tuple[str, str, str]] = []
        self.misses: list[tuple[str, str, str]] = []
        self.fps: list[tuple[str, str, str]] = []
        self.docs: list[tuple[str, str, str]] = []


def overlap(a0, a1, b0, b1):
    return a0 < b1 and b0 < a1


def eval_text(api: Api, cc: ClientCrypto, doc: dict, gt: dict, text: str, st: Stats):
    scope = {"type": "conversation", "id": str(uuid.uuid4())}
    status, res = api.call("POST", "/v1/pseudonymize", label="POST /v1/pseudonymize",
                           body={"scope": scope, "site": "claude.ai", "kind": "message", "text": text})
    if status != 200:
        st.docs.append((doc["id"], "txt", f"errore HTTP {status}: {res}"))
        return
    blocked = bool(res["blocked"])
    exp_block = gt["expected"] == "block"
    key = ("tp" if blocked else "fn") if exp_block else ("fp" if blocked else "tn")
    st.blocks[key] += 1
    if exp_block or blocked:
        reason = (res.get("blockReason") or "")
        art_ok = (f"art. {gt.get('article')}" in reason) if exp_block and blocked else None
        st.block_rows.append((doc["id"], "sì" if exp_block else "no", "sì" if blocked else "no",
                              gt.get("block_category", "-"), "-" if art_ok is None else ("sì" if art_ok else "no")))
    if exp_block:
        st.docs.append((doc["id"], "txt", "bloccato" if blocked else "NON bloccato (errore)"))
        api.delete_scope(scope)
        return
    if blocked:
        st.docs.append((doc["id"], "txt", f"bloccato per errore: {res.get('blockReason')}"))
        api.delete_scope(scope)
        return

    preds = [(e["start"], e["end"], e["type"]) for e in res["entities"]]
    masks = [e for e in gt["entities"] if e["action"] == "mask"]
    allows = [e for e in gt["entities"] if e["action"] == "allow"]
    ignores = [e for e in gt["entities"] if e["action"] == "ignore"]
    for m in masks:
        t = m["type"]
        st.span_tot[t] += 1
        ov = [p for p in preds if overlap(p[0], p[1], m["start"], m["end"])]
        if ov:
            st.span_hit[t] += 1
            if any(p[2] == t for p in ov):
                st.span_typed[t] += 1
            covered = set()
            for p in ov:
                covered.update(range(max(p[0], m["start"]), min(p[1], m["end"])))
            if len(covered) == m["end"] - m["start"]:
                st.span_full[t] += 1
        else:
            st.misses.append((doc["id"], t, m["text"]))
    for p in preds:
        if any(overlap(p[0], p[1], m["start"], m["end"]) for m in masks):
            st.pred_tot[p[2]] += 1
            st.pred_tp[p[2]] += 1
        elif any(overlap(p[0], p[1], a["start"], a["end"]) for a in allows):
            st.pred_tot[p[2]] += 1
            st.allow_viol.append(f"{doc['id']}: «{text[p[0]:p[1]]}» ({p[2]})")
        elif any(overlap(p[0], p[1], i["start"], i["end"]) for i in ignores):
            continue
        else:
            st.pred_tot[p[2]] += 1
            st.fps.append((doc["id"], p[2], text[p[0]:p[1]]))
    for a in allows:
        st.allow_tot += 1
        if not any(overlap(p[0], p[1], a["start"], a["end"]) for p in preds):
            st.allow_ok += 1
    for m in masks:
        if contains(res["text"], m["text"]) and len(m["text"]) > 3:
            # il valore può comparire legittimamente altrove (es. "Bianco" come parola comune)
            st.leaks.append((doc["id"], m["type"], m["text"]))
    cc.upload(scope, res.get("newEntries") or [])
    restored, unknown = restore_text(res["text"], cc.dictionary(scope))
    ok = restored == text
    st.roundtrip.append((doc["id"], "testo", ok, "" if ok else f"tag non ripristinati: {unknown}"))
    st.docs.append((doc["id"], "txt", f"{len(preds)} entità"))
    api.delete_scope(scope)


def eval_file(api: Api, cc: ClientCrypto, doc: dict, gt: dict, data: bytes, st: Stats):
    fmt = doc["format"]
    scope = {"type": "conversation", "id": str(uuid.uuid4())}
    fields = {"scope_type": scope["type"], "scope_id": scope["id"], "site": "claude.ai", "kind": "attachment"}
    fname = Path(doc["file"]).name
    status, res = api.call("POST", "/v1/pseudonymize/file", label=f"POST /v1/pseudonymize/file ({fmt})",
                           files={"file": (fname, data, MIME[fmt])}, fields=fields)
    if status != 200:
        st.docs.append((doc["id"], fmt, f"errore HTTP {status}: {res}"))
        return
    if res["blocked"] and "non è installato" in (res.get("blockReason") or ""):
        st.unsupported.append((doc["id"], fmt, res["blockReason"]))
        st.docs.append((doc["id"], fmt, f"non valutato: {res['blockReason']}"))
        api.delete_scope(scope)
        return
    if res["blocked"]:
        st.docs.append((doc["id"], fmt, f"bloccato: {res['blockReason']}"))
        st.blocks["fp"] += 1
        st.block_rows.append((doc["id"], "no", "sì", "-", "-"))
        api.delete_scope(scope)
        return
    st.blocks["tn"] += 1
    cc.upload(scope, res.get("newEntries") or [])
    out = base64.b64decode(res["contentB64"])
    if fmt == "pdf":
        hay = pdf_text(out)
        if hay is None:
            st.docs.append((doc["id"], fmt, "pseudonimizzato; pypdf assente: fughe non verificate"))
            api.delete_scope(scope)
            return
    else:
        hay = "\n".join(office_texts(out).values())
    for v in gt["values"]:
        if v["action"] == "mask":
            st.val_tot[v["type"]] += 1
            if contains(hay, v["text"]):
                st.leaks.append((doc["id"], v["type"], v["text"]))
                st.misses.append((doc["id"], v["type"], v["text"]))
            else:
                st.val_hit[v["type"]] += 1
        elif v["action"] == "allow":
            st.allow_tot += 1
            if contains(hay, v["text"]):
                st.allow_ok += 1
            else:
                st.allow_viol.append(f"{doc['id']}: «{v['text']}» ({v['where']})")
    note = f"{len(res['entities'])} segnaposto distinti"
    if fmt in ("docx", "xlsx"):
        status, back = api.call("POST", "/v1/reidentify/file", label=f"POST /v1/reidentify/file ({fmt})",
                                files={"file": (res["filename"], out, MIME[fmt])},
                                fields={"scope_type": scope["type"], "scope_id": scope["id"],
                                        "entries": json.dumps(cc.dictionary(scope))})
        if status != 200:
            st.roundtrip.append((doc["id"], fmt, False, f"HTTP {status}"))
        else:
            restored = base64.b64decode(back["contentB64"])
            a, b = office_texts(data), office_texts(restored)
            diff = [n for n in a if n in b and a[n] != b[n]]
            removed = [n for n in a if n not in b]
            problems = []
            if diff:
                problems.append("testo diverso in " + ", ".join(diff[:4]))
            if any(not n.startswith("docProps/thumbnail") for n in removed):
                problems.append("parti mancanti: " + ", ".join(removed[:4]))
            if fmt == "xlsx":
                fo, fp_, fr = xlsx_formulas(data), xlsx_formulas(out), xlsx_formulas(restored)
                if not (fo == fp_ == fr):
                    problems.append("formule modificate")
                expected = gt.get("formulas") or {}
                if any(fo.get(k) != v for k, v in expected.items()):
                    problems.append("formule attese non trovate nell'originale")
            st.roundtrip.append((doc["id"], fmt, not problems, "; ".join(problems)))
    st.docs.append((doc["id"], fmt, note))
    api.delete_scope(scope)


# --------------------------------------------------------------------------- rapporto
def pct(a, b):
    return "–" if not b else f"{100 * a / b:.0f}% ({a}/{b})"


def lat_rows(api: Api):
    rows = []
    for k, v in sorted(api.lat.items()):
        v = sorted(v)
        p95 = v[min(len(v) - 1, int(round(0.95 * (len(v) - 1))))]
        rows.append(f"| {k} | {len(v)} | {statistics.median(v):.0f} | {p95:.0f} | {max(v):.0f} |")
    return rows


def report(api: Api, st: Stats, health: dict, label: str, corpus: Path) -> str:
    L = []
    L.append(f"# Rapporto di collaudo Pseudomania — {label}\n")
    L.append(f"- Data: {datetime.now().strftime('%d/%m/%Y %H:%M')}")
    L.append(f"- Server: `{api.url}` — versione {health.get('version')}, modalità {health.get('mode')}, "
             f"rilevatore {health.get('detector')}")
    L.append(f"- Corpus: `{corpus}` (documenti sintetici, dati inventati)\n")
    tp, fn, fp, tn = (st.blocks[k] for k in ("tp", "fn", "fp", "tn"))
    tot_mask = sum(st.span_tot.values()) + sum(st.val_tot.values())
    hit_mask = sum(st.span_hit.values()) + sum(st.val_hit.values())
    L.append("## Sintesi\n")
    L.append("| Indicatore | Valore |\n|---|---|")
    L.append(f"| Dati personali mascherati (testi per span + file per valore) | {pct(hit_mask, tot_mask)} |")
    L.append(f"| Precisione (testi, entità non neutre) | {pct(sum(st.pred_tp.values()), sum(st.pred_tot.values()))} |")
    L.append(f"| Allowlist rispettata | {pct(st.allow_ok, st.allow_tot)} |")
    L.append(f"| Blocchi corretti (artt. 9-10) | {pct(tp, tp + fn)} bloccati, {fp} falsi blocchi su {fp + tn} documenti ammessi |")
    rt_ok = sum(1 for r in st.roundtrip if r[2])
    L.append(f"| Ripristino fedele (pseudonimizza → reidentifica) | {pct(rt_ok, len(st.roundtrip))} |")
    L.append(f"| Valori reali rimasti nell'output | {len(st.leaks)} |")
    if st.unsupported:
        L.append(f"| Documenti non valutabili (formato non supportato dal server) | "
                 f"{', '.join(d for d, _, _ in st.unsupported)} |")
    L.append("")

    L.append("## Recall e precisione per tipo\n")
    L.append("Testi: un'entità è *mascherata* se un segnaposto la copre almeno in parte; *tipo giusto* se "
             "il tipo coincide; *copertura completa* se nessun carattere resta in chiaro. "
             "File: un valore è mascherato se non compare più nel documento restituito.\n")
    L.append("| Tipo | Testi: mascherate | Testi: tipo giusto | Testi: copertura completa | "
             "Precisione (testi) | File: valori mascherati |\n|---|---|---|---|---|---|")
    types = sorted(set(st.span_tot) | set(st.val_tot) | set(st.pred_tot))
    for t in types:
        L.append(f"| {t} | {pct(st.span_hit[t], st.span_tot[t])} | {pct(st.span_typed[t], st.span_tot[t])} | "
                 f"{pct(st.span_full[t], st.span_tot[t])} | {pct(st.pred_tp[t], st.pred_tot[t])} | "
                 f"{pct(st.val_hit[t], st.val_tot[t])} |")
    L.append("")

    L.append("## Blocchi per categorie particolari\n")
    L.append(f"Matrice: veri blocchi {tp}, blocchi mancati {fn}, falsi blocchi {fp}, ammessi correttamente {tn}.\n")
    if st.block_rows:
        L.append("| Documento | Atteso blocco | Bloccato | Categoria attesa | Articolo citato |\n|---|---|---|---|---|")
        L += [f"| {r[0]} | {r[1]} | {r[2]} | {r[3]} | {r[4]} |" for r in st.block_rows]
    L.append("")

    L.append("## Ripristino (round-trip)\n")
    L.append("| Documento | Formato | Esito | Note |\n|---|---|---|---|")
    L += [f"| {d} | {f} | {'OK' if ok else 'DIFFERENZE'} | {n} |" for d, f, ok, n in st.roundtrip]
    L.append("")

    L.append("## Latenza (ms)\n")
    L.append("| Endpoint | Richieste | Mediana | p95 | Max |\n|---|---|---|---|---|")
    L += lat_rows(api)
    L.append("")

    L.append("## Dettagli\n")
    L.append("### Valori non mascherati\n")
    L += [f"- {d}: {t} «{v}»" for d, t, v in st.misses] or ["- nessuno"]
    L.append("\n### Violazioni dell'allowlist\n")
    L += [f"- {v}" for v in st.allow_viol] or ["- nessuna"]
    L.append("\n### Falsi positivi (testi)\n")
    L += [f"- {d}: {t} «{v}»" for d, t, v in st.fps] or ["- nessuno"]
    L.append("\n### Documenti\n")
    L.append("| Documento | Formato | Esito |\n|---|---|---|")
    L += [f"| {d} | {f} | {n} |" for d, f, n in st.docs]
    L.append("\n---\nNota: corpus sintetico con dati inventati; i risultati misurano il comportamento del "
             "sistema su questi esempi e non sostituiscono la valutazione su documenti reali "
             "(da svolgere in ambiente controllato con il DPO).")
    return "\n".join(L) + "\n"


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--url", required=True, help="es. http://127.0.0.1:8787")
    ap.add_argument("--token", required=True, help="token OIDC (JWT) di un utente di prova")
    ap.add_argument("--corpus", default=str(Path(__file__).resolve().parent / "corpus"))
    ap.add_argument("--out", default="rapporto_collaudo.md")
    ap.add_argument("--etichetta", default="esecuzione", help="titolo del rapporto")
    ap.add_argument("--timeout", type=float, default=900)
    a = ap.parse_args(argv)

    corpus = Path(a.corpus)
    manifest = json.loads((corpus / "manifest.json").read_text(encoding="utf-8"))
    api = Api(a.url, a.token, a.timeout)
    status, health = api.call("GET", "/v1/health", label="GET /v1/health")
    if status != 200:
        print(f"Server non raggiungibile: HTTP {status}", file=sys.stderr)
        return 2
    st = Stats()
    cc = ClientCrypto(api)
    for doc in manifest["documenti"]:
        gt = json.loads((corpus / doc["truth"]).read_text(encoding="utf-8"))
        path = corpus / doc["file"]
        if doc["format"] == "txt":
            eval_text(api, cc, doc, gt, path.read_text(encoding="utf-8"), st)
        else:
            eval_file(api, cc, doc, gt, path.read_bytes(), st)
        print(f"  {doc['id']}: {st.docs[-1][2] if st.docs else ''}")
    Path(a.out).write_text(report(api, st, health, a.etichetta, corpus), encoding="utf-8")
    print(f"Rapporto scritto in {a.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
