# Decisioni di progetto (vincolanti) – aggiornamento 31/10/2026

## Deviazioni e precisazioni (agente server, 31/10/2026)

Implementate lato server; l'estensione deve adeguarsi (dettagli in SPEC.md, sezione API).

1. **`aadScope` dopo un rebind.** L'AAD contiene `scopeId`: una voce cifrata nello scope `pending:<uuid>` e poi
   spostata da `POST /v1/scopes/rebind` non si decifrerebbe più con l'id definitivo. Il server conserva l'AAD
   originale e in `GET /v1/dictionary` (e in `GET /v1/dictionary/rekey`) la voce riporta
   `"aadScope": {"type","id"}`: se presente, l'AAD da usare è `aadScope.type|aadScope.id|tag`. Alla ricifratura
   (`PUT /v1/dictionary/rekey`) l'estensione usa l'AAD dello scope attuale e il server azzera `aadScope`.
2. **Endpoint aggiunto `GET /v1/dictionary/rekey?key_id=&after=&limit=`** per scaricare le voci di una chiave in
   tutti gli scope (necessario alla rotazione; non era specificato). `PUT /v1/dictionary/rekey` ha corpo
   `{"oldKeyId","newKeyId","entries":[{"scope","tag","ciphertext","iv"}]}` e risposta
   `{"updated","remaining","escrowDeleted"}`; si può chiamare a lotti.
3. **`POST /v1/keys/recovered` è riservato all'amministratore** (token `ADMIN_API_TOKEN`; alternativa da riga di
   comando). L'estensione **scarica** le chiavi recuperate con **`GET /v1/keys/recovered`**
   → `{"keys":[{"keyId","wrappedKey","deviceKeyId","createdAt"}]}` (RSA-OAEP-SHA256 per la chiave pubblica del
   dispositivo; disponibili 7 giorni). `POST /v1/keys/device` ha corpo `{"publicKey"}` (SPKI base64) e restituisce
   `{"deviceKeyId"}`.
4. **`POST /v1/reidentify` (testo) eliminato**: il server non ha più i valori, il ripristino dei testi è nel
   browser. **`POST /v1/reidentify/file`** resta (artifact DOCX/XLSX/PDF/testo) ma richiede il campo multipart
   **`entries`** = JSON `{tag: valore}` già decifrato dall'estensione; i valori restano solo in memoria e sono
   usati solo per i tag dello scope dell'utente. La risposta include `unknownTags`.
5. **Validazioni**: `POST /v1/dictionary/entries` accetta solo voci in attesa (non scadute) e solo con un `keyId`
   per cui l'utente ha già inviato l'escrow (così ogni voce è recuperabile dai custodi); risposta
   `{"stored","rejected":[{"tag","reason"}]}`. Le voci non caricate in tempo vengono **riproposte** in
   `newEntries` alla successiva comparsa dello stesso valore.
6. **Campi aggiuntivi**: `/v1/config` include anche `keyRotationDays` e `pendingEntryMinutes`; `GET /v1/dictionary`
   include `confirmBy` (scadenza della conferma annuale dei progetti); `/v1/health` include `"keys"` e `status`
   può valere `"degraded"`.
7. **Rizzo-PII e CORS (Personal edition)**: il server Flask di Rizzo-PII non invia intestazioni CORS. Una
   chiamata dal **service worker** dell'estensione con `host_permissions` per `http://127.0.0.1:5005/*` non è
   soggetta a CORS in Chrome, quindi il fork potrebbe non servire; da verificare sul browser reale.

Questo file prevale su SPEC.md dove sono in conflitto. L'agente server aggiorna SPEC.md alla fine per riallinearlo.

## Decisioni dell'ente

1. **Memoria di Claude: SPENTA** (console Team). Eliminare `globalTagScope` e tutto ciò che riguarda il rischio R7 come rischio aperto: diventa "mitigato spegnendo la memoria". Le **preferenze personali** del profilo Claude non sono intercettate: il regolamento vieta di inserirvi dati personali.
2. **Ricerca web di Claude: ATTIVA.** Misure: verifica del sub-fornitore di ricerca, informativa, regola d'uso (niente dati personali nelle richieste di ricerca), misura nel pilota delle query con dati sfuggiti.
3. **Cifratura lato client del dizionario, chiave AUTOMATICA** (nessuna frase segreta). Obiettivo: minimo lavoro per l'IT, root sulla VM non può decifrare in blocco i dizionari.
4. **Osservabilità ibrida**: contenuti delle chat recuperabili tramite esportazione di Claude Team (Primary Owner su account di servizio con credenziali e MFA divise tra due custodi, solo su richiesta dell'autorità giudiziaria, verbale, estrazione della sola parte richiesta e distruzione del resto). Sul server: registro minimo senza testi, con hash SHA-256 del testo pseudonimizzato di ogni messaggio inviato (verifica di autenticità dell'esportazione e delle cancellazioni).
5. **Due edizioni**:
   - **Edizione enti**: estensione + server su VM + Langfuse (servizio condiviso con altre applicazioni dell'ente: progetto Langfuse dedicato a PseudoGate).
   - **Edizione personale**: SOLO estensione + app desktop di Rizzo-PII (servizio locale `http://127.0.0.1:5005`). Nessun server PseudoGate, nessun Docker, nessun Langfuse. Eliminare `deploy/personale/` e la modalità `PG_MODE=personale` del server. Se il servizio locale di Rizzo-PII non accetta chiamate dall'estensione (CORS) si farà un fork di Rizzo-PII: documentarlo, non farlo ora.
6. **Lettera ad Anthropic**: dopo la prova tecnica.

## Durate di conservazione (edizione enti)

| Dato | Durata |
|---|---|
| Dizionario chat | 30 giorni dall'ultimo uso; nessun recupero dopo cambio PC |
| Dizionario progetti | durata del progetto + 30 giorni dall'ultimo uso; conferma annuale fatta dall'utente nel pannello (senza conferma scade); recupero via custodi solo su richiesta motivata |
| Scope `pending:` | 24 ore |
| Registro azioni (audit_events) | 90 giorni in forma pseudonima, poi solo aggregati anonimi (conteggi per giorno/ufficio senza utente) |
| Tracce Langfuse | 30 giorni durante il pilota, poi 7 (job nostro: la retention di Langfuse self-hosted è a pagamento) |
| Backup DB applicativo | rotazione ≤ 35 giorni (7 giornalieri + 4 settimanali), una copia offline |
| Archivio chiavi (key store) e suoi backup | backup separati, rotazione 14 giorni |
| Copie di custodia delle chiavi utente (escrow) | stessa vita della chiave: rotazione automatica ogni 90 giorni, distrutte con la chiave |
| Registri tecnici accessi amministratori e custodi | 24 mesi, append-only, con hash di integrità |
| Verbali dei custodi e richieste dell'autorità | protocollati, secondo il massimario dell'ente |
| Blocco per autorità giudiziaria | sospende la cancellazione solo dei dati indicati, fino a revoca, registrato |

## Progetto crittografico (edizione enti) – contratto tra estensione e server

- **Chiave utente K_u**: AES-GCM 256 generata dall'estensione al primo avvio. Subito dopo la generazione la chiave grezza viene (a) cifrata con la **chiave pubblica di custodia** e inviata al server come escrow, (b) importata come CryptoKey **non estraibile** in IndexedDB; la copia grezza viene scartata. Ogni chiave ha un `keyId` (UUID).
- **Chiave pubblica di custodia**: RSA-OAEP-4096 SHA-256, pubblicata dal server in `/v1/config` come `escrowPublicKey` (SPKI base64) + `escrowKeyId`. La chiave privata **non sta mai sul server**: è generata offline e divisa con Shamir 2-di-3 (configurabile) tra i custodi, con uno strumento CLI offline fornito nel repository (`tools/custodi/`).
- **Valori del dizionario**: cifrati dall'estensione con K_u, AES-GCM, IV casuale, AAD = `scopeType|scopeId|tag`. Il server conserva: `value_hmac` (HMAC con chiave server in OpenBao, serve a dare lo stesso tag allo stesso valore), `ciphertext`, `iv`, `keyId`. Il server NON conserva il valore in chiaro, nemmeno temporaneamente su disco o nei log.
- **Flusso**: `POST /v1/pseudonymize` (e `/file`) restituisce anche `newEntries: [{tag, value}]` (valori in chiaro solo nella risposta, solo per le voci nuove: l'utente li ha già nel testo originale). L'estensione li cifra e chiama `POST /v1/dictionary/entries` `{scope, entries:[{tag, ciphertext, iv, keyId}]}`. Finché le voci non sono caricate restano "pending" (solo hmac→tag); se non arrivano entro 10 minuti il ripristino di quelle voci non sarà possibile (accettato).
- **Ripristino**: `GET /v1/dictionary` restituisce `{entries:{tag:{ciphertext, iv, keyId}}, expiresAt}`; l'estensione decifra localmente. Voci con `keyId` sconosciuto al browser (cambio PC) → mostrate come tag "non ripristinabili", con link alla procedura di recupero (solo progetti).
- **Escrow**: `POST /v1/keys/escrow` `{keyId, wrappedKey, escrowKeyId}`; conservato nel **key store separato** (database PostgreSQL distinto `pseudogate_keys`, volume e backup propri a 14 giorni, mai nei backup del DB applicativo). Gli escrow sono per utente/chiave.
- **Rotazione ogni 90 giorni** (automatica, nessuna azione dell'utente): nuova K_u' + escrow, l'estensione scarica i propri ciphertext, li ricifra, li ricarica (`PUT /v1/dictionary/rekey`), poi il server cancella l'escrow vecchio. Rotazione forzata da server: flag `rotateKey: true` in `/v1/config` per quell'utente (usato in caso di esposizione).
- **Cambio PC**: nuova K_u; i dizionari vecchi non sono ripristinabili. **Recupero (solo progetti, su richiesta)**: la nuova estensione genera una coppia RSA-OAEP di dispositivo e pubblica la chiave pubblica (`POST /v1/keys/device`); due custodi, offline con `tools/custodi/`, ricostruiscono la chiave privata di custodia, decifrano l'escrow di K_u_old e la ricifrano per la chiave pubblica del dispositivo; il risultato viene caricato (`POST /v1/keys/recovered`) e l'estensione lo importa come chiave "legacy" non estraibile. Verbale.
- **Autorità giudiziaria**: stesso strumento: i custodi decifrano offline l'escrow dell'utente indicato e le sole voci richieste. Verbale.
- **Cancellazione crittografica**: alla scadenza o su richiesta si cancellano le voci del dizionario e, quando una chiave non ha più voci vive, il suo escrow; registro delle cancellazioni append-only (tabella + esportazione) da riapplicare dopo ogni ripristino da backup. Procedura con verbale in docs.
- **Rischio residuo dichiarato**: il server vede il testo in chiaro durante la singola richiesta; root può intercettare richieste future, non decifrare i dizionari passati; root può verificare se un valore indovinato è presente (HMAC).

## Edizione personale – progetto

- Estensione autonoma: chiama direttamente Rizzo-PII `POST /analyze` su `127.0.0.1:5005` (formato già documentato dall'agente server: segmenti, `include_mapping`).
- Tag, dizionario e registro locale gestiti dall'estensione in IndexedDB, cifrati con chiave locale non estraibile. Nessun escrow. Durate: chat 30 giorni dall'ultimo uso, progetti finché l'utente non li elimina.
- DOCX e XLSX elaborati nell'estensione in JavaScript (zip con le API native di Chrome `CompressionStream`/`DecompressionStream` "deflate-raw", o libreria vendorizzata con licenza compatibile). PDF: rilevamento con Rizzo `/analyze` (upload file) e invio a Claude come **file di testo pseudonimizzato** (.txt) al posto del PDF, con avviso all'utente.
- Attivazione/disattivazione con un clic, stato sempre visibile; se Rizzo-PII non risponde: avviso e richiesta di conferma.

## Nome, dominio e sito (aggiornamento)

- Il prodotto si chiama **Pseudomania** (sostituisce il nome provvisorio PseudoGate in testi, UI, documenti, sito; identificatori tecnici come nomi di pacchetti/servizi possono restare `pseudogate` dove rinominarli è rischioso, ma i testi visibili dicono Pseudomania).
- Sito ufficiale: **https://pseudomania.statocritico.it** (sostituisce i segnaposto ORG/github.io come URL del sito; il repository resta un segnaposto finché non deciso).
- Edizioni: **Personal edition** e **Enterprise edition** (nomi visibili).
- Struttura della landing page: sezioni **Il problema**, **La soluzione**, **Non solo software** (impostazioni di Claude, policy, DPIA, accordo sindacale, custodi), **Personal edition**, **Enterprise edition**, **Approfondimenti** (FAQ, licenza, note legali, guida all'uso, link agli strumenti). Ogni sezione è un **carosello** di schede sui punti principali; ogni scheda cliccata porta alla sezione corrispondente degli approfondimenti.
- Pagine di approfondimento raggruppate per capitoli/argomenti, con **menu laterale ad albero** cliccabile, espandibile e comprimibile.
- Serve un **manuale utente** (installazione, configurazione, uso, creazione di una policy in versione "light" e "strutturata") con **disclaimer**: la responsabilità legale resta interamente di chi adotta e usa il sistema.

## Attivazione per conversazione (aggiornamento 1/11/2026)

- **Enterprise edition**: protezione sempre attiva, pulsante bloccato su acceso (policy).
- **Personal edition**: pulsante nella barra degli strumenti di Chrome (chrome.action) con stato per scheda/conversazione (badge ON/OFF, barra verde/rossa sopra il campo di testo), scorciatoia da tastiera (es. Alt+Maiusc+P, configurabile da chrome://extensions/shortcuts).
  - Lo stato si salva **per conversazione/progetto** (scope).
  - **Nuova conversazione**: se l'ultimo stato scelto dall'utente era "attivo" si attiva da sola; se era "disattivato" chiede se riattivarsi (banner con «Attiva» / «Continua senza protezione»).
  - **Conversazione ripresa**: se era attiva si riattiva da sola; se era disattivata mostra lo stesso banner di richiesta.
  - **La disattivazione riguarda solo l'uscita** (pseudonimizzazione dei messaggi e allegati inviati). Il ripristino dei tag in entrata è **sempre attivo**.
  - Al primo spegnimento in una conversazione che contiene già dati protetti: avviso che ciò che verrà inviato andrà in chiaro e che riattivare non ripulisce quanto già inviato.
  - Ogni cambio di stato va nel registro locale (senza testi).
