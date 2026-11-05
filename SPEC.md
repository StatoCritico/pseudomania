# Pseudomania – specifica condivisa (contratto tra i componenti)

Prodotto: **Pseudomania** (sito https://pseudomania.statocritico.it). Identificatori tecnici
(pacchetti, servizi, database, cartelle) possono restare `pseudogate`. Licenza del codice:
**AGPL-3.0-or-later**. Le decisioni vincolanti sono in [DECISIONI.md](DECISIONI.md): questo file le
recepisce (aggiornato il 31/10/2026); in caso di conflitto prevale DECISIONI.md.

Scopo: pseudonimizzare in automatico ciò che un dipendente invia a claude.ai (piano Claude Team) e
ripristinare i dati reali nelle risposte. Due edizioni:

- **Server edition**: estensione Chrome + server su VM interna (questo contratto) + Langfuse
  (progetto dedicato, anche su un Langfuse condiviso dell'ente).
- **Personal edition**: SOLO estensione + app desktop di Rizzo-PII su `http://127.0.0.1:5005`.
  Nessun server Pseudomania, nessun Docker, nessun Langfuse (vedi sezione in fondo).

Tutti i testi visibili all'utente sono in **italiano**.

## Struttura del repository

```
pseudogate/
  SPEC.md, DECISIONI.md   contratto e decisioni vincolanti
  LICENSE                 AGPL-3.0; THIRD_PARTY_NOTICES.md attribuzioni
  extension/              estensione Chrome MV3 (fork di Privacy Guardrail del DFKI, Apache-2.0)
  server/                 API FastAPI + Dockerfile + config (allowlist, categorie particolari)
  deploy/                 docker-compose (Server edition), .env.example, Caddyfile, script, backup
  tools/custodi/          strumento OFFLINE dei custodi (chiave di custodia, Shamir, recupero)
  collaudo/               corpus sintetico e valutazione
  docs/  site/  governance/
```

## Servizi (Server edition, rete interna)

| Servizio compose | Immagine / build | Porta interna | Note |
|---|---|---|---|
| `caddy` | caddy | 443 (unica esposta) | TLS con certificato dell'ente; `/v1/*` → `api`; `/extension/` → pacchetto dell'estensione; Langfuse |
| `api` | build `server/` | 8787 | API di Pseudomania |
| `rizzo-pii` | build da https://github.com/Rizzo-AI-Academy/rizzo-pii | 5005 | rete interna, nessuna uscita |
| `postgres` | postgres:16 | 5432 | DB applicativo `pseudogate` (dizionario cifrato dall'estensione, registro minimo, registri tecnici) |
| `postgres-keys` | postgres:16 | 5432 | **key store separato** `pseudogate_keys` (escrow): container, volume, rete e backup propri |
| `openbao` | openbao/openbao | 8200 | transit: SOLO la chiave HMAC `user-hmac`; segreti (AppRole) |
| `langfuse-web`, `langfuse-worker` + `langfuse-postgres`, `clickhouse`, `valkey`, `seaweedfs` | langfuse v4 | 3000 | profilo compose `langfuse`; facoltativi se l'ente ha già un Langfuse |

Nessun MinIO (archiviato): S3 = SeaweedFS. Nessun Redis: Valkey. Nessun Vault: OpenBao.
URL di esempio: `https://pseudogate.ente.local` (API sotto `/v1`), `https://langfuse.ente.local`.

## Formato dei segnaposto

`[TIPO_N]`, TIPO = etichetta Rizzo-PII (FULLNAME, EMAIL, TELEPHONENUM, STREET, BUILDINGNUM, ZIPCODE,
CITY, PROVINCE, IBAN, CREDITCARDNUMBER, AMOUNT, CF, PIVA, CATASTO, DOCID, ID_DOC, ORG, DATE, TIME,
TARGA, AGE, GENDER, più URL e IPADDR), N progressivo per **scope** e per tipo. Stesso valore
(normalizzato: NFC, trim, spazi compressi, case-fold) nello stesso scope → stesso tag (il server
lo riconosce tramite `value_hmac`). Termini dell'allowlist mai mascherati.

## Scope del dizionario

- `conversation`: id = UUID della chat (`/chat/<uuid>`). Chat nuova: scope temporaneo
  `pending:<uuid4>`, poi `POST /v1/scopes/rebind`.
- `project`: id = UUID del progetto; le chat dentro un progetto usano lo scope del progetto.
- Ogni utente vede solo i propri scope.

## Istruzione fissa per Claude

Restituita da `/v1/config` come `tagInstruction`:

> I testi contengono segnaposto tra parentesi quadre come [FULLNAME_n] o [CF_n] (n = numero). Riportali esattamente
> come sono, senza modificarli, tradurli, declinarli o spiegarli, e non crearne di nuovi.

## Progetto crittografico (contratto estensione ↔ server)

- **Chiave utente K_u**: AES-GCM-256 generata dall'estensione, con `keyId` (UUID). Subito: cifrata con la
  chiave pubblica di custodia e inviata come escrow; importata come CryptoKey **non estraibile**; la copia
  grezza viene scartata.
- **Chiave pubblica di custodia**: RSA-OAEP-4096, SHA-256 (MGF1 SHA-256, label vuota), in `/v1/config` come
  `escrowPublicKey` (SPKI DER base64) + `escrowKeyId`. La privata non è mai sul server: generata offline e
  divisa con Shamir (predefinito 2 di 3) con `tools/custodi/`.
- **Valori**: cifrati dall'estensione con K_u, AES-GCM, IV casuale di 12 byte, tag GCM 128 bit accodato,
  **AAD = `scopeType|scopeId|tag`** (UTF-8). Base64 standard per `ciphertext` e `iv`.
  Eccezione: se una voce riporta `aadScope` (voce spostata da `rebind` dopo essere stata cifrata),
  l'AAD usa `aadScope.type|aadScope.id|tag`. Alla ricifratura (`rekey`) l'AAD torna quello dello scope attuale.
- **Server**: conserva `value_hmac` (HMAC con chiave in OpenBao), `ciphertext`, `iv`, `keyId`. Mai il valore in
  chiaro, nemmeno temporaneamente su disco o nei log.
- **Voci in attesa**: una voce nuova nasce senza ciphertext; l'estensione la carica entro
  `PENDING_ENTRY_MINUTES` (10). Se non arriva, il caricamento viene rifiutato e la voce viene **riproposta** in
  `newEntries` la prossima volta che lo stesso valore compare nello stesso scope.
- **Rotazione** ogni `KEY_ROTATION_DAYS` (90) o su richiesta del server (`rotateKey: true`): nuova chiave +
  escrow, `GET /v1/dictionary/rekey` per scaricare le voci della vecchia chiave, ricifratura, `PUT
  /v1/dictionary/rekey`; quando la vecchia chiave non ha più voci il server ne distrugge l'escrow.
- **Cambio PC**: nuova chiave; voci con `keyId` sconosciuto → "non ripristinabili". Recupero (solo progetti, su
  richiesta motivata): `POST /v1/keys/device` (chiave pubblica RSA-OAEP del dispositivo), i custodi ricifrano
  offline l'escrow per quella chiave, il risultato è caricato dall'amministratore e l'estensione lo scarica con
  `GET /v1/keys/recovered` e lo importa come chiave "legacy" non estraibile.

## API (base `serverUrl`, JSON UTF-8)

Autenticazione: `Authorization: Bearer <token OIDC>` (JWT dell'IdP dell'ente, ottenuto con
`chrome.identity.launchWebAuthFlow`, code + PKCE). Firma via JWKS (`OIDC_ISSUER`, `OIDC_AUDIENCE`, CA interna
aggiuntive `EXTRA_CA_FILE` valide per tutte le chiamate in uscita, proxy `OUTBOUND_HTTPS_PROXY` e `OUTBOUND_NO_PROXY`). Identità = claim `sub` (o `preferred_username`), mai
salvata: `user_pseudonym = HMAC-SHA256(user-hmac, "user:"+sub)`. Ufficio facoltativo da `OIDC_OFFICE_CLAIM`
(solo per gli aggregati anonimi).

1. `GET /v1/health` (senza auth) → `{"status":"ok|degraded","version","mode":"ente","detector":"ok|down","keys":"ok|sealed|down"}`.
   Sempre HTTP 200; `degraded` se rilevatore o OpenBao non sono disponibili.
2. `GET /v1/config` → `{"mode":"ente","failClosed","allowDisable","tagInstruction","allowlist":[str],"policyVersion",
   "maxFileMB","escrowPublicKey","escrowKeyId","rotateKey":bool,"keyRotationDays":int,"pendingEntryMinutes":int}`.
   `rotateKey` è per utente: chiave attiva più vecchia di `keyRotationDays`, rotazione forzata dall'amministratore,
   oppure escrow fatto con una chiave di custodia diversa da quella attuale (sostituzione della chiave di custodia:
   `POST /v1/keys/escrow` con il vecchio `escrowKeyId` riceve 409 `escrow_key_mismatch` → l'estensione rilegge
   `/v1/config`; le quote della vecchia chiave vanno conservate finché esistono escrow con il vecchio `escrowKeyId`).
3. `POST /v1/pseudonymize`
   req `{"scope":{"type","id"},"site":"claude.ai","kind":"message|edit|regenerate|project_instructions","text"}`
   resp `{"text","entities":[{"tag","type","start","end"}],"newEntries":[{"tag","value"}],"blocked","blockReason","traceId"}`.
   `start/end` sul testo originale. `newEntries` = voci ancora senza ciphertext (valori in chiaro solo in questa
   risposta). `blocked=true` (artt. 9-10 GDPR) → `text` vuoto e `blockReason` in italiano.
4. `POST /v1/pseudonymize/file` multipart `scope_type, scope_id, site, kind (attachment|project_knowledge), file`
   → `{"filename","mime","contentB64","entities":[{"tag","type"}],"newEntries":[{"tag","value"}],"blocked","blockReason","traceId"}`.
   Formati: pdf, docx, xlsx, txt, md, csv; altri → `blocked`. Anche il nome del file è pseudonimizzato.
5. `POST /v1/dictionary/entries` req `{"scope":{...},"entries":[{"tag","ciphertext","iv","keyId"}]}`
   → `{"stored":int,"rejected":[{"tag","reason"}]}`; `reason` ∈ `tag_non_valido`, `keyId_non_valido`,
   `iv_non_valido`, `ciphertext_non_valido`, `keyId_senza_escrow` (la chiave deve avere un escrow dell'utente),
   `non_in_attesa_o_scaduta`.
6. `GET /v1/dictionary?scope_type=..&scope_id=..` → `{"entries":{"[TAG]":{"ciphertext","iv","keyId","aadScope"?}},
   "expiresAt":iso8601,"confirmBy":iso8601|null}` (solo voci cifrate; `confirmBy` per i progetti).
7. `GET /v1/dictionary/rekey?key_id=..&after=0&limit=500` → `{"entries":[{"scope","tag","ciphertext","iv","keyId","aadScope"?}],"next":int|null}`
   (voci di tutti gli scope dell'utente cifrate con `key_id`, paginate).
8. `PUT /v1/dictionary/rekey` req `{"oldKeyId","newKeyId","entries":[{"scope","tag","ciphertext","iv"}]}`
   → `{"updated","remaining","escrowDeleted"}`. `newKeyId` deve avere già l'escrow. A `remaining=0` l'escrow di
   `oldKeyId` viene distrutto (salvo blocco giudiziario). Si può chiamare a lotti.
9. `POST /v1/keys/escrow` req `{"keyId","wrappedKey","escrowKeyId"}` → 204. `wrappedKey` = RSA-OAEP-4096 di K_u
   grezza (32 byte), 512 byte in base64; 409 `escrow_key_mismatch` se la chiave di custodia è cambiata.
10. `POST /v1/keys/device` req `{"publicKey"}` (SPKI base64, RSA ≥ 2048) → `{"deviceKeyId"}`.
11. `GET /v1/keys/recovered` → `{"keys":[{"keyId","wrappedKey","deviceKeyId","createdAt"}]}` (RSA-OAEP-SHA256 per la
    chiave del dispositivo; disponibili 7 giorni).
    `POST /v1/keys/recovered` (solo amministratore, `Authorization: Bearer <ADMIN_API_TOKEN>`)
    req `{"keys":[{"deviceKeyId","keyId","wrappedKey","ownerPseudonym"?}]}` → 204 (file prodotto da
    `tools/custodi/custodi.py ricifra`; in alternativa `python -m pseudogate custodia importa-recuperate`).
12. `POST /v1/reidentify/file` multipart `scope_type, scope_id, entries, file` → stesso schema di 4 senza `blocked`
    e `newEntries`, più `unknownTags`. `entries` = JSON `{tag: valore}` decifrato dall'estensione: i valori restano
    solo in memoria per la richiesta e sono usati solo per i tag esistenti nello scope. (Il ripristino dei testi
    avviene nel browser: non esiste più `POST /v1/reidentify`.)
13. `POST /v1/scopes/rebind` req `{"from":{...},"to":{...}}` → 204; 409 `rebind_conflict` se lo scope di destinazione ha tag in conflitto.
14. `DELETE /v1/scopes/{type}/{id}` → 204 (cancellazione crittografica, registrata).
15. `POST /v1/scopes/{type}/{id}/confirm` → 204 (conferma annuale di un progetto; 400 per le chat).
16. `POST /v1/events` req `{"traceId","scope","event","details"}` → 204; eventi: `response_received`
    (`{"textPseudonymized","unknownTags"}`), `inspection_opened`, `report_false_negative`, `report_false_positive`
    (`{"note"}`, mascherata), `blocked`, `extension_disabled`, `extension_enabled`, `page_unrecognized`, `server_unreachable`,
    `scope_rebind_conflict` (rebind rifiutato con 409; accettato anche come `page_unrecognized` con
    `details.reason = "scope_rebind_conflict"`).
17. `GET /v1/source` → `{"license":"AGPL-3.0-or-later","source":str|null,"version"}` (`SOURCE_URL`).

Errori: `{"error":code,"message"}`; 400 richiesta non valida, 401 token non valido, 409 conflitto,
413 file troppo grande, 503 rilevatore o servizio chiavi non disponibile.

## Conservazione (DECISIONI.md)

| Dato | Regola implementata |
|---|---|
| Dizionario chat | 30 giorni dall'ultimo uso (pseudonimizzazione o lettura) |
| Dizionario progetti | 30 giorni dall'ultimo uso **oppure** senza conferma annuale (`/confirm`) |
| Scope `pending:` | 24 ore |
| Escrow | distrutto quando la chiave non ha più voci (dopo averne avute) o dopo la rotazione; mai se c'è un blocco sull'utente |
| `audit_events` | 90 giorni, poi solo aggregati anonimi `audit_daily` (giorno, ufficio, azione, conteggi) |
| Langfuse | job via API pubblica (`LANGFUSE_RETENTION_DAYS`: 30 nel pilota, poi 7), limitato al progetto delle chiavi |
| Backup DB applicativo | 7 giornalieri + 4 settimanali + copia offline (`deploy/scripts/backup.sh`) |
| Key store | backup separato, rotazione 14 giorni (`deploy/scripts/backup-chiavi.sh`) |
| Registri tecnici (`deletion_log`, `admin_log`) | 24 mesi, append-only (trigger) con catena di hash |
| Blocco giudiziario | tabella `judicial_holds` + `python -m pseudogate blocchi ...`; sospende la cancellazione dei soli dati indicati |
| Registro cancellazioni | esportato in JSONL fuori dal DB (`DELETION_LOG_DIR`); da riapplicare dopo ogni ripristino (`cancellazioni riapplica`) |

## Registro e osservabilità

- `audit_events`: `id, ts, user_pseudonym, office, action, site, scope_type, scope_hash, kind, entity_counts,
  blocked, block_category, prompt_sha256` (SHA-256 del testo pseudonimizzato di ogni messaggio), `response_sha256,
  latency_ms, trace_id, details`. Mai valori originali né testi.
- Langfuse: una trace per invio (`name="claude.ai message"`, `userId=user_pseudonym`, input = testo
  pseudonimizzato; risposta da `response_received`). Opzionale (`LANGFUSE_ENABLED`).
- Dizionario: `dict_entries(scope_type, scope_id, owner_pseudonym, tag, entity_type, value_hmac, ciphertext, iv,
  key_id, aad_scope, pending_until, created_at, last_used_at, uploaded_at)` + `dict_scopes(…, last_used_at, confirmed_at)`.
- Key store: `escrows(key_id, owner_pseudonym, escrow_key_id, wrapped_key, created_at, has_entries, retired_at)`,
  `device_keys`, `recovered_keys`, `rotation_requests`.
- Rischio residuo dichiarato: il server vede il testo in chiaro durante la singola richiesta; root può
  intercettare richieste future ma non decifrare i dizionari passati; root può verificare se un valore
  indovinato è presente (HMAC).

## Amministrazione e custodi

- `docker compose exec api python -m pseudogate --operatore "<nome>" <comando>`: `blocchi aggiungi|revoca|elenca`,
  `custodia esporta-escrow|esporta-voci|importa-recuperate`, `chiavi forza-rotazione`, `cancellazioni esporta|riapplica`,
  `registri verifica`, `retention`, `migrate`. Ogni comando va in `admin_log`.
- `tools/custodi/custodi.py` (offline): `genera-chiave`, `verifica`, `ridistribuisci`, `ricifra`, `decifra-voci`,
  `verbale`. Formati di scambio: `pseudomania-escrow-export`, `pseudomania-voci-export`, `pseudomania-chiavi-recuperate` (JSON v1).

## Estensione: configurazione

`chrome.storage.managed` (schema `extension/schema.json`): `mode` ("ente"), `serverUrl`, `oidcIssuer`, `oidcClientId`,
`oidcScopes`, `oidcTokenType` ("access_token" predefinito | "id_token"; con id_token `OIDC_AUDIENCE` = `oidcClientId`),
`failClosed` (default true), `allowDisable` (default false), `sites` (default `["claude.ai"]`), `imagePolicy`
("block" predefinito | "confirm" | "ocr"; "ocr" non ancora disponibile, vale come "block"). In Server edition
`failClosed` e `allowDisable` si leggono SOLO dalla policy: `/v1/config` non può indebolirli. La memoria di Claude è
spenta dall'ente (DECISIONI.md, punto 1): non esiste uno scope globale dei tag.
Se `managed.mode` è assente → **Personal edition**.
Personal edition, impostazioni locali (`chrome.storage.local`): `imagePolicy` (predefinito "confirm") e
`activationMode` ("off" predefinito | "on" | "ask"). Vedi DECISIONI.md, aggiornamento 5/11/2026 (sera).

## Personal edition

Nessun server Pseudomania. L'estensione chiama direttamente Rizzo-PII (app desktop) su
`http://127.0.0.1:5005`, `POST /analyze` con `{"text","exclude_tags":[],"include_mapping":true}` (risposta a
segmenti: `{"t"}` oppure `{"label","ph","src","validated","t"}`; Rizzo applica `text.strip()`, gli offset si
ricostruiscono sommando le lunghezze dei segmenti e aggiungendo gli spazi iniziali tolti) e con multipart (campo
`file`) per i PDF. Tag, dizionario e registro sono gestiti nell'estensione (IndexedDB, chiave locale non
estraibile, nessun escrow). Durate: chat 30 giorni dall'ultimo uso; progetti finché l'utente non li elimina.
Se Rizzo-PII non accetta chiamate dall'estensione (CORS) si valuterà un fork (da documentare, non ora).
