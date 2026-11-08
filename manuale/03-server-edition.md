# 3. Server edition

> **Sperimentale – non verificata.** La Server edition non è ancora stata collaudata in un ambiente
> reale: per il momento **se ne sconsiglia il download e l'installazione**. Chi la scarica lo fa a
> proprio rischio, solo per prove e mai con dati reali.

Per **enti pubblici e imprese** che danno ai dipendenti account **Claude Team** e vogliono
ridurre il rischio che dati personali arrivino al fornitore. La Server edition **non è solo
software**: funziona solo insieme a impostazioni della console di Claude, policy di Chrome, accesso
condizionato, regole d'uso, DPIA, accordo sindacale e custodi.

Questo capitolo è una **panoramica** per chi decide e per il responsabile IT. Le istruzioni tecniche
complete e aggiornate sono nella cartella `docs/` del repository:

| Documento | Per chi | Contenuto |
|---|---|---|
| `docs/installazione-ente.md` | amministratori di sistema | dalla VM al servizio in esercizio, backup, ripristino, conservazione |
| `docs/custodi.md` | custodi, DPO, amministratori | chiave di custodia, recupero, autorità giudiziaria, verbali |
| `docs/configurazione.md` | amministratori di Claude Team, identità, postazioni, rete | console Claude, identity provider, policy di Chrome, blocco app, proxy |
| `docs/verifica-pilota.md` | amministratori, sicurezza, DPO | prove da superare prima dell'avvio |
| `docs/PROBLEMI-RILEVATI.md` | sviluppo e IT | difetti noti e rimedi operativi |

Ordine consigliato: installazione (con la generazione della chiave di custodia **prima** del primo
avvio) → configurazione → verifica del pilota.

## 3.1 Architettura in breve

- **Estensione Chrome** installata in modo **forzato e non disattivabile** sui browser gestiti; la
  configurazione arriva dalla policy di Chrome (`mode: "ente"`).
- **Server Pseudomania** su una VM Linux interna (Docker Compose): API, **Rizzo-PII** senza accesso
  a Internet, database applicativo (dizionario cifrato, registro minimo), **key store separato**
  (copie di custodia delle chiavi), **OpenBao** (solo la chiave HMAC), **Caddy** (TLS, unica porta
  esposta: 443).
- **Langfuse** (facoltativo): tracce con i soli testi pseudonimizzati, in un progetto dedicato.
  Può girare sulla VM oppure essere un Langfuse **condiviso o esterno** già usato
  dall'organizzazione (§3.4, punto 7).
- **Identity provider** dell'organizzazione (OIDC) per autenticare l'estensione presso il server.
- **Fail-closed**: se il server non risponde, l'invio è **bloccato**.

**Che cosa protegge la cifratura.** Ogni utente ha una chiave generata automaticamente dal suo
browser, non estraibile, con cui l'estensione cifra i valori del dizionario prima di inviarli al
server. Una copia della chiave, cifrata con la **chiave pubblica di custodia**, è conservata nel key
store; la chiave privata di custodia non è mai sul server ed è divisa tra i custodi (2 di 3). Le
chiavi ruotano ogni 90 giorni. **Rischio residuo dichiarato**: il server vede il testo in chiaro
durante la singola richiesta; chi ha i privilegi di root sulla VM può intercettare richieste future,
non decifrare i dizionari passati; può verificare se un valore indovinato è presente (HMAC).

## 3.2 Prerequisiti organizzativi

Prima di installare (dettagli e riferimenti nel capitolo 5 e in `governance/checklist-adempimenti.md`):

- [ ] decisione formale di adozione e perimetro del **pilota** (utenti, durata);
- [ ] abbonamento **Claude Team** con accordo commerciale e **DPA** di Anthropic verificati;
- [ ] **DPIA** con parere del DPO (bozza in `governance/dpia.md`);
- [ ] **accordo sindacale** o autorizzazione dell'Ispettorato nazionale del lavoro (art. 4, c. 1,
  L. 300/1970) che copra registro minimo, tracce, esportazione e procedura dei custodi;
- [ ] **regolamento d'uso** con informativa (Allegato A), procedura di cancellazione (Allegato B) e
  procedura dei custodi (Allegato C) (bozza in `governance/policy-uso-ia.md`);
- [ ] **designazioni**: amministratori di sistema, almeno **tre custodi** distinti dagli
  amministratori, persone autorizzate;
- [ ] **formazione** degli utenti e dei custodi;
- [ ] PC gestiti (dominio, Intune/MDM o Chrome Enterprise Core), Chrome come browser gestito;
- [ ] una VM Linux interna (pilota di 6 utenti, stima: 8 vCPU, 16–24 GB di RAM, 100 GB SSD),
  DNS interno, certificati TLS dell'organizzazione;
- [ ] un identity provider OIDC (Keycloak, Microsoft Entra ID o altro) e l'SSO per Claude Team.

## 3.3 Ruoli

| Ruolo | Che cosa fa | Che cosa **non** fa |
|---|---|---|
| **Titolare** (legale rappresentante, dirigente delegato) | adotta regolamento e DPIA, designa i ruoli, stipula i contratti | — |
| **DPO / RPD** | parere sulla DPIA, sorveglianza, presente alle cerimonie dei custodi, punto di contatto per gli interessati | non amministra il sistema |
| **Amministratori di sistema** | VM, server, backup, Chrome Enterprise, SSO, proxy, Langfuse, console Claude Team con ruoli diversi dal Primary Owner; esportano per i custodi i file cifrati; caricano le chiavi recuperate | **nessun accesso** alla chiave privata di custodia né all'account Primary Owner; accedono al registro solo in forma aggregata o pseudonima |
| **Custodi** (almeno 3, ne servono 2) | tengono le quote della chiave privata di custodia e, divise tra due di loro, password e secondo fattore dell'account Primary Owner; operano offline, con verbale | non accedono ai contenuti per richieste diverse da autorità giudiziaria e recupero di progetti; non usano l'account Primary Owner per l'amministrazione ordinaria |
| **Help desk / assistenza** | primo contatto per gli utenti: avvisi dell'estensione, accesso, richieste di recupero (ticket con il codice del dispositivo), segnalazioni | non chiede mai agli utenti di disattivare l'estensione o di inviare dati reali |
| **Dirigente / referente del servizio** | individua gli utenti, approva le richieste motivate di recupero dei progetti | non può chiedere i contenuti delle conversazioni |
| **Utenti** | usano claude.ai secondo il regolamento, segnalano anomalie, confermano i progetti ogni anno | non aggirano né manomettono l'estensione |

## 3.4 Installazione in sintesi

Procedura completa: `docs/installazione-ente.md`. Comandi eseguiti nella cartella
`/opt/pseudogate/deploy` della VM.

1. **VM e rete**: Ubuntu Server 24.04 LTS o Debian 12; nomi DNS interni (es.
   `pseudogate.ente.local`, `langfuse.ente.local`); certificati dell'ente; Docker Engine.
2. **Codice**: `git clone` del repository in `/opt/pseudogate` (URL indicato sul sito) e annotazione
   del commit.
3. **Immagini**: `docker compose build api rizzo-pii` (anche su un'altra macchina, per VM senza
   Internet).
4. **Chiave di custodia** (prima del primo avvio): i custodi la generano **offline** con
   `tools/custodi/custodi.py genera-chiave`; sulla VM si copiano **solo** i due file pubblici
   (`escrow_public.pem`, `escrow_key_id.txt`) in `deploy/custodia/` (§3.5).
5. **Segreti e `.env`**: `./scripts/genera-segreti.sh`, poi a mano dominio, `OIDC_ISSUER`,
   `OIDC_AUDIENCE`, `CORS_ALLOW_ORIGIN_REGEX`, `SOURCE_URL`, destinazioni e chiavi dei due backup.
   Per le CA interne (IdP, Langfuse condiviso) `EXTRA_CA_FILE`: le CA si aggiungono a quelle
   pubbliche per **tutte** le chiamate HTTPS dell'API (vale ancora il vecchio `OIDC_CA_FILE`);
   per un proxy in uscita `OUTBOUND_HTTPS_PROXY` (vale ancora `OIDC_HTTPS_PROXY`).
6. **Personalizzazioni**: elenco di eccezioni (`allowlist.yml`) e regole delle categorie
   particolari (`special_categories.yml`), da validare con il DPO.
7. **Primo avvio, in ordine**: `openbao`, `postgres`, `postgres-keys` → inizializzazione di OpenBao
   con i custodi (quote cifrate con PGP consigliate) → resto dello stack. **Langfuse**, due scelte:
   - *sulla VM*: profilo Compose `langfuse` e `CADDY_LANGFUSE_SITE=on` (Caddy pubblica
     l'interfaccia su `LANGFUSE_DOMAIN`);
   - *condiviso o esterno*: progetto dedicato «Pseudomania» con chiavi proprie (`LANGFUSE_HOST`,
     `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`), senza profilo `langfuse` e con
     `CADDY_LANGFUSE_SITE=off` (non servono `LANGFUSE_DOMAIN` né i certificati Langfuse); se l'host
     va raggiunto senza proxy, indicarlo in `OUTBOUND_NO_PROXY`; se ha un certificato di CA interna,
     `EXTRA_CA_FILE`. Il job di Pseudomania cancella le tracce del solo progetto dedicato (30 giorni
     nel pilota, poi 7).
8. **Pacchetto dell'estensione**: chiave di firma dell'ente, ID stabile, `.crx` e `update.xml`
   pubblicati da Caddy sotto `/extension/` (§3.7).
9. **Controlli**: `curl https://pseudogate.ente.local/v1/health` deve rispondere
   `"status":"ok"`, `"detector":"ok"`, `"keys":"ok"`; `python -m pseudogate registri verifica`.
10. **Backup**: due backup separati (DB applicativo e key store) con chiavi diverse; pianificazione;
    prova di ripristino con **riapplicazione del registro delle cancellazioni**.
11. **Verifica del pilota** (`docs/verifica-pilota.md`) prima di abilitare gli utenti.

Permessi di rete dell'estensione: il server ammette via CORS l'origine dell'estensione
(`CORS_ALLOW_ORIGIN_REGEX`, da restringere all'ID dell'ente); si consiglia **inoltre** di aggiungere
l'host del server e dell'identity provider a `host_permissions` del manifest prima di impacchettare
(`extension/README.md` §2.2, `docs/configurazione.md` §C.4).

## 3.5 Chiave di custodia e custodi

Procedura completa e modelli di verbale: `docs/custodi.md` e Allegato C di
`governance/policy-uso-ia.md`. Strumento: `tools/custodi/custodi.py` (offline).

**Postazione offline**: portatile dedicato senza rete, Python ≥ 3.10 e il pacchetto
`cryptography` installato da file scaricati in precedenza. Annotare nel verbale il commit da cui
proviene lo strumento.

| Operazione | Comando dello strumento | Chi | Quando |
|---|---|---|---|
| Generazione della chiave (RSA-OAEP-4096) e delle quote (predefinito 3, soglia 2), anche già cifrate per ciascun custode (`--cifra`) | `genera-chiave --out cerimonia/ --quote 3 --soglia 2` | 3 custodi, testimone, DPO | una volta, prima del primo avvio |
| Verifica che due quote ricompongano la chiave e corrispondano alla pubblica | `verifica --quota … --quota … --pubblica escrow_public.pem` | 2 custodi | almeno una volta l'anno e a ogni cambio di custode |
| Ridistribuzione delle quote (stessa chiave) | `ridistribuisci` | 2 custodi | uscita di un custode, cambio di soglia |
| Recupero di un progetto dopo cambio PC | `ricifra --escrow … --dispositivo <codice>` | 2 custodi + amministratore | su richiesta motivata approvata |
| Valori di segnaposto richiesti dall'autorità giudiziaria | `decifra-voci --escrow … --voci … --tag …` | 2 custodi + amministratore | su richiesta scritta dell'autorità |
| Verbale | `verbale --tipo generazione\|ridistribuzione\|recupero\|giudiziaria\|cancellazione` | custodi | a ogni operazione |

Regole essenziali: la chiave privata non viene mai scritta su disco; nessuna quota e nessuna chiave
privata arriva sulla VM; nessun amministratore tiene due quote; le quote non si fotografano né si
inviano per email; i file scambiati con il server viaggiano su una chiavetta dedicata, cancellata
a fine operazione. Se una quota è stata esposta insieme a un'altra, la chiave va **sostituita**
(nuova chiave + rotazione forzata di tutte le chiavi utente).

Le quote di sblocco di **OpenBao** (predefinito 5, soglia 3) sono **distinte** da quelle della
chiave di custodia, anche se affidate alle stesse persone.

## 3.6 Configurazione di Claude Team

Decisioni vincolanti (DECISIONI.md, DPIA §2.1). Chi agisce: un **Owner** dell'organizzazione Claude
Team. Percorsi ed etichette dettagliati, con le fonti, in `docs/configurazione.md` §A. **Le etichette
dei menu non sono state verificate sulla console reale [DA VERIFICARE]**, salvo dove indicato.

| # | Impostazione | Valore | Perché |
|---|---|---|---|
| 1 | Dominio verificato, **SSO** e «Require SSO» | attivi | si entra solo con l'account dell'ente e con l'accesso condizionato (§3.8) |
| 2 | **Memoria** di Claude (e riferimento alle chat passate) | **spenta** | riporterebbe segnaposto di altre conversazioni e contenuti fuori dal dizionario (rischio mitigato spegnendola) |
| 3 | **Ricerca web** | **attiva**, con misure | utile al lavoro; misure: verifica del sub-fornitore di ricerca, informativa, divieto di dati personali nelle richieste, misura nel pilota delle query con dati sfuggiti |
| 4 | **Connettori** e richieste di connettori dei membri | **spenti** | i contenuti dei connettori non passano dall'estensione |
| 5 | **Claude in Chrome** | **spento** (e bloccato anche con policy di Chrome) | agirebbe nel browser fuori dal controllo dell'estensione |
| 6 | **Voce** (modalità vocale, dettatura) | spenta se la console lo consente; in ogni caso microfono bloccato da estensione e policy di Chrome | la voce non passa dall'estensione |
| 7 | **Condivisione dei progetti**, progetti pubblici, link pubblici a chat e artifact | **spenti** | ogni dizionario appartiene a un solo utente: un collega vedrebbe solo segnaposto, un link pubblico li esporrebbe fuori |
| 8 | **Valutazioni / feedback** («Rate chats», in *Organization settings › Data and Privacy*, verificato su fonte Anthropic) | **spenti** | i feedback possono essere conservati fino a 5 anni e usati per l'addestramento |
| 9 | Esportazione dei propri dati da parte dei membri | **spenta** | evita copie fuori controllo |
| 10 | **Primary Owner** | solo su un **account di servizio** (es. `claude-owner@ente.it`) con **password a un custode e secondo fattore a un altro** | l'esportazione dei dati dell'organizzazione (*Data and privacy › Export Data*) è riservata al Primary Owner e comprende le conversazioni di tutti i membri: si usa solo su richiesta dell'autorità giudiziaria, con due custodi e verbale |
| 11 | Cowork, Claude Code, app desktop | spenti se la console lo consente | non coperti dall'estensione |

Procedura per l'account Primary Owner: creare l'account di servizio nell'IdP con MFA obbligatoria;
dividere password e secondo fattore tra due custodi; trasferire il ruolo **[DA VERIFICARE: procedura
di trasferimento]**; gli amministratori operativi restano Owner/Admin con i propri account; verificare
una volta l'anno che i due custodi riescano ad accedere, senza esportare.

## 3.7 Policy di Chrome

Dettagli ed esempi (GPO/registro, Intune, Console di amministrazione Google, Linux/macOS):
`docs/configurazione.md` §C ed `extension/README.md` §2.

1. **ID stabile dell'estensione**: l'ente genera la propria chiave di firma (RSA 2048, custodita
   come un segreto: serve per ogni aggiornamento), la scrive nel manifest con
   `node scripts/extension-id.js <chiave.pem> --scrivi` e impacchetta il `.crx`.
2. **Installazione forzata**: `ExtensionInstallForcelist` =
   `ID_ESTENSIONE;https://pseudogate.ente.local/extension/update.xml` (oppure `ExtensionSettings`
   con `installation_mode: force_installed`, non entrambi).
3. **Configurazione gestita** (`3rdparty` → `extensions` → `ID_ESTENSIONE`):

   | Chiave | Valore nel pilota |
   |---|---|
   | `mode` | `"ente"` |
   | `serverUrl` | `"https://pseudogate.ente.local"` (senza `/v1`) |
   | `oidcIssuer` | issuer dell'IdP |
   | `oidcClientId` | client pubblico dell'estensione (es. `pseudogate-extension`) |
   | `oidcScopes` | `"openid profile"` (Entra ID: vedi `docs/configurazione.md` §B.1.b) |
   | `oidcTokenType` | assente (= `access_token`) oppure `"id_token"` |
   | `failClosed` | `true` |
   | `allowDisable` | `false` |
   | `sites` | `["claude.ai"]` |
   | `imagePolicy` | assente o `"block"` (immagini bloccate) |

   `failClosed` e `allowDisable` si leggono **solo** dalla policy: il server non può indebolirli.

   **Immagini** (`imagePolicy`). Il testo contenuto nelle immagini (screenshot, foto) **non**
   viene pseudonimizzato. Valori:

   | Valore | Effetto |
   |---|---|
   | `"block"` (predefinito) | le immagini non vengono inviate (banner rosso) |
   | `"confirm"` | prima dell'invio l'utente vede l'anteprima e conferma ogni immagine; il nome del file diventa generico (es. `immagine-20261105183000.png`) |
   | `"ocr"` | oscuramento automatico con OCR: **non ancora disponibile**, vale come `"block"` |

   L'utente vede il valore nelle impostazioni dell'estensione, in sola lettura («… (impostato
   dall'ente)»). Se l'ente sceglie `"confirm"`, deve prevederlo nella **DPIA** e aggiungere al
   **regolamento d'uso** la regola «non inviare immagini con dati personali».
4. **Policy di contorno**:

   | Policy | Valore | Scopo |
   |---|---|---|
   | `IncognitoModeAvailability` | `1` | le estensioni non girano in incognito |
   | `BrowserGuestModeEnabled` | `false` | né in modalità ospite |
   | `BrowserAddPersonEnabled` | `false` | niente nuovi profili |
   | `DeveloperToolsAvailability` | `2` | impedisce di manomettere l'estensione |
   | `AudioCaptureAllowed` | `false` (o `AudioCaptureAllowedUrls` senza claude.ai) | microfono |
   | `ExtensionSettings` | blocco dell'estensione «Claude» (Claude in Chrome) e, se si vuole, delle altre estensioni su claude.ai | |
   | `CloudAPAuthEnabled` | `1` | solo con l'accesso condizionato di Entra ID |

5. **Verifica su un PC**: `chrome://policy` → **Ricarica criteri** (stato *OK*);
   `chrome://extensions` → Pseudomania «Installata dall'amministratore».

**Attenzione**: senza la policy l'estensione parte in Personal edition. La policy va applicata a
**tutti** i profili Chrome dei PC interessati.

## 3.8 SSO e accesso condizionato

Due integrazioni distinte (`docs/configurazione.md` §B):

1. **Estensione → server Pseudomania**: client OIDC **pubblico**, *authorization code* con **PKCE
   S256**, redirect URI `https://ID_ESTENSIONE.chromiumapp.org/oidc`, refresh token abilitato. Sul
   server `OIDC_ISSUER` (claim `iss` esatto) e `OIDC_AUDIENCE` (claim `aud` atteso). Con Keycloak
   serve un mapper *Audience* nell'access token; con Entra ID si usa l'`id_token` oppure un'API
   esposta. L'identità non viene salvata: il server conserva solo uno pseudonimo HMAC.
2. **Utenti → Claude Team**: SSO SAML (o OIDC) tramite la procedura di Anthropic, assegnato al solo
   gruppo del pilota, con **accesso condizionato**: solo da dispositivi gestiti e/o dalla rete
   interna (Entra: *Conditional Access* con dispositivo conforme; Keycloak: limitazione di rete o
   certificato del dispositivo). Così l'estensione non si aggira usando un PC personale.

Per l'utente il login all'estensione avviene dal pulsante **Accedi** nella finestra che si apre
cliccando il pulsante di Pseudomania (normalmente in modo silenzioso). Nella Server edition il
pulsante è **bloccato su acceso**: la stessa finestra spiega «Protezione sempre attiva: Pseudomania è
gestito dalla tua organizzazione e non può essere disattivato.» e la scorciatoia Alt+Maiusc+P non ha
effetto. I token restano nella memoria della sessione del browser.

## 3.9 Proxy

Obiettivo: claude.ai raggiungibile **solo** da Chrome gestito (`docs/configurazione.md` §F).

- consentire `claude.ai`, i domini collegati (elenco di partenza da confermare con i log del proxy
  nella prima settimana **[DA VERIFICARE]**) e l'IdP;
- consentire claude.ai solo al gruppo autenticato del pilota e, se possibile, solo al Chrome gestito
  (User-Agent, PAC distribuito solo a Chrome verso una porta dedicata, certificato del dispositivo):
  nessuna opzione è perfetta da sola;
- non ispezionare il traffico verso il server Pseudomania e non registrare i corpi delle richieste
  verso claude.ai;
- valutare le **restrizioni per tenant** di Anthropic (intestazione inserita dal proxy che ammette
  solo l'organizzazione dell'ente) **[DA VERIFICARE: disponibilità sul piano Team]**;
- la VM di Pseudomania **non** deve raggiungere claude.ai: in uscita solo verso l'IdP (ed
  eventualmente un Langfuse condiviso).

## 3.10 MDM e blocco delle app

L'estensione protegge **solo** Chrome. Vanno quindi bloccate:

- **Claude Desktop** sui PC (AppLocker o App Control for Business via GPO/Intune; su macOS
  restrizioni dell'MDM) **[DA VERIFICARE: percorsi e identificativi dell'app]**;
- **app Claude** sui telefoni aziendali Android (pacchetto `com.anthropic.claude`, non approvato o
  bloccato in Google Play gestito / Intune / API Android Management);
- sui dispositivi personali (BYOD) l'ente non può bloccare app: la protezione viene dall'**accesso
  condizionato** dell'SSO, che rifiuta i dispositivi non gestiti.

## 3.11 Durate di conservazione

Fonte vincolante: DECISIONI.md; motivazioni e fonti normative nel capitolo 5 (§5.4) e nella DPIA §2.5.
Valori regolabili nel `.env` del server (`docs/installazione-ente.md` §18).

| Dato | Durata |
|---|---|
| Dizionario delle chat | 30 giorni dall'ultimo uso; nessun recupero dopo cambio PC |
| Dizionario dei progetti | durata del progetto + 30 giorni dall'ultimo uso; scade senza **conferma annuale** dell'utente nel pannello; recupero tramite custodi solo su richiesta motivata |
| Chat nuove non ancora salvate (scope `pending:`) | 24 ore |
| Voci non caricate dall'estensione | 10 minuti (poi non ripristinabili) |
| Registro azioni (`audit_events`) | 90 giorni in forma pseudonima, poi solo aggregati anonimi (conteggi per giorno/ufficio senza utente) |
| Tracce Langfuse | 30 giorni durante il pilota, poi 7 (job di Pseudomania) |
| Backup del database applicativo | rotazione ≤ 35 giorni (7 giornalieri + 4 settimanali), una copia offline |
| Key store e suoi backup | backup separati, rotazione 14 giorni |
| Copie di custodia delle chiavi utente (escrow) | stessa vita della chiave: rotazione automatica ogni 90 giorni, distrutte con la chiave |
| Registri tecnici degli accessi di amministratori e custodi, registro delle cancellazioni | 24 mesi, in sola aggiunta, con catena di hash |
| Verbali dei custodi e richieste dell'autorità | protocollati, secondo il massimario dell'ente |
| Blocco per autorità giudiziaria | sospende la cancellazione **solo** dei dati indicati, fino a revoca, registrato |
| Conversazioni su claude.ai (piano Team) | a tempo indeterminato salvo cancellazione **[DA VERIFICARE: tempi di rimozione dal back-end]** |

Dopo **ogni ripristino** da backup il registro delle cancellazioni va **riapplicato** prima di
rimettere in servizio il sistema (`scripts/riapplica-cancellazioni.sh`).
