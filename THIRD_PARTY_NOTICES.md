# Avvisi e attribuzioni di terze parti

Pseudomania (https://pseudomania.statocritico.it; identificatore tecnico `pseudogate`) è
distribuito con licenza **AGPL-3.0-or-later** (file `LICENSE`). Questo file riguarda i
componenti di terze parti usati da `server/`, `deploy/`, `tools/custodi/` e `collaudo/`
(Server edition; la Personal edition usa l'app desktop di Rizzo-PII): codice incluso nel
repository, dipendenze installate nelle immagini, immagini container e il modello di
rilevamento con i relativi dati di addestramento. L'elenco completo di versioni e licenze
delle immagini è in [`deploy/VERSIONS.md`](deploy/VERSIONS.md); le parti dell'estensione
Chrome sono trattate in `extension/`.

Le informazioni sono state verificate sui file di licenza e sulle schede dei progetti il
30-31/10/2026. Non costituiscono parere legale.

## 1. Codice di terzi incluso nel repository

| Percorso | Origine | Licenza |
|---|---|---|
| `server/pseudogate/vendor/rizzo_pdf/pdf_export.py`, `pdf_text.py` | [Rizzo-PII](https://github.com/Rizzo-AI-Academy/rizzo-pii), commit `9057eeff88bd` | MIT, © 2026 Simone Rizzo — Rizzo AI Academy (testo in `server/pseudogate/vendor/rizzo_pdf/LICENSE`) |
| `deploy/docker-compose.yml` (servizi Langfuse) | adattato dal `docker-compose.yml` ufficiale di [Langfuse](https://github.com/langfuse/langfuse) | MIT (parti non `ee/`) |

## 2. Rilevatore Rizzo-PII e modello

Il servizio `rizzo-pii` (Server edition) è costruito dal repository ufficiale; la Personal
edition usa invece l'app desktop di Rizzo-PII installata dall'utente; il modello viene scaricato da
Hugging Face durante la build.

- **Codice Rizzo-PII**: MIT, © 2026 Simone Rizzo — Rizzo AI Academy.
- **Pesi del modello** [`rizzoaiacademy/rizzo-pii-0.3B`](https://huggingface.co/rizzoaiacademy/rizzo-pii-0.3B)
  (revisione `v1.5.0`): MIT secondo la scheda del modello.
- **Modello di base** [`jhu-clsp/mmBERT-base`](https://huggingface.co/jhu-clsp/mmBERT-base): MIT.

### Dati di addestramento del modello (attribuzioni)

Il modello è stato addestrato anche su dati di terzi. Pseudomania non contiene né
redistribuisce questi dati, ma ridistribuisce (nelle immagini costruite) pesi addestrati su
di essi; si riportano quindi le attribuzioni richieste.

- **Ai4Privacy** — dataset [`ai4privacy/open-pii-masking-500k-ai4privacy`](https://huggingface.co/datasets/ai4privacy/open-pii-masking-500k-ai4privacy),
  © Ai4Privacy, licenza **Creative Commons Attribution 4.0 International (CC BY 4.0)**,
  https://creativecommons.org/licenses/by/4.0/ (la scheda del dataset indica `license: other`
  con `license_name: cc-by-4.0`). Usato da Rizzo-PII, con modifiche (rimappatura delle
  etichette sulle 22 categorie, arricchimento con entità sintetiche), per addestrare il modello.
- **DeepMount00** — dataset [`DeepMount00/pii-masking-ita`](https://huggingface.co/datasets/DeepMount00/pii-masking-ita).
  **La scheda del dataset non dichiara alcuna licenza** (come segnalato dagli stessi autori di
  Rizzo-PII nel loro `THIRD_PARTY_LICENSES.md`): i termini di riutilizzo dei dati non sono
  definiti. Pseudomania non usa né distribuisce il dataset; chi intendesse redistribuire i
  dati (non i pesi) deve chiedere l'autorizzazione all'autore. Da segnalare al DPO e
  all'ufficio legale come punto aperto nella valutazione del modello.
- Dati sintetici generati dal progetto Rizzo-PII (nessun dato personale reale secondo gli autori).

## 3. PyMuPDF (AGPL-3.0) nelle immagini

[PyMuPDF](https://github.com/pymupdf/PyMuPDF) è distribuito da Artifex con doppia licenza
**AGPL-3.0** o commerciale. È presente:

- nell'immagine `api` (dipendenza `PyMuPDF` in `server/requirements.txt`, redazione dei PDF);
- nell'immagine `rizzo-pii` costruita dal suo Dockerfile.

Conseguenze: un'immagine che contiene PyMuPDF, se **redistribuita** (es. pubblicata su un
registro o consegnata a un altro ente), è un'opera combinata soggetta all'AGPL-3.0 e va
accompagnata dal sorgente corrispondente: per l'immagine `api` è questo repository; per
`rizzo-pii` è il repository Rizzo-PII al commit indicato in `deploy/docker-compose.yml`.
Lo stesso vale per l'uso in rete (art. 13 AGPL): l'api espone `GET /v1/source`, da
configurare con `SOURCE_URL`. La licenza AGPL di Pseudomania è compatibile con PyMuPDF.

## 4. Dipendenze Python dell'api (`server/requirements.txt`)

| Pacchetto | Licenza |
|---|---|
| fastapi | MIT |
| starlette | BSD-3-Clause |
| uvicorn | BSD-3-Clause |
| pydantic | MIT |
| python-multipart | Apache-2.0 |
| SQLAlchemy | MIT |
| psycopg (binary) | LGPL-3.0-or-later (la variante binary include libpq, PostgreSQL License, e OpenSSL, Apache-2.0) |
| httpx | BSD-3-Clause |
| PyJWT | MIT |
| cryptography | Apache-2.0 o BSD-3-Clause |
| PyYAML | MIT |
| lxml | BSD-3-Clause (include libxml2/libxslt, MIT) |
| PyMuPDF | AGPL-3.0 o commerciale (vedi §3) |
| langfuse (SDK) | MIT |

Solo test: pytest (MIT), python-docx (MIT), openpyxl (MIT). Strumenti di collaudo
(`collaudo/`): reportlab (BSD) per generare i PDF di prova, cryptography per emulare la
cifratura lato client. Strumento dei custodi (`tools/custodi/`): cryptography
(Apache-2.0 o BSD-3-Clause); la condivisione del segreto di Shamir è implementata nel
progetto (`tools/custodi/shamir.py`), senza dipendenze di terzi.

## 5. Immagini container (`deploy/`)

| Componente | Licenza | Note |
|---|---|---|
| Caddy | Apache-2.0 | |
| PostgreSQL | PostgreSQL License | |
| OpenBao | MPL-2.0 | fork comunitario (Linux Foundation) di HashiCorp Vault |
| Langfuse (web, worker) | MIT per il nucleo | le cartelle `ee/` hanno licenza commerciale e non sono attivate (nessuna chiave EE) |
| ClickHouse | Apache-2.0 | |
| Valkey | BSD-3-Clause | |
| SeaweedFS | Apache-2.0 | |
| Python (immagine base `python:*-slim`) | PSF License; sistema Debian con licenze dei rispettivi pacchetti | |

Le immagini di base includono pacchetti di sistema con licenze proprie (GPL, LGPL, ecc.):
chi redistribuisce le immagini deve rispettarne gli obblighi (es. offerta del sorgente).
