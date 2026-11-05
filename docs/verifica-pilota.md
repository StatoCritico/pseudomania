# Pseudomania Server edition – verifica prima dell'avvio del pilota

Lista di controllo da completare **prima** di aprire il servizio ai 6 utenti del pilota.
Per ogni prova: come eseguirla, risultato atteso, esito. Usare **solo dati di prova**
(persone inventate, codici fiscali di esempio), mai dati reali.

Chi la compila: amministratore di sistema + referente sicurezza; le prove G (registro) e H
(OpenBao) con almeno un custode e il DPO.

Riferimenti: [installazione-ente.md](installazione-ente.md), [configurazione.md](configurazione.md),
[custodi.md](custodi.md). Per la Personal edition: prove ridotte in fondo (sezione K).

## Preparazione

- Un PC gestito del pilota, con Chrome gestito, Pseudomania installata dalla policy, utente di
  prova `test.pilota` nel gruppo `pilota-ia`.
- Un PC **non** gestito (o una VM non iscritta al dominio/MDM) e un telefono Android aziendale
  e uno personale.
- File di prova con dati inventati: `prova.pdf` (testo selezionabile, 2 pagine), `prova.docx`,
  `prova.xlsx`, `prova.txt`, una immagine `prova.png`.
- Testo di prova standard (T1):

  > Gentile dott. Mario Rossi, codice fiscale RSSMRA80A01H501U, residente in via Garibaldi 12,
  > 00184 Roma, tel. 333 1234567, email mario.rossi@example.it, IBAN
  > IT60X0542811101000000123456: la sua pratica n. 45/2026 è stata accolta.

- Accesso alla VM per le query (`cd /opt/pseudogate/deploy`) e un secondo profilo Chrome gestito
  (o un secondo PC gestito) per le prove di cambio PC.
- Per le prove J e H: due custodi della chiave di custodia e la postazione offline
  ([custodi.md §1](custodi.md#1-ruoli-materiale-e-postazione-offline)).
- Abbreviazioni usate sotto:
  ```bash
  psql_app()  { sudo docker compose exec -T postgres      psql -U postgres -d pseudogate      -c "$1"; }
  psql_keys() { sudo docker compose exec -T postgres-keys psql -U postgres -d pseudogate_keys -c "$1"; }
  dc_admin()  { sudo docker compose exec api python -m pseudogate --operatore "Collaudo" "$@"; }
  ```

Legenda esito: ☐ da fare, ✔ superata, ✘ non superata (annotare il motivo e il ticket).

---

## A. Installazione e stato del server

| # | Prova | Come | Risultato atteso | Esito |
|---|---|---|---|---|
| A1 | Servizi attivi | `sudo docker compose ps` | tutti `running`; `healthy` dove previsto | ☐ |
| A2 | Salute | `curl -s https://pseudogate.ente.local/v1/health` dal PC | `"status":"ok"`, `"mode":"ente"`, `"detector":"ok"`, `"keys":"ok"` | ☐ |
| A3 | Certificato | aprire `https://pseudogate.ente.local/v1/health` in Chrome gestito | nessun avviso di certificato | ☐ |
| A4 | Senza token | `curl -s -o /dev/null -w '%{http_code}' https://pseudogate.ente.local/v1/config` | `401` | ☐ |
| A5 | Solo `/v1` esposto | `curl -s -o /dev/null -w '%{http_code}' https://pseudogate.ente.local/` | `404` | ☐ |
| A6 | Porte | da un altro host: `nmap -p 1-65535 pseudogate.ente.local` | aperte solo 443 (e 22 dalla rete amministrativa) | ☐ |
| A7 | Uscite bloccate | installazione-ente.md §14.2, prove da `api` e `rizzo-pii` | nessun accesso a Internet; `api` raggiunge solo l'IdP | ☐ |
| A8 | Codice sorgente (AGPL) | `curl -s https://pseudogate.ente.local/v1/source` | `"source"` con l'URL del repository | ☐ |
| A9 | Policy di Chrome | sul PC del pilota `chrome://policy` | `ExtensionInstallForcelist`, `3rdparty` dell'estensione, `IncognitoModeAvailability=1`, `BrowserGuestModeEnabled=false`, `DeveloperToolsAvailability=2` con stato OK | ☐ |
| A10a | Chiave di custodia pubblicata | `/v1/config` con un token (installazione-ente.md §16) | `escrowKeyId` = `deploy/custodia/escrow_key_id.txt`; `keyRotationDays` 90; `pendingEntryMinutes` 10 | ☐ |
| A10b | Pacchetto estensione | `curl -sI https://pseudogate.ente.local/extension/update.xml` | 200, `application/xml` | ☐ |
| A10 | Accesso OIDC | icona Pseudomania sul PC del pilota | «Accesso eseguito» (login SSO silenzioso o con richiesta credenziali); badge **ON** verde | ☐ |

## B. Pseudonimizzazione del testo e ripristino

| # | Prova | Come | Risultato atteso | Esito |
|---|---|---|---|---|
| B1 | Messaggio | nuova chat, incollare T1, Invio | nel fumetto inviato: `[FULLNAME_1]`, `[CF_1]`, `[STREET_1]`, `[EMAIL_1]`, `[IBAN_1]`, ecc.; nessun valore reale | ☐ |
| B2 | Cosa vede Claude | chiedere «Ripeti esattamente il testo che ti ho mandato» | la risposta contiene i segnaposto (mostrati dall'estensione come valori ripristinati, evidenziati in verde); nel pannello di ispezione il testo inviato ha solo segnaposto | ☐ |
| B3 | Verifica sulla rete | DevTools disattivati per policy: usare il proxy (log dei corpi solo in ambiente di prova) o la trace Langfuse (G4) | il corpo della richiesta verso claude.ai non contiene `Rossi`, `RSSMRA80A01H501U`, `example.it` | ☐ |
| B4 | Stesso valore → stesso tag | nella stessa chat scrivere «Mario Rossi ha chiamato» | riusato `[FULLNAME_1]` | ☐ |
| B5 | Istruzione fissa | primo messaggio di una chat | contiene l'istruzione sui segnaposto (una sola volta per conversazione) | ☐ |
| B6 | Ripristino in streaming | chiedere una risposta lunga che usi i nomi («Scrivi una lettera di 300 parole a Mario Rossi») | durante lo streaming i segnaposto diventano valori reali; nessun segnaposto rimane visibile a fine risposta | ☐ |
| B7 | Segnaposto sconosciuti | chiedere a Claude di inventare `[FULLNAME_9]` | evidenziato in rosso come sconosciuto; evento `response_received` con `unknownTags` | ☐ |
| B8 | Copia | selezionare e copiare la risposta; usare anche il pulsante «Copia» del sito; incollare in Blocco note | testo con i valori reali (ripristinati), non i segnaposto | ☐ |
| B9 | Modifica di un messaggio | modificare un messaggio inviato aggiungendo «e Giulia Bianchi» | la casella mostra i segnaposto; il nuovo nome viene pseudonimizzato (`[FULLNAME_2]`) | ☐ |
| B10 | Rigenera | pulsante «Rigenera» su una risposta | nessun dato reale inviato; la risposta viene ripristinata | ☐ |
| B11 | Testo lungo incollato | incollare T1 ripetuto fino a superare la soglia per cui claude.ai lo trasforma in allegato | allegato pseudonimizzato o invio bloccato; mai inviato in chiaro | ☐ |
| B12 | Allowlist | testo con «Agenzia delle Entrate» e il nome dell'ente | questi termini restano in chiaro | ☐ |

## C. File

| # | Prova | Come | Risultato atteso | Esito |
|---|---|---|---|---|
| C1 | PDF | allegare `prova.pdf` (selettore file), chiedere «Riassumi» | il riassunto (ripristinato) cita i nomi reali; in Langfuse/ispezione solo segnaposto; nel PDF ricevuto da Claude i dati sono sostituiti | ☐ |
| C2 | DOCX | allegare `prova.docx` | come C1 | ☐ |
| C3 | XLSX | allegare `prova.xlsx` (nomi in celle) | come C1 | ☐ |
| C4 | TXT/CSV/MD | allegare `prova.txt` | come C1 | ☐ |
| C5 | Trascinamento e incolla | trascinare `prova.docx` nella casella; incollare un file dagli appunti | come C2 | ☐ |
| C6 | Immagine bloccata (policy predefinita) | senza `imagePolicy` nella policy (o con `"block"`), allegare `prova.png` | banner rosso «Invio bloccato»: le immagini sono bloccate dalla policy dell'ente; l'immagine non parte; nelle impostazioni «Immagini: bloccate (impostato dall'ente)» | ☐ |
| C6a | Immagine con conferma | solo se l'ente lo prevede (DPIA e regolamento): impostare `imagePolicy` = `"confirm"`, ricaricare i criteri, allegare `prova.png`, clic su «Invia l'immagine» | finestra con anteprima e avviso che i dati dell'immagine arrivano a Claude così come sono; l'immagine arriva a Claude con un nome generico (es. `immagine-20261105183000.png`), non `prova.png` | ☐ |
| C6b | Annulla | come C6a, ma clic su «Annulla» | nessun invio, nessun allegato nella casella; riportare poi `imagePolicy` al valore deciso dall'ente | ☐ |
| C6c | Formato non supportato | allegare un file `.zip` | invio bloccato con messaggio in italiano | ☐ |
| C7 | File troppo grande | allegare un PDF oltre `MAX_FILE_MB` (20 MB) | messaggio di file troppo grande, nessun invio | ☐ |
| C8 | PDF lungo | PDF di 30+ pagine | completato entro `RIZZO_TIMEOUT_S` o bloccato con messaggio; annotare il tempo (dimensionamento) | ☐ |
| C9 | Download | chiedere a Claude di creare un file (artifact scaricabile, es. CSV/DOCX con i nomi) e scaricarlo | il file scaricato contiene i valori reali; se il formato non è supportato, avviso e file con segnaposto | ☐ |

## D. Progetti

| # | Prova | Come | Risultato atteso | Esito |
|---|---|---|---|---|
| D1 | Istruzioni di progetto | creare un progetto, istruzioni con «Il referente è Mario Rossi» | salvate con `[FULLNAME_1]` e l'istruzione fissa in testa | ☐ |
| D2 | Conoscenze di progetto | caricare `prova.docx` nelle conoscenze | file pseudonimizzato (`kind=project_knowledge`) | ☐ |
| D3 | Chat nel progetto | nuova chat nel progetto: «Chi è il referente?» | risposta ripristinata con «Mario Rossi» (stesso scope del progetto) | ☐ |
| D4 | Condivisione | cercare l'opzione di condivisione del progetto con l'organizzazione e il link pubblico | non disponibili (console, configurazione.md §A.5) | ☐ |

## E. Blocco dei dati particolari (artt. 9-10 GDPR)

| # | Prova | Come | Risultato atteso | Esito |
|---|---|---|---|---|
| E1 | Salute | «Il dipendente Mario Rossi è in malattia per depressione» | invio bloccato, banner rosso con il motivo; nessun pulsante per forzare | ☐ |
| E2 | Reati | frase con condanna penale | bloccato | ☐ |
| E3 | Altre categorie | una frase per ciascuna categoria di `special_categories.yml` (sindacato, religione, origine etnica, orientamento sessuale, dati biometrici/genetici, opinioni politiche) | bloccate (o registrate se `action: log`) | ☐ |
| E4 | Nei file | DOCX con una diagnosi | bloccato | ☐ |
| E5 | Registro | dopo E1 `SELECT action, blocked, block_category FROM audit_events ORDER BY ts DESC LIMIT 3;` | `blocked=true`, `block_category=salute`; nessun testo | ☐ |
| E6 | Falso positivo | circolare generica sulle assenze per malattia → «Segnala falso positivo» | evento `report_false_positive` registrato, senza dati reali | ☐ |

## F. Fail-closed e tentativi di aggiramento

| # | Prova | Come | Risultato atteso | Esito |
|---|---|---|---|---|
| F1 | Server spento | `sudo docker compose stop api`; inviare T1 | invio **bloccato**, badge **!** rosso; nessun dato partito. Poi `sudo docker compose start api` | ☐ |
| F2 | Rilevatore spento | `sudo docker compose stop rizzo-pii`; inviare T1 | bloccato (503 → blocco) | ☐ |
| F3 | OpenBao sigillato | `sudo docker compose restart openbao`; inviare T1 | bloccato; dopo `./scripts/openbao-unseal.sh` torna a funzionare | ☐ |
| F4 | Rete del PC verso il server interrotta | bloccare `pseudogate.ente.local` sul PC (es. regola firewall locale di prova) | bloccato | ☐ |
| F5 | Disattivare l'estensione | `chrome://extensions` | Pseudomania «Installata dall'amministratore»: interruttore e Rimuovi non disponibili; nel popup «Nella Server edition la protezione non può essere disattivata.» | ☐ |
| F6 | Incognito | Ctrl+Maiusc+N | finestra incognito non disponibile | ☐ |
| F7 | Ospite / nuovo profilo | menu profilo → Ospite / Aggiungi | non disponibili; un eventuale altro profilo ha comunque l'estensione forzata | ☐ |
| F8 | DevTools | F12 su claude.ai | non si aprono | ☐ |
| F9 | Altro browser | Edge/Firefox sul PC del pilota → claude.ai | bloccato dal proxy (configurazione.md §F) | ☐ |
| F10 | Dispositivo non gestito | PC non gestito, rete interna → claude.ai, login con account del pilota | bloccato dal proxy e/o dall'accesso condizionato SSO | ☐ |
| F11 | Fuori rete | PC non gestito da Internet (es. rete mobile) → claude.ai, login SSO | login rifiutato dall'accesso condizionato | ☐ |
| F12 | Login senza SSO | da qualunque browser, login con email (link magico) o Google per l'account del pilota | rifiutato: SSO obbligatorio | ☐ |
| F13 | Account personale | da Chrome gestito, login a claude.ai con un account personale | rifiutato se le restrizioni per tenant sono attive (§F.4); altrimenti annotare come rischio residuo | ☐ |
| F14 | App desktop | eseguire l'installer di Claude Desktop sul PC del pilota | bloccato da AppLocker/WDAC | ☐ |
| F15 | App Android | telefono aziendale: cercare Claude nel Play Store gestito | non disponibile; se già installata viene rimossa | ☐ |
| F16 | Telefono personale | browser o app Claude, login con account del pilota | rifiutato dall'accesso condizionato | ☐ |
| F17 | Microfono | pulsante di dettatura/voce su claude.ai | assente o bloccato (messaggio di dettatura disattivata) | ☐ |
| F18 | Connettori | menu strumenti/connettori di claude.ai | nessun connettore disponibile né richiedibile | ☐ |
| F18a | Memoria spenta | impostazioni utente di claude.ai; in una nuova chat chiedere «Cosa ricordi di me?» dopo aver scritto T1 in un'altra chat | memoria non attivabile; Claude non richiama contenuti di altre chat | ☐ |
| F18b | Feedback disattivato | cercare pollice su/giù sotto una risposta | assente (o vietato dalla policy se non disattivabile: annotare) | ☐ |
| F18c | Primary Owner | console Claude Team → membri | Primary Owner = account di servizio; accesso possibile solo con password (custode A) + MFA (custode B) | ☐ |
| F19 | Claude in Chrome | installare l'estensione Claude dal Web Store | bloccata dalla policy | ☐ |
| F21 | Ricerca web | chiedere una ricerca su un argomento citando «Mario Rossi» nel messaggio; leggere la query mostrata da Claude e la trace Langfuse | la richiesta di ricerca contiene il segnaposto o nessun nome; annotare ogni query con dati sfuggiti (misura del pilota) | ☐ |
| F20 | Pagina non riconosciuta | (simulazione) l'amministratore indica una situazione in cui i selettori non funzionano: verificare che nei log arrivi `page_unrecognized` | invio bloccato e evento registrato | ☐ |

## G. Registro, Langfuse e cancellazione

| # | Prova | Come | Risultato atteso | Esito |
|---|---|---|---|---|
| G1 | Registro scritto | dopo B1: `sudo docker compose exec postgres psql -U postgres -d pseudogate -c "SELECT ts,user_pseudonym,action,kind,entity_counts,blocked FROM audit_events ORDER BY ts DESC LIMIT 5;"` | righe presenti; `user_pseudonym` è un hash; conteggi per tipo | ☐ |
| G2 | Nessun dato in chiaro nel DB | `sudo docker compose exec -T postgres pg_dump -U postgres -d pseudogate | grep -Ei 'rossi|RSSMRA80A01H501U|example\.it|333 ?1234567' ; echo "esito: $?"` | nessuna riga (`esito: 1`): il DB contiene solo HMAC e testi cifrati | ☐ |
| G2b | Nessun dato nel key store | come G2 su `postgres-keys` / `pseudogate_keys` | nessuna riga | ☐ |
| G2c | Hash dei messaggi | `psql_app "SELECT ts, length(prompt_sha256) FROM audit_events WHERE action LIKE 'pseudonym%' ORDER BY ts DESC LIMIT 3;"` | `prompt_sha256` presente (64 caratteri) per ogni messaggio inviato | ☐ |
| G3 | Nessun dato nei log | `sudo docker compose logs api caddy 2>&1 | grep -Ei 'rossi|RSSMRA|example\.it'` | nessuna riga | ☐ |
| G4 | Trace Langfuse | `https://langfuse.ente.local` → progetto Pseudomania → Traces | una trace `claude.ai message` per invio; `userId` = pseudonimo; input e output con soli segnaposto | ☐ |
| G5 | Nessun dato in Langfuse | cercare «Rossi» nelle trace | nessun risultato | ☐ |
| G6 | Utente non identificabile senza custodi | l'amministratore prova a collegare lo pseudonimo a `test.pilota` senza token OpenBao | non possibile (serve la chiave `user-hmac`, cioè la soglia di custodi) | ☐ |
| G7 | Cancellazione manuale | pannello laterale → cancella i dati della chat di B1; poi `psql_app "SELECT count(*) FROM dict_entries WHERE scope_id='<uuid chat>';"` | 0 righe; la cancellazione compare in `deletion_log`; ricaricando la chat restano segnaposto | ☐ |
| G8 | Scadenza automatica | su VM di prova `DICT_TTL_CONVERSATION_DAYS=0`, `docker compose up -d api`, poi `dc_admin retention` | dizionari delle chat cancellati e registrati; riportare i valori di produzione | ☐ |
| G8b | Conferma annuale dei progetti | pannello laterale su un progetto | scadenza della conferma visibile; il pulsante di conferma la sposta in avanti | ☐ |
| G8c | Aggregazione del registro | su VM di prova `AUDIT_RETENTION_DAYS=0`, `dc_admin retention`; `psql_app "SELECT count(*) FROM audit_events;"` e `"SELECT * FROM audit_daily LIMIT 5;"` | eventi pseudonimi rimossi, restano solo aggregati per giorno/ufficio/azione senza utente | ☐ |
| G8d | Pulizia Langfuse | su un ambiente di prova `LANGFUSE_RETENTION_DAYS=1`, attendere un giorno e un ciclo del job | nel progetto Pseudomania nessuna trace più vecchia di 1 giorno; trace di altri progetti (Langfuse condiviso) intatte | ☐ |
| G8e | Registri integri | `dc_admin registri verifica` | catene di hash di `deletion_log` e `admin_log` integre | ☐ |
| G8f | Registri append-only | `psql_app "DELETE FROM admin_log WHERE id=1;"` | rifiutato (trigger) | ☐ |
| G9 | Rebind chat nuova | nuova chat: inviare T1 prima che l'URL abbia l'id; poi ricaricare la pagina | i valori vengono ancora ripristinati (scope `pending:` ricollegato) | ☐ |
| G10 | Isolamento tra utenti | secondo utente del pilota apre il link della chat del primo (se accessibile) | vede solo segnaposto | ☐ |

## H. OpenBao, riavvio e backup

| # | Prova | Come | Risultato atteso | Esito |
|---|---|---|---|---|
| H1 | Sigillato dopo il riavvio | `sudo reboot` della VM; poi `sudo docker compose exec openbao bao status` | `Sealed true`; gli invii sono bloccati (F3) | ☐ |
| H2 | Sblocco con i custodi | `sudo ./scripts/openbao-unseal.sh` con 3 custodi diversi | `Sealed false`; servizio ripristinato; tempo annotato | ☐ |
| H3 | Quote fuori dalla VM | `sudo ls deploy/secrets/` | non esistono `openbao-init.txt` né `openbao-init-cifrato.txt`; token root revocato; nessuna quota di custodia sulla VM (`deploy/custodia/` contiene solo i due file pubblici) | ☐ |
| H4 | Backup DB applicativo | `sudo ./scripts/backup.sh` | in `BACKUP_DIR/giornalieri/<data>/` i file `pseudogate`, `openbao`, `env`, `segreti`, `registro` (+ `langfuse`) `.age` non vuoti; log «Backup completato» | ☐ |
| H4b | Backup key store separato | `sudo ./scripts/backup-chiavi.sh` | un file `keys-<data>.sql.gz.age` in `BACKUP_KEYS_DIR`; **nessun** dump di `pseudogate_keys` in `BACKUP_DIR` | ☐ |
| H4c | Rotazioni | dopo 15 giorni (o con file datati a mano su VM di prova) | `BACKUP_KEYS_DIR` senza file più vecchi di 14 giorni; `BACKUP_DIR` con al massimo 7 giornalieri + 4 settimanali | ☐ |
| H4d | Copia offline | registro dei backup | copia settimanale su supporto scollegato annotata | ☐ |
| H5 | Backup cifrati | `head -c 40 <file>.age` per ogni tipo | intestazione `age-encryption.org/v1`, nessun testo leggibile | ☐ |
| H6 | Pianificazione | `cat /etc/cron.d/pseudogate-backup`; il giorno dopo controllare il log | backup notturno eseguito | ☐ |
| H7 | Ripristino | procedura installazione-ente.md §20 su VM di prova | servizio funzionante; una chat precedente al backup, riaperta dallo stesso browser, mostra i valori reali | ☐ |
| H7b | Riapplicazione delle cancellazioni | prima del backup creare la chat X; dopo il backup cancellarla (G7); ripristinare il backup; eseguire `./scripts/riapplica-cancellazioni.sh "Collaudo"` | **prima** dello script le voci di X ricompaiono nel DB; **dopo** lo script sono di nuovo cancellate; `registri verifica` integro; verbale redatto | ☐ |
| H8 | Firewall dopo riavvio | `sudo iptables -L DOCKER-USER -n` dopo H1 | regole presenti | ☐ |

## J. Cifratura lato client, chiavi e custodia

| # | Prova | Come | Risultato atteso | Esito |
|---|---|---|---|---|
| J1 | Voci cifrate | dopo B1: `psql_app "SELECT tag, key_id, length(ciphertext), length(iv), pending_until FROM dict_entries ORDER BY id DESC LIMIT 5;"` | ogni voce ha `ciphertext`, `iv` (16 caratteri base64 = 12 byte) e `key_id`; nessun valore leggibile | ☐ |
| J2 | Escrow presente | `psql_keys "SELECT key_id, escrow_key_id, length(wrapped_key), retired_at FROM escrows ORDER BY created_at DESC LIMIT 3;"` | un escrow per la chiave dell'utente, `escrow_key_id` = chiave di custodia in uso, `wrapped_key` di 684 caratteri (512 byte in base64) | ☐ |
| J3 | Server senza valori | `sudo docker compose logs api | grep -Ei 'rossi|RSSMRA'` dopo B1 | nessuna riga | ☐ |
| J4 | Voci in attesa | simulare la perdita del caricamento (chiudere Chrome subito dopo l'invio, prima che l'estensione carichi le voci; ripetere se necessario) e attendere 10 minuti | voci senza ciphertext non ripristinabili; scrivendo di nuovo lo stesso valore nella stessa chat la voce viene riproposta e caricata | ☐ |
| J5 | Rotazione forzata | `dc_admin chiavi forza-rotazione --sub "<sub di test.pilota>" --motivo "collaudo"`; aprire claude.ai e attendere un minuto | in `escrows` compare una chiave nuova; le voci dell'utente passano al nuovo `key_id` (J1); l'escrow vecchio ha `retired_at` o non esiste più; le chat esistenti si ripristinano ancora | ☐ |
| J6 | Rotazione e CORS | durante J5 osservare gli errori nel pannello dell'estensione / log dell'api | `PUT /v1/dictionary/rekey` riuscito (risposta con `remaining: 0`); se fallisce per CORS controllare `CORS_ALLOW_ORIGIN_REGEX` e la versione dell'api | ☐ |
| J7 | Rotazione automatica | su VM di prova `KEY_ROTATION_DAYS=0` (o 1 e attesa), riaprire claude.ai | `/v1/config` → `rotateKey: true`, poi rotazione come J5 senza azioni dell'utente; riportare a 90 | ☐ |
| J8 | Cambio PC: chat | con un **nuovo profilo** Chrome gestito (stesso utente) aprire la chat di B1 | segnaposto «non ripristinabili» (grigi) con avviso; nessuna procedura di recupero proposta per le chat | ☐ |
| J9 | Cambio PC: progetto | nel nuovo profilo aprire il progetto di D1 → pannello → «Prepara il recupero» | viene mostrato un codice dispositivo; in `device_keys` (key store) compare la chiave pubblica | ☐ |
| J10 | Recupero con i custodi | custodi.md §4: `esporta-escrow`, `custodi.py ricifra` con 2 quote, `importa-recuperate` | dopo al massimo un minuto il progetto mostra i valori reali nel nuovo profilo; verbale di recupero; nessun file intermedio rimasto | ☐ |
| J11 | Recupero con una sola quota | `custodi.py ricifra` con una sola quota | rifiutato (soglia non raggiunta) | ☐ |
| J12 | Verifica quote | `custodi.py verifica --quota q1 --quota q3 --pubblica escrow_public.pem` | «quote valide», `corrisponde_alla_pubblica: true` | ☐ |
| J13 | Richiesta giudiziaria simulata | custodi.md §5 su dati di prova: blocco, `esporta-voci` limitato a un tag, `decifra-voci` | CSV con il solo valore richiesto; verbale; file distrutti | ☐ |
| J14 | Blocco sospende la cancellazione | con un blocco sullo scope di prova, cancellare lo scope dal pannello / forzare la scadenza | voci ed escrow **non** cancellati finché il blocco è attivo; dopo `blocchi revoca` vengono cancellati al job successivo | ☐ |
| J15 | Cancellazione crittografica dell'escrow | utente di prova: cancellare tutti i suoi scope (o attendere che la chiave non abbia più voci) e far girare `dc_admin retention` | escrow della chiave distrutto in `escrows`; evento in `deletion_log`; con la sola quota dei custodi le eventuali voci rimaste in un vecchio backup non sono più decifrabili (prova: `decifra-voci` su un'esportazione vecchia → errore escrow mancante) | ☐ |
| J16 | Escrow fuori dai backup oltre 14 giorni | controllare le date in `BACKUP_KEYS_DIR` dopo J15 + 14 giorni | nessun backup del key store anteriore alla distruzione | ☐ |
| J17 | Root non decifra | da root sulla VM, con OpenBao sbloccato: provare a ottenere un valore del dizionario (DB, key store, OpenBao) | impossibile senza la chiave nel browser o la soglia dei custodi; annotare il rischio residuo dichiarato (testo in chiaro durante la richiesta, verifica di valori indovinati via HMAC) | ☐ |
| J18 | Account Primary Owner | i due custodi accedono insieme all'account di servizio (senza esportare) | accesso riuscito solo con entrambi; verbale | ☐ |

## K. Personal edition (se distribuita ai professionisti)

| # | Prova | Come | Risultato atteso | Esito |
|---|---|---|---|---|
| K1 | Rizzo-PII locale | app desktop avviata; impostazioni → Verifica connessione | «Rizzo-PII raggiungibile.» | ☐ |
| K2 | Testo | nuova chat, attivare la protezione con il pulsante (badge **ON**), inviare T1 | segnaposto nel testo inviato, valori ripristinati nella risposta | ☐ |
| K3 | DOCX/XLSX/PDF | allegare i file di prova | DOCX/XLSX pseudonimizzati; PDF inviato come .txt con avviso | ☐ |
| K4 | Rizzo-PII spento | chiudere l'app e inviare T1 in una chat con protezione attiva | avviso e richiesta di conferma; annullando non parte nulla; badge **!** rosso | ☐ |
| K5 | Disattivazione con il pulsante | in una chat **senza** dati protetti e con protezione attiva, clic sul pulsante della barra degli strumenti | badge **OFF** arancione, icona grigia, barra arancione; T1 parte in chiaro | ☐ |
| K5a | Scorciatoia | Alt+Maiusc+P (e dopo averla cambiata in `chrome://extensions/shortcuts`) | stato invertito come con il pulsante | ☐ |
| K5b | Avviso al primo spegnimento | in una chat che contiene già dati protetti, spegnere la protezione | avviso: l'invio andrà in chiaro e riattivare non ripulisce il già inviato; solo la prima volta in quella chat | ☐ |
| K5c | Solo l'uscita | con OFF, chiedere a Claude di ripetere il messaggio con i segnaposto inviato prima | i segnaposto nella risposta vengono ancora ripristinati (anche copia e download) | ☐ |
| K5d | Stato per scheda | due schede con due chat, una ON e una OFF; passare dall'una all'altra e cambiare chat nella stessa scheda senza ricaricare | badge e barra seguono sempre la conversazione aperta | ☐ |
| K5e | Nuova chat: disattivata di default | anche dopo aver attivato un'altra chat, aprire una nuova chat, una pagina di progetto e una nuova scheda | badge **OFF** arancione e barra arancione «Protezione disattivata: i messaggi partono in chiaro. Per attivarla clicca l'icona di Pseudomania o premi Alt+Maiusc+P»; nessuna domanda, nessun pulsante «Attiva» / «Continua senza protezione» | ☐ |
| K5f | Attivazione di una nuova chat | nella nuova chat clic sul pulsante (o Alt+Maiusc+P), inviare T1 | badge **ON**, T1 pseudonimizzato; dopo il primo invio lo stato resta ON con l'id definitivo | ☐ |
| K5g | Chat ripresa | riaprire una chat lasciata ON e una lasciata OFF (anche in un'altra scheda o dopo il riavvio di Chrome) | la prima si riattiva da sola; la seconda resta disattivata, senza domande | ☐ |
| K5h | Registro | dopo K5–K5g, pannello di ispezione / registro locale | eventi `extension_enabled`/`extension_disabled` con `per = conversation` e `trigger` = `toolbar` o `shortcut`; nessun testo | ☐ |
| K6 | Dati locali cifrati | DevTools dell'estensione → IndexedDB `pseudomania` | valori cifrati, nessun valore leggibile | ☐ |
| K7 | CORS | K1 con l'app desktop reale | nessun messaggio CORS (se compare: PROBLEMI-RILEVATI.md, fork di Rizzo-PII) | ☐ |

## L. Chiusura

| # | Prova | Come | Risultato atteso | Esito |
|---|---|---|---|---|
| L1 | Pulizia | cancellare tutte le chat e i progetti di prova (claude.ai e pannello laterale) | nessun dato di prova residuo | ☐ |
| L2 | Documentazione | policy d'uso, informativa agli utenti, DPIA aggiornata con gli esiti | approvate dal DPO | ☐ |
| L3 | Rischi residui | elencare le prove ✘ e i limiti noti (selettori di claude.ai non verificati, artifact in iframe, sessioni aperte fuori rete, testo in chiaro sul server durante la richiesta, preferenze del profilo e ricerche web non intercettate, voci non caricate entro 10 minuti) | accettati formalmente o risolti | ☐ |

Firma e data: amministratore ____________ referente sicurezza ____________ DPO ____________
