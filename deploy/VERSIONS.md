# Componenti, versioni e licenze

Aggiornato al 2026-10-30. Le versioni sono bloccate nei file di compose e nei
`requirements.txt`; per aggiornare un componente cambiare il tag qui **e** nel file
corrispondente, poi rieseguire i test e la procedura di ripristino su una VM di prova.

Licenze verificate sul file di licenza del repository sorgente (clone git del
2026-10-30). I tag delle immagini sono stati scelti dai tag di rilascio dei repository
git: **non è stato possibile verificarne l'esistenza sui registri** (Docker Hub e gli
altri registri non erano raggiungibili dall'ambiente di sviluppo): controllarli al
primo `docker compose pull`.

Attribuzioni e obblighi di licenza (dati di addestramento del modello, PyMuPDF AGPL nelle
immagini redistribuite): vedi [`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md).

## Servizi (deploy/docker-compose.yml)

| Servizio | Immagine / sorgente | Versione | Licenza | Ruolo e motivo della scelta |
|---|---|---|---|---|
| `caddy` | `docker.io/library/caddy` | 2.11.7 | Apache-2.0 | Reverse proxy TLS con i certificati dell'ente; configurazione minima. |
| `api` | build di `server/` (base `python:3.12.16-slim-trixie`) | 0.1.0 | AGPL-3.0-or-later | API di Pseudomania (questo progetto; identificatore tecnico `pseudogate`). |
| `rizzo-pii` | build da `github.com/Rizzo-AI-Academy/rizzo-pii` @ `9057eeff88bd` (22/10/2026), modello `rizzoaiacademy/rizzo-pii-0.3B` rev. `v1.5.0` | app 2.0.0 | Codice **MIT**; l'immagine costruita include **PyMuPDF (AGPL-3.0)**, quindi l'immagine nel suo insieme è AGPL-3.0 se redistribuita (lo dichiara il progetto in THIRD_PARTY_LICENSES.md) | Rilevatore italiano (modello token-classification + regex/checksum). Compatibile con l'AGPL di Pseudomania. Pesi del modello e modello di base mmBERT-base: MIT (schede Hugging Face, verificate il 31/10/2026); dati di addestramento: vedi THIRD_PARTY_NOTICES.md. |
| `postgres` | `docker.io/library/postgres` | 16.15 | PostgreSQL License | DB applicativo `pseudogate` (dizionario cifrato dall'estensione, registro minimo, registri tecnici). |
| `postgres-keys` | `docker.io/library/postgres` | 16.15 | PostgreSQL License | Key store `pseudogate_keys` (escrow delle chiavi utente): container, volume, rete e backup separati. |
| `openbao` (+ `openbao-init`) | `docker.io/openbao/openbao` | 2.7.2 | MPL-2.0 | Transit engine per la sola chiave HMAC del server (`user-hmac`) e segreti; i valori del dizionario sono cifrati dall'estensione. **Sostituisce HashiCorp Vault**, passato dal 2023 alla Business Source License (non open source); OpenBao è il fork comunitario della Linux Foundation, API compatibile. Storage `raft` (lo storage `file` non esiste più in OpenBao). |
| `langfuse-web`, `langfuse-worker` | `docker.langfuse.com/langfuse/langfuse`, `.../langfuse-worker` | 4.72.0 | MIT per il nucleo; le cartelle `ee/` hanno licenza commerciale e **non vengono attivate** (nessuna chiave di licenza EE configurata) | Osservabilità delle trace (solo testi pseudonimizzati). Vedi nota "Langfuse v3/v4". |
| `langfuse-postgres` | `docker.io/library/postgres` | 17.11 | PostgreSQL License | DB di Langfuse, separato da quello di Pseudomania (profilo `langfuse`). |
| `clickhouse` | `docker.io/clickhouse/clickhouse-server` | 26.3.62.3 | Apache-2.0 | Archivio analitico richiesto da Langfuse v3+ (stessa versione del compose ufficiale di Langfuse). |
| `valkey` | `docker.io/valkey/valkey` | 8.1.11 | BSD-3-Clause | Coda/cache di Langfuse. **Sostituisce Redis**, che dalla 7.4 è passato a licenze RSALv2/SSPLv1 (e dalla 8 anche AGPLv3); Valkey è il fork della Linux Foundation di Redis 7.2 BSD, compatibile con il protocollo usato da Langfuse (BullMQ). |
| `seaweedfs` | `docker.io/chrislusf/seaweedfs` | 4.51 | Apache-2.0 | Object storage S3 per Langfuse. **Sostituisce MinIO**, il cui repository comunitario è stato archiviato (distribuzione solo sorgente, console rimossa) e che non è più un'opzione mantenuta per l'auto-ospitalità. |

Il compose ufficiale di Langfuse usato come riferimento è `docker-compose.yml` del
repository `langfuse/langfuse` (commit del 30/10/2026, immagini `:4`).

## Dipendenze Python dell'api (server/requirements.txt)

| Pacchetto | Versione | Licenza | Uso |
|---|---|---|---|
| fastapi | 0.162.0 | MIT | framework HTTP |
| starlette | 1.7.0 | BSD-3-Clause | base di FastAPI (CORS, multipart) |
| uvicorn | 0.54.0 | BSD-3-Clause | server ASGI |
| pydantic | 2.13.5 | MIT | validazione richieste |
| python-multipart | 0.0.32 | Apache-2.0 | upload dei file |
| SQLAlchemy | 2.1.6 | MIT | accesso a PostgreSQL (SQLite solo nei test) |
| psycopg[binary] | 3.3.6 | LGPL-3.0 | driver PostgreSQL |
| httpx | 0.28.1 | BSD-3-Clause | client verso Rizzo-PII e OpenBao |
| PyJWT[crypto] | 2.15.0 | MIT | validazione JWT OIDC |
| cryptography | 50.0.1 | Apache-2.0 / BSD | chiave pubblica di custodia (RSA), JWT |
| PyYAML | 6.0.3 | MIT | allowlist e categorie particolari |
| lxml | 6.1.3 | BSD-3-Clause | DOCX/XLSX a livello OOXML |
| PyMuPDF | 1.28.2 | AGPL-3.0 (o commerciale) | redazione dei PDF |
| langfuse | 5.1.0 | MIT | SDK di tracciamento (solo se `LANGFUSE_ENABLED=true`) |

Solo per i test (`requirements-dev.txt`): pytest 9.1.1 (MIT), python-docx 1.2.0 (MIT),
openpyxl 3.1.5 (MIT).

Codice incluso da terzi: `server/pseudogate/vendor/rizzo_pdf/` (`pdf_export.py`,
`pdf_text.py` di Rizzo-PII, MIT, licenza originale nella stessa cartella).

## Strumenti sull'host

| Strumento | Licenza | Uso |
|---|---|---|
| Docker Engine + Compose v2 | Apache-2.0 | esecuzione |
| age 1.3.x (consigliato) o GnuPG | BSD-3-Clause / GPL-3.0 | cifratura dei backup |

## Note

- **Langfuse v3/v4.** SPEC.md indica Langfuse v3. Al 30/10/2026 la versione corrente
  è la 4.72.0 (l'ultima v3 è la 3.225.15) e il compose ufficiale usa le immagini `:4`
  con la stessa architettura (Postgres, ClickHouse, Redis/Valkey, S3). Qui si usa la
  v4; per restare sulla v3 basta impostare i due tag a `3.225.15`.
- **SDK Langfuse.** L'api usa l'SDK Python 5.1.0 (basato su OpenTelemetry, invio
  all'endpoint OTLP del server). Il tracciamento non è stato provato contro un server
  Langfuse reale in fase di sviluppo: verificarlo al primo avvio (una trace
  "claude.ai message" per ogni invio). Gli errori di tracciamento non bloccano l'api.
- **Python 3.12.** La serie 3.12 riceve solo correzioni di sicurezza fino a ottobre
  2028; valutare il passaggio a 3.13 alla prossima revisione.
