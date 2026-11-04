# SPDX-License-Identifier: AGPL-3.0-or-later
"""API di Pseudomania (Server edition), FastAPI. Contratto: SPEC.md e DECISIONI.md.

Il server non conserva mai i valori in chiaro: li restituisce una sola volta in
`newEntries` all'utente che li ha appena inviati; l'estensione li cifra con la chiave
dell'utente e carica ciphertext/iv/keyId. Il ripristino avviene nel browser."""

from __future__ import annotations

import asyncio
import base64
import contextlib
import json
import logging
import os
import time
from dataclasses import dataclass
from typing import Any, Literal

from fastapi import FastAPI, File, Form, Header, Query, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, ConfigDict, Field
from starlette.concurrency import run_in_threadpool
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import retention
from .audit import AuditLog, sha256
from .auth import Principal, build_auth
from .crypto import build_key_service
from .db import make_engine, migrate
from .detector import Detection, RizzoClient
from .dictionary import DictionaryStore, Scope, make_scope, valid_key_id
from .errors import ApiError, BadRequest, DetectorUnavailable, PayloadTooLarge, Unauthorized
from .files import MIME, decode_text, detect_kind, encode_text
from .files import pdf as pdf_files
from .files.office import transform_office
from .files.ooxml import Edit
from .policy import Allowlist, SpecialCategoryFilter
from .pseudonymizer import (TAG_RX, Pseudonymizer, apply_replacements, canonical_tag,
                            entity_counts, new_entries, unique_entities)
from .keystore import KeyStore
from .settings import Settings, load_settings
from .tracing import build_tracer

log = logging.getLogger("pseudogate")

TAG_INSTRUCTION = ("I testi contengono segnaposto tra parentesi quadre come [FULLNAME_n] o [CF_n] "
                   "(n = numero). Riportali esattamente come sono, senza modificarli, tradurli, "
                   "declinarli o spiegarli, e non crearne di nuovi.")
MAX_TEXT_CHARS = 2_000_000
EVENTS = ("response_received", "inspection_opened", "report_false_negative",
          "report_false_positive", "blocked", "extension_disabled", "extension_enabled",
          "page_unrecognized", "server_unreachable", "scope_rebind_conflict")


# --------------------------------------------------------------------------- #
# Modelli di richiesta
# --------------------------------------------------------------------------- #
class ScopeIn(BaseModel):
    type: Literal["conversation", "project"]
    id: str = Field(min_length=1, max_length=140)


class PseudonymizeIn(BaseModel):
    scope: ScopeIn
    site: str = "claude.ai"
    kind: Literal["message", "edit", "regenerate", "project_instructions"] = "message"
    text: str = Field(max_length=MAX_TEXT_CHARS)


class EntryIn(BaseModel):
    tag: str = Field(max_length=64)
    ciphertext: str = Field(max_length=8192)
    iv: str = Field(max_length=64)
    keyId: str = Field(max_length=64)


class EntriesIn(BaseModel):
    scope: ScopeIn
    entries: list[EntryIn] = Field(max_length=5000)


class RekeyEntryIn(BaseModel):
    scope: ScopeIn
    tag: str = Field(max_length=64)
    ciphertext: str = Field(max_length=8192)
    iv: str = Field(max_length=64)


class RekeyIn(BaseModel):
    oldKeyId: str = Field(max_length=64)
    newKeyId: str = Field(max_length=64)
    entries: list[RekeyEntryIn] = Field(default_factory=list, max_length=5000)


class EscrowIn(BaseModel):
    keyId: str = Field(max_length=64)
    wrappedKey: str = Field(max_length=2048)
    escrowKeyId: str = Field(max_length=128)


class DeviceKeyIn(BaseModel):
    publicKey: str = Field(max_length=4096)


class RecoveredKeyIn(BaseModel):
    deviceKeyId: str = Field(max_length=64)
    keyId: str = Field(max_length=64)
    wrappedKey: str = Field(max_length=4096)
    ownerPseudonym: str | None = Field(default=None, max_length=128)


class RecoveredIn(BaseModel):
    keys: list[RecoveredKeyIn] = Field(max_length=1000)


class RebindIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    from_: ScopeIn = Field(alias="from")
    to: ScopeIn


class EventIn(BaseModel):
    traceId: str | None = Field(default=None, max_length=64)
    scope: ScopeIn | None = None
    event: Literal[EVENTS]  # type: ignore[valid-type]
    details: dict[str, Any] = Field(default_factory=dict)


class Blocked(Exception):
    def __init__(self, category: str, reason: str):
        super().__init__(reason)
        self.category = category
        self.reason = reason


# --------------------------------------------------------------------------- #
# Servizi
# --------------------------------------------------------------------------- #
@dataclass
class Services:
    settings: Settings
    engine: Any
    keys: Any
    auth: Any
    detector: RizzoClient
    allowlist: Allowlist
    special: SpecialCategoryFilter
    store: DictionaryStore
    keystore: KeyStore
    audit: AuditLog
    tracer: Any
    pz: Pseudonymizer

    @property
    def policy_version(self) -> str:
        return self.settings.policy_version or f"{self.allowlist.version}+{self.special.version}"


def build_services(settings: Settings, *, detector=None, keys=None, auth=None, tracer=None,
                   engine=None, keys_engine=None) -> Services:
    engine = engine or make_engine(settings.database_url)
    keys_engine = keys_engine or make_engine(settings.keystore_database_url)
    keys = keys or build_key_service(settings)
    auth = auth or build_auth(settings, keys)
    detector = detector or RizzoClient(settings.rizzo_url, timeout=settings.rizzo_timeout_s,
                                       exclude_tags=settings.detector_exclude_tags,
                                       batch_chars=settings.detector_batch_chars)
    allowlist = Allowlist.load(settings.allowlist_file)
    special = SpecialCategoryFilter.load(settings.special_categories_file,
                                         settings.special_categories_enabled)
    keystore = KeyStore(keys_engine, engine, settings)
    store = DictionaryStore(engine, keys, settings, keystore)
    audit = AuditLog(engine)
    tracer = tracer or build_tracer(settings)
    return Services(settings, engine, keys, auth, detector, allowlist, special, store, keystore,
                    audit, tracer, Pseudonymizer(detector, allowlist, store))


def _err(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse({"error": code, "message": message}, status_code=status)


def _scope(s: ScopeIn) -> Scope:
    return make_scope(s.type, s.id)


def _tag_type(tag: str) -> str:
    m = TAG_RX.fullmatch(tag)
    return m.group(1).replace("\\", "") if m else ""


# --------------------------------------------------------------------------- #
# App
# --------------------------------------------------------------------------- #
def create_app(settings: Settings | None = None, **overrides) -> FastAPI:
    settings = settings or load_settings()
    logging.basicConfig(level=settings.log_level,
                        format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)
    from .outbound import configure_extra_ca
    configure_extra_ca(settings.extra_ca_file)  # prima di creare i client HTTP (Langfuse, OIDC)
    svc = build_services(settings, **overrides)

    @contextlib.asynccontextmanager
    async def lifespan(app: FastAPI):
        if settings.migrate_on_start:
            await run_in_threadpool(migrate, svc.engine, "app")
            await run_in_threadpool(migrate, svc.keystore.engine, "keys")
        task = None
        if settings.retention_job == "internal":
            task = asyncio.create_task(retention.loop(svc))
        try:
            yield
        finally:
            if task:
                task.cancel()
            svc.tracer.shutdown()

    app = FastAPI(title="Pseudomania API", version=settings.version, lifespan=lifespan,
                  docs_url=None, redoc_url=None, openapi_url="/v1/openapi.json")
    app.state.svc = svc
    app.add_middleware(CORSMiddleware, allow_origin_regex=settings.cors_allow_origin_regex,
                       allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
                       allow_headers=["Authorization", "Content-Type"], max_age=600)

    # -- gestione errori ------------------------------------------------------
    @app.exception_handler(ApiError)
    async def _api_error(_r: Request, e: ApiError):
        return _err(e.status, e.code, e.message)

    @app.exception_handler(RequestValidationError)
    async def _validation(_r: Request, e: RequestValidationError):
        fields = ", ".join(".".join(str(x) for x in err.get("loc", [])[1:]) or "body"
                           for err in e.errors()[:5])
        return _err(400, "invalid_request", f"Richiesta non valida ({fields}).")

    @app.exception_handler(StarletteHTTPException)
    async def _http(_r: Request, e: StarletteHTTPException):
        code = {404: "not_found", 405: "method_not_allowed"}.get(e.status_code, "http_error")
        msg = {404: "Risorsa non trovata.", 405: "Metodo non consentito."}.get(
            e.status_code, str(e.detail))
        return _err(e.status_code, code, msg)

    @app.exception_handler(Exception)
    async def _unexpected(_r: Request, e: Exception):
        log.exception("Errore interno")
        return _err(500, "internal_error", "Errore interno del server.")

    # -- limite dimensione e log essenziale (mai il contenuto) -------------------
    @app.middleware("http")
    async def _limits_and_log(request: Request, call_next):
        t0 = time.perf_counter()
        cl = request.headers.get("content-length")
        if cl and cl.isdigit() and int(cl) > settings.max_file_bytes + 1024 * 1024:
            return _err(413, "file_too_large",
                        f"La richiesta supera la dimensione massima consentita "
                        f"({settings.max_file_mb} MB).")
        resp = await call_next(request)
        log.info("%s %s -> %s (%.0f ms)", request.method, request.url.path, resp.status_code,
                 (time.perf_counter() - t0) * 1000)
        return resp

    def principal(authorization: str | None) -> Principal:
        return svc.auth.authenticate(authorization)

    def scope_hash(scope: Scope | None) -> str | None:
        return svc.keys.scope_hash(scope.type, scope.id) if scope else None

    def check_site(site: str) -> None:
        if site not in settings.sites:
            raise BadRequest(f"Sito non gestito: {site}.")

    # ------------------------------------------------------------------ 1
    @app.get("/v1/health")
    def health():
        """Sempre HTTP 200 (il processo è vivo); "status" è "degraded" se il rilevatore
        o il servizio chiavi (OpenBao: sigillato/irraggiungibile) non sono disponibili."""
        detector = "ok" if svc.detector.healthy() else "down"
        keys = svc.keys.status()
        return {"status": "ok" if detector == "ok" and keys == "ok" else "degraded",
                "version": settings.version, "mode": settings.mode,
                "detector": detector, "keys": keys}

    @app.get("/v1/source")
    def source():
        """AGPL-3.0, art. 13: offerta del codice sorgente a chi usa il servizio in rete."""
        return {"license": "AGPL-3.0-or-later", "source": settings.source_url or None,
                "version": settings.version}

    # ------------------------------------------------------------------ 2
    @app.get("/v1/config")
    def config(authorization: str | None = Header(default=None)):
        p = principal(authorization)
        return {"mode": settings.mode, "failClosed": settings.fail_closed,
                "allowDisable": settings.allow_disable, "tagInstruction": TAG_INSTRUCTION,
                "allowlist": svc.allowlist.terms, "policyVersion": svc.policy_version,
                "maxFileMB": settings.max_file_mb,
                "escrowPublicKey": settings.escrow_public_key_b64,
                "escrowKeyId": settings.escrow_key_id,
                "rotateKey": svc.keystore.rotate_needed(p.user_pseudonym),
                "keyRotationDays": settings.key_rotation_days,
                "pendingEntryMinutes": settings.pending_entry_minutes}

    # ------------------------------------------------------------------ 3
    @app.post("/v1/pseudonymize")
    def pseudonymize(body: PseudonymizeIn, authorization: str | None = Header(default=None)):
        t0 = time.perf_counter()
        p = principal(authorization)
        scope = _scope(body.scope)
        check_site(body.site)
        trace_id = svc.tracer.new_trace_id()
        common = dict(user_pseudonym=p.user_pseudonym, office=p.office, site=body.site,
                      scope_type=scope.type,
                      scope_hash=scope_hash(scope), kind=body.kind, trace_id=trace_id)
        hit = svc.special.first_block(body.text)
        if hit:
            reason = svc.special.reason(hit)
            svc.audit.record(action="pseudonymize", blocked=True, block_category=hit.category,
                             latency_ms=int((time.perf_counter() - t0) * 1000), **common)
            return {"text": "", "entities": [], "newEntries": [], "blocked": True,
                    "blockReason": reason, "traceId": trace_id}
        logged = [m.category for m in svc.special.scan(body.text) if m.action == "log"]
        new_text, reps = svc.pz.pseudonymize_text(p.user_pseudonym, scope, body.text)
        counts = entity_counts(reps)
        latency = int((time.perf_counter() - t0) * 1000)
        svc.audit.record(action="pseudonymize", entity_counts=counts, latency_ms=latency,
                         prompt_sha256=sha256(new_text),
                         details={"special_log": logged} if logged else None, **common)
        svc.tracer.message(trace_id=trace_id, user=p.user_pseudonym, text=new_text,
                           metadata={"entity_counts": counts, "latency_ms": latency,
                                     "kind": body.kind, "site": body.site,
                                     "scope_type": scope.type})
        return {"text": new_text,
                "entities": [{"tag": r.tag, "type": r.type, "start": r.start, "end": r.end}
                             for r in reps],
                "newEntries": new_entries(reps),
                "blocked": False, "blockReason": None, "traceId": trace_id}

    # ------------------------------------------------------------------ 4
    @app.post("/v1/pseudonymize/file")
    async def pseudonymize_file(scope_type: str = Form(...), scope_id: str = Form(...),
                                site: str = Form("claude.ai"), kind: str = Form("attachment"),
                                file: UploadFile = File(...),
                                authorization: str | None = Header(default=None)):
        data = await file.read(settings.max_file_bytes + 1)
        if len(data) > settings.max_file_bytes:
            raise PayloadTooLarge(settings.max_file_mb)
        return await run_in_threadpool(_pseudonymize_file, scope_type, scope_id, site, kind,
                                       file.filename or "file", data, authorization)

    def _pseudonymize_file(scope_type, scope_id, site, kind, filename, data, authorization):
        t0 = time.perf_counter()
        p = principal(authorization)
        scope = make_scope(scope_type, scope_id)
        check_site(site)
        if kind not in ("attachment", "project_knowledge"):
            raise BadRequest("Campo 'kind' non valido: usa 'attachment' o 'project_knowledge'.")
        trace_id = svc.tracer.new_trace_id()
        common = dict(user_pseudonym=p.user_pseudonym, office=p.office, site=site,
                      scope_type=scope.type,
                      scope_hash=scope_hash(scope), kind=kind, trace_id=trace_id)

        def blocked(reason: str, category: str):
            svc.audit.record(action="pseudonymize_file", blocked=True, block_category=category,
                             latency_ms=int((time.perf_counter() - t0) * 1000), **common)
            return {"filename": filename, "mime": "", "contentB64": "", "entities": [],
                    "newEntries": [], "blocked": True, "blockReason": reason, "traceId": trace_id}

        fk = detect_kind(filename, data)
        if fk.kind is None:
            return blocked(fk.reason, "unsupported_format")

        all_reps = []

        def check_special(text: str):
            hit = svc.special.first_block(text)
            if hit:
                raise Blocked(hit.category, svc.special.reason(hit))

        try:
            if fk.kind in ("txt", "md", "csv"):
                dt = decode_text(data)
                check_special(dt.text)
                new_text, reps = svc.pz.pseudonymize_text(p.user_pseudonym, scope, dt.text)
                all_reps += reps
                out = encode_text(dt, new_text)
            elif fk.kind in ("docx", "xlsx"):
                def transform(texts: list[str]) -> list[list[Edit]]:
                    check_special("\n".join(texts))
                    per_unit = svc.pz.pseudonymize_units(p.user_pseudonym, scope, texts)
                    for reps in per_unit:
                        all_reps.extend(reps)
                    return [[Edit(r.start, r.end, r.tag) for r in reps] for reps in per_unit]
                out = transform_office(data, fk.kind, transform)
            else:  # pdf
                if not pdf_files.HAVE_PYMUPDF:
                    return blocked("Il supporto PDF non è installato su questo server.",
                                   "unsupported_format")
                res = svc.detector.analyze_file(filename, data, MIME["pdf"])
                check_special(res.text)
                dets = svc.pz.detect_from(res.text, res.detections)
                reps = svc.pz.assign(p.user_pseudonym, scope, dets) if dets else []
                all_reps += reps
                tag_to_value = {}
                for r in reps:
                    tag_to_value.setdefault(r.tag, r.value)
                out = pdf_files.redact(data, tag_to_value)
        except Blocked as b:
            return blocked(b.reason, b.category)
        except pdf_files.PdfProblem as e:
            return blocked(str(e), "pdf_unsafe")
        except BadRequest as e:
            if e.code == "detector_rejected":
                return blocked(f"Il file non può essere analizzato: {e.message}", "unreadable")
            raise

        new_name, name_reps = _pseudonymize_name(p.user_pseudonym, scope, filename)
        all_reps += name_reps
        counts = entity_counts(all_reps)
        latency = int((time.perf_counter() - t0) * 1000)
        svc.audit.record(action="pseudonymize_file", entity_counts=counts, latency_ms=latency,
                         prompt_sha256=sha256(out), **common)
        svc.tracer.message(trace_id=trace_id, user=p.user_pseudonym,
                           text=f"[file {fk.kind}] {new_name}",
                           metadata={"entity_counts": counts, "latency_ms": latency,
                                     "kind": kind, "site": site, "scope_type": scope.type,
                                     "bytes": len(data)})
        return {"filename": new_name, "mime": MIME[fk.kind],
                "contentB64": base64.b64encode(out).decode("ascii"),
                "entities": unique_entities(all_reps), "newEntries": new_entries(all_reps),
                "blocked": False, "blockReason": None, "traceId": trace_id}

    def _pseudonymize_name(owner: str, scope: Scope, filename: str):
        stem, ext = os.path.splitext(os.path.basename(filename))
        readable = stem.replace("_", " ")  # "Contratto_Mario_Rossi" -> testo analizzabile
        dets = svc.pz.detect(readable)
        if not dets:
            return filename, []
        reps = svc.pz.assign(owner, scope, [Detection(d.start, d.end, d.label,
                                                      stem[d.start:d.end].replace("_", " "))
                                            for d in dets])
        return apply_replacements(stem, reps) + ext, reps

    # ------------------------------------------------------------------ 5
    @app.get("/v1/dictionary")
    def dictionary(scope_type: str = Query(...), scope_id: str = Query(...),
                   authorization: str | None = Header(default=None)):
        """Solo voci cifrate: {tag: {ciphertext, iv, keyId}}. La decifratura è nel browser."""
        p = principal(authorization)
        scope = make_scope(scope_type, scope_id)
        entries = svc.store.entries(p.user_pseudonym, scope)
        info = svc.store.scope_info(p.user_pseudonym, scope)
        svc.audit.record(user_pseudonym=p.user_pseudonym, office=p.office, action="dictionary_read",
                         scope_type=scope.type, scope_hash=scope_hash(scope),
                         details={"entries": len(entries)})
        return {"entries": entries, "expiresAt": info["expiresAt"].isoformat(),
                "confirmBy": info["confirmBy"].isoformat() if info["confirmBy"] else None}

    @app.post("/v1/dictionary/entries")
    def dictionary_entries(body: EntriesIn, authorization: str | None = Header(default=None)):
        """Carica ciphertext/iv/keyId delle voci in attesa (newEntries già cifrate)."""
        p = principal(authorization)
        scope = _scope(body.scope)
        stored, rejected = svc.store.upload(p.user_pseudonym, scope,
                                            [e.model_dump() for e in body.entries])
        svc.audit.record(user_pseudonym=p.user_pseudonym, office=p.office, action="dictionary_upload",
                         scope_type=scope.type, scope_hash=scope_hash(scope),
                         details={"stored": stored, "rejected": len(rejected)})
        return {"stored": stored, "rejected": rejected}

    @app.get("/v1/dictionary/rekey")
    def dictionary_rekey_list(key_id: str = Query(...), after: int = Query(0, ge=0),
                              limit: int = Query(500, ge=1, le=2000),
                              authorization: str | None = Header(default=None)):
        """Voci di TUTTI gli scope dell'utente cifrate con key_id (per la rotazione)."""
        p = principal(authorization)
        if not valid_key_id(key_id):
            raise BadRequest("key_id non valido.")
        entries, nxt = svc.store.list_for_key(p.user_pseudonym, key_id, after, limit)
        return {"entries": entries, "next": nxt}

    @app.put("/v1/dictionary/rekey")
    def dictionary_rekey(body: RekeyIn, authorization: str | None = Header(default=None)):
        """Sostituisce le voci ricifrate con la nuova chiave; quando la vecchia chiave non
        ha più voci, il suo escrow viene cancellato (salvo blocco giudiziario)."""
        p = principal(authorization)
        if not (valid_key_id(body.oldKeyId) and valid_key_id(body.newKeyId)) \
                or body.oldKeyId == body.newKeyId:
            raise BadRequest("oldKeyId e newKeyId devono essere UUID diversi.")
        owned = svc.keystore.owner_keys(p.user_pseudonym, [body.oldKeyId, body.newKeyId])
        if body.newKeyId not in owned:
            raise BadRequest("newKeyId senza escrow: inviare prima POST /v1/keys/escrow.",
                             code="keyId_senza_escrow")
        updated, remaining = svc.store.rekey(p.user_pseudonym, body.oldKeyId, body.newKeyId,
                                             [e.model_dump() for e in body.entries])
        if updated:
            svc.keystore.mark_has_entries([body.newKeyId])
        escrow_deleted = False
        if remaining == 0 and body.oldKeyId in owned:
            from .holds import Holds
            svc.keystore.retire(body.oldKeyId)
            if not Holds.covers(Holds(svc.engine).active(), p.user_pseudonym):
                escrow_deleted = svc.keystore.delete_escrow(body.oldKeyId, reason="rotazione")
        svc.audit.record(user_pseudonym=p.user_pseudonym, office=p.office, action="dictionary_rekey",
                         details={"updated": updated, "remaining": remaining,
                                  "escrow_deleted": escrow_deleted})
        return {"updated": updated, "remaining": remaining, "escrowDeleted": escrow_deleted}

    # ------------------------------------------------------------------ chiavi
    @app.post("/v1/keys/escrow", status_code=204)
    def keys_escrow(body: EscrowIn, authorization: str | None = Header(default=None)):
        p = principal(authorization)
        svc.keystore.put_escrow(p.user_pseudonym, body.keyId, body.wrappedKey, body.escrowKeyId)
        svc.audit.record(user_pseudonym=p.user_pseudonym, office=p.office, action="key_escrow")
        return Response(status_code=204)

    @app.post("/v1/keys/device")
    def keys_device(body: DeviceKeyIn, authorization: str | None = Header(default=None)):
        """Chiave pubblica RSA-OAEP del nuovo dispositivo, per il recupero dei progetti."""
        p = principal(authorization)
        dk = svc.keystore.add_device_key(p.user_pseudonym, body.publicKey)
        svc.audit.record(user_pseudonym=p.user_pseudonym, office=p.office, action="key_device",
                         details={"deviceKeyId": dk})
        return {"deviceKeyId": dk}

    @app.post("/v1/keys/recovered", status_code=204)
    def keys_recovered_upload(body: RecoveredIn, authorization: str | None = Header(default=None)):
        """Caricamento delle chiavi ricifrate dai custodi (tools/custodi). Richiede il token
        amministrativo ADMIN_API_TOKEN (in alternativa: `python -m pseudogate custodia
        importa-recuperate`)."""
        import hmac as _hmac
        tok = (authorization or "").partition(" ")[2].strip()
        if not settings.admin_api_token or not _hmac.compare_digest(tok, settings.admin_api_token):
            raise Unauthorized("Operazione riservata agli amministratori.")
        n = svc.keystore.add_recovered([k.model_dump() for k in body.keys])
        from .registri import log_admin
        log_admin(svc.engine, "api-admin", "chiavi_recuperate_caricate", count=n,
                  devices=sorted({k.deviceKeyId for k in body.keys}))
        return Response(status_code=204)

    @app.get("/v1/keys/recovered")
    def keys_recovered_get(authorization: str | None = Header(default=None)):
        """Chiavi recuperate per i dispositivi dell'utente (da importare come "legacy")."""
        p = principal(authorization)
        keys = svc.keystore.recovered_for(p.user_pseudonym)
        if keys:
            svc.audit.record(user_pseudonym=p.user_pseudonym, office=p.office,
                             action="key_recovered_fetch", details={"count": len(keys)})
        return {"keys": keys}

    # ------------------------------------------------------------------ 7
    @app.post("/v1/reidentify/file")
    async def reidentify_file(scope_type: str = Form(...), scope_id: str = Form(...),
                              entries: str = Form(...), file: UploadFile = File(...),
                              authorization: str | None = Header(default=None)):
        """Ripristino di un file (artifact scaricato). Il server non ha i valori: li invia
        l'estensione, già decifrati, nel campo `entries` (JSON {tag: valore}); restano solo
        in memoria per la durata della richiesta."""
        data = await file.read(settings.max_file_bytes + 1)
        if len(data) > settings.max_file_bytes:
            raise PayloadTooLarge(settings.max_file_mb)
        try:
            mapping = json.loads(entries)
            if not isinstance(mapping, dict) or not all(
                    isinstance(k, str) and isinstance(v, str) for k, v in mapping.items()):
                raise ValueError
        except ValueError as e:
            raise BadRequest("Campo 'entries' non valido: atteso JSON {tag: valore}.") from e
        return await run_in_threadpool(_reidentify_file, scope_type, scope_id,
                                       file.filename or "file", data, mapping, authorization)

    def _reidentify_file(scope_type, scope_id, filename, data, mapping, authorization):
        t0 = time.perf_counter()
        p = principal(authorization)
        scope = make_scope(scope_type, scope_id)
        fk = detect_kind(filename, data)
        if fk.kind is None:
            raise BadRequest(fk.reason, code="unsupported_format")
        # solo i tag che esistono davvero nello scope dell'utente
        allowed = svc.store.tags_in_scope(p.user_pseudonym, scope)
        entries = {canonical_tag(k): v for k, v in mapping.items() if canonical_tag(k) in allowed}
        restored: list[str] = []
        unknown: list[str] = []

        def restore_text(text: str) -> tuple[str, list]:
            reps, unk = Pseudonymizer.find_tags(text, entries)
            restored.extend(r.type for r in reps)  # r.type = tag canonico
            unknown.extend(u for u in unk if u not in unknown)
            return apply_replacements(text, reps), reps

        if fk.kind in ("txt", "md", "csv"):
            dt = decode_text(data)
            out = encode_text(dt, restore_text(dt.text)[0])
        elif fk.kind in ("docx", "xlsx"):
            def transform(texts: list[str]) -> list[list[Edit]]:
                result = []
                for t in texts:
                    _, reps = restore_text(t)
                    result.append([Edit(r.start, r.end, r.tag) for r in reps])
                return result
            out = transform_office(data, fk.kind, transform)
        else:
            try:
                for t in {m.group(0) for m in TAG_RX.finditer(_pdf_text(data))}:
                    tag = canonical_tag(t)
                    (restored if tag in entries else unknown).append(tag)
                out = pdf_files.restore(data, {t: entries[t] for t in set(restored)})
            except pdf_files.PdfProblem as e:
                raise BadRequest(str(e), code="unsupported_format") from e
        new_name = restore_text(filename)[0] if TAG_RX.search(filename) else filename
        tags = list(dict.fromkeys(restored))
        svc.audit.record(user_pseudonym=p.user_pseudonym, office=p.office, action="reidentify_file",
                         scope_type=scope.type, scope_hash=scope_hash(scope),
                         entity_counts=dict(_count_types(restored)),
                         latency_ms=int((time.perf_counter() - t0) * 1000),
                         details={"unknown_tags": len(unknown), "format": fk.kind})
        return {"filename": new_name, "mime": MIME[fk.kind],
                "contentB64": base64.b64encode(out).decode("ascii"),
                "entities": [{"tag": t, "type": _tag_type(t)} for t in tags],
                "unknownTags": unknown, "traceId": None}

    def _pdf_text(data: bytes) -> str:
        if not pdf_files.HAVE_PYMUPDF:
            raise pdf_files.PdfProblem("Il supporto PDF non è installato su questo server.")
        import fitz
        with fitz.open(stream=data, filetype="pdf") as doc:
            return "\n".join(page.get_text() for page in doc)

    # ------------------------------------------------------------------ 8
    @app.post("/v1/scopes/rebind", status_code=204)
    def rebind(body: RebindIn, authorization: str | None = Header(default=None)):
        p = principal(authorization)
        src, dst = _scope(body.from_), _scope(body.to)
        moved = svc.store.rebind(p.user_pseudonym, src, dst)
        svc.audit.record(user_pseudonym=p.user_pseudonym, office=p.office, action="scope_rebind",
                         scope_type=dst.type, scope_hash=scope_hash(dst),
                         details={"moved": moved, "from_type": src.type,
                                  "from_hash": scope_hash(src)})
        return Response(status_code=204)

    # ------------------------------------------------------------------ 9
    @app.delete("/v1/scopes/{scope_type}/{scope_id}", status_code=204)
    def delete_scope(scope_type: str, scope_id: str,
                     authorization: str | None = Header(default=None)):
        p = principal(authorization)
        scope = make_scope(scope_type, scope_id)
        n, _keys = svc.store.delete_scope(p.user_pseudonym, scope, reason="utente")
        svc.audit.record(user_pseudonym=p.user_pseudonym, office=p.office, action="scope_delete",
                         scope_type=scope.type, scope_hash=scope_hash(scope),
                         details={"deleted": n})
        return Response(status_code=204)

    @app.post("/v1/scopes/{scope_type}/{scope_id}/confirm", status_code=204)
    def confirm_scope(scope_type: str, scope_id: str,
                      authorization: str | None = Header(default=None)):
        """Conferma annuale del dizionario di un progetto (senza conferma scade)."""
        p = principal(authorization)
        scope = make_scope(scope_type, scope_id)
        svc.store.confirm(p.user_pseudonym, scope)
        svc.audit.record(user_pseudonym=p.user_pseudonym, office=p.office, action="scope_confirm",
                         scope_type=scope.type, scope_hash=scope_hash(scope))
        return Response(status_code=204)

    # ------------------------------------------------------------------ 10
    @app.post("/v1/events", status_code=204)
    def events(body: EventIn, authorization: str | None = Header(default=None)):
        p = principal(authorization)
        scope = _scope(body.scope) if body.scope else None
        details: dict[str, Any] = {}
        response_hash = None
        if body.event == "response_received":
            text = str(body.details.get("textPseudonymized") or "")
            unknown = body.details.get("unknownTags") or []
            response_hash = sha256(text) if text else None
            details["unknown_tags"] = len(unknown) if isinstance(unknown, list) else 0
            if body.traceId and text:
                svc.tracer.response(trace_id=body.traceId, user=p.user_pseudonym, text=text,
                                    metadata={"unknown_tags": details["unknown_tags"]})
        elif body.event in ("report_false_negative", "report_false_positive"):
            details["note"] = _safe_note(str(body.details.get("note") or ""))
            if body.traceId:
                svc.tracer.event(trace_id=body.traceId, user=p.user_pseudonym, name=body.event,
                                 metadata={"note": details["note"]})
        svc.audit.record(user_pseudonym=p.user_pseudonym, office=p.office, action=body.event,
                         scope_type=scope.type if scope else None, scope_hash=scope_hash(scope),
                         response_sha256=response_hash, trace_id=body.traceId, details=details)
        return Response(status_code=204)

    def _safe_note(note: str) -> str | None:
        """Le note degli utenti non devono contenere dati reali: si mascherano comunque
        le entità rilevate con il solo tipo ([FULLNAME]); se il rilevatore non risponde la
        nota viene scartata."""
        note = note[:1000].strip()
        if not note:
            return None
        if svc.special.first_block(note):
            return "[nota scartata: possibili categorie particolari di dati]"
        try:
            dets = svc.pz.detect(note)
        except (DetectorUnavailable, BadRequest):
            return "[nota scartata: rilevatore non disponibile]"
        parts, pos = [], 0
        for d in dets:
            parts += [note[pos:d.start], f"[{d.label}]"]
            pos = d.end
        return "".join(parts + [note[pos:]])

    return app


def _count_types(tags: list[str]):
    from collections import Counter
    return Counter(_tag_type(t) for t in tags)


def app_factory() -> FastAPI:  # usato da uvicorn --factory
    return create_app()
