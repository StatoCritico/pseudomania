# Pseudomania – estensione Chrome

Sito: **https://pseudomania.statocritico.it**

Estensione Chrome (Manifest V3) che, su **claude.ai**, pseudonimizza automaticamente tutto ciò che
l'utente invia (messaggi, modifiche, allegati, conoscenze e istruzioni di progetto) e ripristina i
valori reali nelle risposte, direttamente nella pagina. Due edizioni con lo stesso codice:

| | **Server edition** | **Personal edition** |
|---|---|---|
| Attivazione | policy di Chrome (`mode: "ente"`) | nessuna policy |
| Rilevamento | server Pseudomania dell'ente (Rizzo-PII sulla VM) | app desktop di **Rizzo-PII** sul PC (`http://127.0.0.1:5005`) |
| Dizionario | sul server, **cifrato nel browser** (chiave utente automatica con copia di custodia) | nel browser (IndexedDB), cifrato con chiave locale |
| Registro | server (+ Langfuse) | locale, cifrato, senza testi |
| Disattivabile | no (pulsante bloccato su acceso) | sì, **per conversazione**: clic sul pulsante o Alt+Maiusc+P |
| Server | sì | **nessuno** (niente Docker) |

Contratto con il server: [`../SPEC.md`](../SPEC.md) e [`../DECISIONI.md`](../DECISIONI.md) (prevale).

Licenza: AGPL-3.0-or-later. Deriva in parte da *Privacy Guardrail* del DFKI (Apache-2.0): vedi
[`NOTICE`](NOTICE) e [`LICENSE-APACHE-2.0`](LICENSE-APACHE-2.0).

## Indice

1. [Installazione per sviluppo (nessuna build)](#1-installazione-per-sviluppo-nessuna-build)
2. [Server edition: distribuzione con policy](#2-server-edition-distribuzione-con-policy)
3. [Personal edition](#3-personal-edition)
4. [Come funziona](#4-come-funziona)
5. [Test](#5-test)
6. [Aggiornare i selettori di claude.ai](#6-aggiornare-i-selettori-di-claudeai)
7. [Limitazioni note](#7-limitazioni-note)

## 1. Installazione per sviluppo (nessuna build)

Il codice è JavaScript puro, **senza passaggi di build**. Si carica direttamente la cartella
`extension/` (quella che contiene `manifest.json`); non esiste una cartella `dist`.

1. Chrome → `chrome://extensions` → attivare **Modalità sviluppatore**.
2. **Carica estensione non pacchettizzata** → selezionare la cartella `extension/`.
3. Personal edition (predefinita senza policy): avviare Rizzo-PII desktop oppure quello finto
   ```bash
   cd extension
   npm run mock-rizzo         # http://127.0.0.1:5005, rilevatore a regex, NON usare con dati reali
   ```
4. Server edition senza policy (solo installazioni decompresse): server di prova e configurazione
   gestita simulata
   ```bash
   npm run mock-server        # http://127.0.0.1:8787, token "dev-token"
   ```
   poi, dalla console del service worker dell'estensione:
   ```js
   chrome.storage.local.set({ pgDevManaged: { mode: 'ente', serverUrl: 'http://127.0.0.1:8787', devStaticToken: 'dev-token' } })
   ```
   (`pgDevManaged` e `devStaticToken` sono ignorati nelle installazioni gestite o dal Web Store.)

Requisiti: Chrome/Chromium ≥ 116 (pannello laterale), Node ≥ 20 solo per test e server di prova.

## 2. Server edition: distribuzione con policy

Nella Server edition l'estensione è installata forzatamente, la configurazione arriva da
`chrome.storage.managed` (schema in [`schema.json`](schema.json)) e **non può essere disattivata**
dall'utente. I valori gestiti prevalgono sempre su quelli del server e su quelli locali.

| Chiave | Tipo | Predefinito (ente) | Note |
|---|---|---|---|
| `mode` | stringa | — | `"ente"` = Server edition (se assente: Personal edition) |
| `serverUrl` | stringa | — | es. `https://pseudogate.ente.local` (senza `/v1`) |
| `oidcIssuer` | stringa | — | deve esporre `/.well-known/openid-configuration` |
| `oidcClientId` | stringa | — | client **pubblico** con PKCE |
| `oidcScopes` | stringa | `openid profile` | |
| `oidcTokenType` | stringa | `access_token` | `id_token` se `OIDC_AUDIENCE` del server è il client id (estensione della SPEC) |
| `failClosed` | booleano | `true` | blocca l'invio se il server non risponde |
| `allowDisable` | booleano | `false` | |
| `sites` | lista | `["claude.ai"]` | |

Nella Server edition `failClosed` e `allowDisable` si leggono **solo** dalla policy (predefiniti `true` /
`false`): i valori restituiti da `/v1/config` non possono indebolirli. Da `/v1/config` (che richiede
autenticazione) l'estensione prende `tagInstruction`, `allowlist` e `maxFileMB`; se il server non è
raggiungibile usa una copia locale dell'istruzione identica alla SPEC. Da `/v1/config` arrivano anche
la chiave pubblica di custodia e i parametri della rotazione (§2.7).

### 2.1 Chiave, ID dell'estensione e pacchetto

L'ID di un'estensione Chrome deriva dalla sua **chiave pubblica**. `manifest.json` contiene il campo
`key` (chiave pubblica, codificata in base64), così l'ID resta lo stesso anche nelle installazioni
decompresse di sviluppo e di prova: redirect URI OIDC e CORS del server non cambiano da un PC all'altro.

- Chiave del repository (sviluppo/pilota): ID **`mbibgkkkoffbbpgbhelbmdgpjdebjlfd`**. La chiave
  privata corrispondente **non è nel repository** (è custodita a parte dal gruppo di sviluppo).
- Ogni ente che distribuisce l'estensione dovrebbe generare **la propria** coppia di chiavi e
  custodire la chiave privata come un segreto (serve per firmare ogni aggiornamento: se si perde,
  l'ID cambia e vanno aggiornati policy, IdP e CORS).

Generazione della chiave dell'ente e calcolo dell'ID:

```bash
# 1. chiave privata RSA 2048 (fuori dal repository, permessi ristretti)
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out /percorso/sicuro/pseudogate-ente.pem
chmod 600 /percorso/sicuro/pseudogate-ente.pem

# 2. scrive la chiave pubblica nel campo "key" di manifest.json e stampa ID, redirect URI e regex CORS
node scripts/extension-id.js /percorso/sicuro/pseudogate-ente.pem --scrivi
#   ID estensione:  <32 lettere a-p>
#   Redirect OIDC:  https://<ID>.chromiumapp.org/oidc
#   CORS server:    CORS_ALLOW_ORIGIN_REGEX=^chrome-extension://<ID>

# 3. pacchetto firmato con la stessa chiave
chrome --pack-extension=/percorso/pseudogate/extension --pack-extension-key=/percorso/sicuro/pseudogate-ente.pem
```

L'ID è calcolato così: SHA-256 della chiave pubblica in formato DER (SubjectPublicKeyInfo), primi 32
caratteri esadecimali, con le cifre `0`–`f` trascritte nelle lettere `a`–`p`. `node
scripts/extension-id.js` senza argomenti ricalcola l'ID dal campo `key` del manifest.

Per l'installazione forzata fuori dal Chrome Web Store servono il `.crx` e un file di aggiornamento,
pubblicati dal Caddy del server sotto `/extension/` (cartella `deploy/estensione/`, vedi
`docs/installazione-ente.md` §9 c). `update.xml` (es. `https://pseudogate.ente.local/extension/update.xml`):

```xml
<?xml version='1.0' encoding='UTF-8'?>
<gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>
  <app appid='ID_ESTENSIONE'>
    <updatecheck codebase='https://pseudogate.ente.local/extension/pseudogate-0.1.0.crx' version='0.1.0' />
  </app>
</gupdate>
```

### 2.2 Permessi verso il server (`pseudogate.ente.local`) e l'identity provider: CORS e host_permissions

Il manifest concede in modo permanente solo `claude.ai` e `localhost`/`127.0.0.1` (modalità
personale). Il service worker dell'estensione chiama il server dell'ente con origine
`chrome-extension://ID_ESTENSIONE`; Chrome accetta la risposta se vale **almeno una** delle due
condizioni seguenti. Si consiglia di configurarle **entrambe**, in modo coerente:

**a) CORS sul server Pseudomania** – variabile `CORS_ALLOW_ORIGIN_REGEX` in `deploy/.env`
(vedi `deploy/.env.example`; letta da `server/pseudogate/settings.py`, applicata da `CORSMiddleware`
con metodi `GET, POST, PUT, DELETE, OPTIONS` e intestazioni `Authorization, Content-Type`: sono quelli
usati dall'estensione, compreso `PUT /v1/dictionary/rekey` per la rotazione delle chiavi (con un server
precedente che non ammette `PUT` la rotazione funziona solo con l'opzione b). I metodi sono quelli usati
dall'estensione). È un'espressione regolare confrontata con l'**intera** origine. Il valore predefinito
`^chrome-extension://[a-p]{32}` accetta qualunque estensione: in produzione restringerlo all'ID
dell'estensione distribuita (senza il carattere `$`, che Compose interpreterebbe come variabile):

```env
CORS_ALLOW_ORIGIN_REGEX=^chrome-extension://abcdefghijklmnopabcdefghijklmnop
```

Se Caddy (o un altro proxy) è davanti all'API, non deve rimuovere né duplicare le intestazioni
`Access-Control-*` e deve inoltrare le richieste `OPTIONS` all'API.

**b) host_permissions nell'estensione** – prima di impacchettare il `.crx` per l'ente, aggiungere
l'host del server (e dell'IdP) a `host_permissions` in `manifest.json`; per le estensioni installate
forzatamente da policy Chrome concede questi permessi senza chiedere nulla all'utente:

```json
"host_permissions": [
  "https://claude.ai/*",
  "http://127.0.0.1/*",
  "http://localhost/*",
  "https://pseudogate.ente.local/*",
  "https://idp.ente.local/*"
]
```

Con b) le richieste del service worker verso quegli host non sono soggette a CORS, qualunque sia il
metodo (`PUT` e `DELETE` compresi); a) resta utile come difesa (il server
risponde solo all'estensione dell'ente) e serve se si sceglie di non modificare il manifest.
`serverUrl` nella policy deve usare **esattamente** lo stesso host (`https://pseudogate.ente.local`) e
un certificato considerato attendibile dai PC dell'ente (CA interna distribuita via GPO).

**Identity provider**: l'endpoint dei token (`token_endpoint`) e il documento
`/.well-known/openid-configuration` vengono chiamati dal service worker: aggiungere l'host dell'IdP a
`host_permissions` (come sopra) oppure abilitare CORS per `chrome-extension://ID_ESTENSIONE` sul client
OIDC (Keycloak: campo «Web origins» del client).

La Personal edition non usa server: chiama solo Rizzo-PII su `127.0.0.1`/`localhost`, già coperti
dai permessi del manifest.

### 2.3 Identity provider (OIDC)

- Client pubblico, flusso *authorization code* con PKCE (S256), nessun secret.
- Redirect URI da registrare: `https://ID_ESTENSIONE.chromiumapp.org/oidc` (con `/oidc` finale).
- **Quale token**: il server accetta qualunque JWT firmato dall'issuer (`OIDC_ISSUER`, confronto
  esatto con il claim `iss`) che abbia `aud` = `OIDC_AUDIENCE` e non sia scaduto; l'identità è il claim
  `OIDC_USER_CLAIM` (predefinito `sub`, in mancanza `preferred_username`). Due configurazioni coerenti:
  - `oidcTokenType = "access_token"` (predefinito): l'IdP deve mettere `OIDC_AUDIENCE` nell'`aud`
    dell'access token. **Keycloak**: nel client `pseudogate-extension` aggiungere un mapper
    *Audience* («Included Client Audience» o «Included Custom Audience» = `pseudogate`, «Add to access
    token» attivo), altrimenti `aud` vale `account` e il server risponde 401. **Entra ID**: esporre
    un'API (es. `api://pseudogate`) e richiederne lo scope in `oidcScopes`
    (es. `openid profile api://pseudogate/access`), con `OIDC_AUDIENCE` uguale all'`aud` emesso.
  - `oidcTokenType = "id_token"`: l'`aud` dell'ID token è il client id, quindi
    `OIDC_AUDIENCE` = `oidcClientId` (es. `pseudogate-extension`). Più semplice, utile con Entra ID se
    non si vuole esporre un'API.
- Abilitare il refresh token. I token restano in `chrome.storage.session` (memoria, cancellati alla
  chiusura del browser); il login usa `chrome.identity.launchWebAuthFlow`, prima silenzioso
  (`prompt=none`) e poi interattivo.

### 2.4 Windows: registro / GPO

File `.reg` equivalente a quanto si imposta con i modelli ADMX di Chrome:

```reg
Windows Registry Editor Version 5.00

[HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Google\Chrome\ExtensionInstallForcelist]
"1"="ID_ESTENSIONE;https://pseudogate.ente.local/extension/update.xml"

[HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Google\Chrome\3rdparty\extensions\ID_ESTENSIONE\policy]
"mode"="ente"
"serverUrl"="https://pseudogate.ente.local"
"oidcIssuer"="https://idp.ente.local/realms/ente"
"oidcClientId"="pseudogate-extension"
"oidcScopes"="openid profile"
"failClosed"=dword:00000001
"allowDisable"=dword:00000000

[HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Google\Chrome\3rdparty\extensions\ID_ESTENSIONE\policy\sites]
"1"="claude.ai"
```

Stessa configurazione come JSON di policy (Linux: `/etc/opt/chrome/policies/managed/pseudogate.json`;
utile anche come riferimento per strumenti che generano GPO):

```json
{
  "ExtensionInstallForcelist": [
    "ID_ESTENSIONE;https://pseudogate.ente.local/extension/update.xml"
  ],
  "3rdparty": {
    "extensions": {
      "ID_ESTENSIONE": {
        "mode": "ente",
        "serverUrl": "https://pseudogate.ente.local",
        "oidcIssuer": "https://idp.ente.local/realms/ente",
        "oidcClientId": "pseudogate-extension",
        "oidcScopes": "openid profile",
        "failClosed": true,
        "allowDisable": false,
        "sites": ["claude.ai"]
      }
    }
  }
}
```

### 2.5 Console di amministrazione Google

*Dispositivi → Chrome → App ed estensioni → Utenti e browser* → **+** → *Aggiungi app o estensione
Chrome tramite ID* (o *Aggiungi da URL personalizzato* con `update.xml`) → criterio di installazione
**Installazione forzata**. Nel campo **Criteri per le estensioni** incollare:

```json
{
  "mode": { "Value": "ente" },
  "serverUrl": { "Value": "https://pseudogate.ente.local" },
  "oidcIssuer": { "Value": "https://idp.ente.local/realms/ente" },
  "oidcClientId": { "Value": "pseudogate-extension" },
  "oidcScopes": { "Value": "openid profile" },
  "failClosed": { "Value": true },
  "allowDisable": { "Value": false },
  "sites": { "Value": ["claude.ai"] }
}
```

### 2.6 Policy di Chrome consigliate a corredo

- `AudioCaptureAllowed`: `false` (o `AudioCaptureAllowedUrls` senza claude.ai): il microfono è già
  bloccato dall'estensione, la policy lo rende inaggirabile.
- `IncognitoModeAvailability`: `1` (le estensioni non girano in incognito per impostazione predefinita).
- `DeveloperToolsAvailability`: `2` (impedisce di manomettere l'estensione dalla console).
- `ExtensionInstallBlocklist` / `ExtensionSettings`: limitare le altre estensioni su claude.ai.
- Bloccare a livello di rete/endpoint le app desktop e mobile di Claude (l'estensione protegge solo Chrome).

### 2.7 Cifratura lato client del dizionario

Contratto in `DECISIONI.md` («Progetto crittografico»). Nessuna azione è richiesta all'utente.

- **Chiave utente K_u** (AES-GCM 256) generata dall'estensione al primo avvio. La copia grezza viene
  cifrata con la **chiave pubblica di custodia** (`escrowPublicKey`, RSA-OAEP-4096 SHA-256, da
  `/v1/config`) e inviata come escrow (`POST /v1/keys/escrow`); solo dopo l'accettazione viene
  importata come CryptoKey **non estraibile** in IndexedDB (database `pseudomania`) e i byte grezzi
  vengono azzerati. Ogni chiave ha un `keyId` (UUID).
- **Voci**: `POST /v1/pseudonymize` restituisce `newEntries` (valori in chiaro solo per le voci nuove);
  l'estensione le cifra (AES-GCM, IV casuale, AAD `scopeType|scopeId|tag`, oppure `aadScope` dopo un
  rebind) e le carica con `POST /v1/dictionary/entries`. Il server conserva solo HMAC, ciphertext, IV
  e `keyId`.
- **Ripristino**: `GET /v1/dictionary` restituisce voci cifrate, decifrate nel browser. Le voci con un
  `keyId` sconosciuto (cambio PC) restano visibili come segnaposto **non ripristinabili**
  (evidenziati in grigio) con un avviso; per i progetti l'avviso porta alla procedura di recupero.
- **Rotazione**: automatica ogni `keyRotationDays` (90) o subito se `/v1/config` dice `rotateKey: true`:
  nuova chiave con escrow, ricifratura delle voci (`GET`/`PUT /v1/dictionary/rekey`, a lotti), poi il
  server distrugge l'escrow vecchio.
- **Recupero (solo progetti)**: nel pannello laterale, «Prepara il recupero» genera una coppia
  RSA-OAEP del dispositivo (privata non estraibile), pubblica la chiave pubblica
  (`POST /v1/keys/device`) e mostra il codice da comunicare all'assistenza. Dopo che i custodi hanno
  ricifrato la chiave vecchia (`tools/custodi/`), l'estensione la scarica (`GET /v1/keys/recovered`,
  controllo automatico ogni minuto o pulsante «Verifica chiavi recuperate»), la importa come chiave
  «legacy» non estraibile e ricifra le voci con la chiave attiva.
- **Conferma annuale dei progetti**: il pannello laterale mostra la scadenza (`confirmBy`) e il pulsante
  di conferma (`POST /v1/scopes/project/{id}/confirm`); senza conferma il dizionario del progetto scade.
- **Ripristino dei file scaricati**: `POST /v1/reidentify/file` con il campo `entries` (valori già
  decifrati dall'estensione); se il server risponde con un errore il file viene scaricato con i
  segnaposto e un avviso.

## 3. Personal edition

Per uso volontario (es. professionisti): **solo l'estensione e l'app desktop di Rizzo-PII**. Nessun
server Pseudomania, nessun Docker, nessun Langfuse.

1. Installare e avviare l'app desktop di **Rizzo-PII** (servizio locale `http://127.0.0.1:5005`).
2. Installare l'estensione (vedi §1 o pacchetto fornito). Senza policy parte già in Personal edition.
3. Facoltativo: **Impostazioni** → indirizzo di Rizzo-PII (solo indirizzi locali) → **Verifica connessione**.
4. Attivazione **per conversazione** (DECISIONI.md, aggiornamento 1/11/2026), vedi sotto.

### 3.1 Attivazione per conversazione

- **Pulsante nella barra degli strumenti** (nessun popup): un clic attiva/disattiva la protezione
  della conversazione aperta nella scheda. Stessa funzione con la **scorciatoia Alt+Maiusc+P**
  (modificabile da `chrome://extensions/shortcuts`). Clic destro sul pulsante: «Apri pannello di
  ispezione» e «Impostazioni e informazioni». Su una scheda che non è claude.ai il clic apre le impostazioni.
- **Stato per scheda**: badge **ON** verde / **OFF** rosso (icona grigia) / **?** arancione (in attesa
  di scelta) / **!** rosso (Rizzo-PII spento, in avvio o bloccato da CORS); barra verde/rossa con
  didascalia sopra la casella di scrittura, sempre riferita alla conversazione aperta.
- **Lo stato si salva per conversazione** (in un progetto: per chat; la pagina del progetto ha il
  proprio stato fino al primo invio). Una nuova chat riceve l'id definitivo dopo il primo invio: lo
  stato la segue. Il cambio di chat nella stessa scheda (senza ricaricare la pagina) è rilevato subito.
- **Nuova conversazione**: se l'ultima scelta era «attiva» si attiva da sola; se era «disattivata»
  compare il banner «Attiva» / «Continua senza protezione». **Conversazione ripresa**: era attiva → si
  riattiva da sola; era disattivata → stesso banner. Finché l'utente non sceglie, per prudenza i
  messaggi vengono comunque pseudonimizzati (barra arancione).
- **La disattivazione riguarda solo l'uscita** (messaggi e allegati inviati in chiaro). Il ripristino
  dei segnaposto in entrata, nella pagina, negli appunti e nei download, resta **sempre attivo**.
- Al **primo spegnimento** in una conversazione che contiene già dati protetti compare un avviso: ciò
  che verrà inviato andrà in chiaro e riattivare non ripulisce quanto già inviato.
- Ogni cambio di stato va nel registro locale cifrato (`extension_enabled` / `extension_disabled`
  con `details.per = "conversation"` e `trigger` = `toolbar` | `shortcut` | `banner`), senza testi.

Funzionamento:

- testo e allegati vengono analizzati da Rizzo-PII (`POST /analyze`, JSON con `include_mapping`, o
  caricamento del file); l'estensione applica l'allowlist e il filtro delle **categorie particolari**
  (artt. 9-10 GDPR) inclusi nel pacchetto (`src/shared/policy-data.js`, generato dalle regole del server
  con `python3 scripts/genera-policy.py`) e assegna **tag stabili per scope** (stesso valore → stesso tag);
- dizionario in IndexedDB: valori cifrati con una chiave AES-GCM locale **non estraibile**, indice
  valore→tag tramite HMAC con una chiave locale non estraibile; registro locale cifrato con solo azioni,
  conteggi e hash (mai testi). Durate: chat 30 giorni dall'ultimo uso, scope provvisori 24 ore, progetti
  finché l'utente non li elimina dal pannello; registro 90 giorni;
- **DOCX e XLSX** pseudonimizzati e ripristinati in JavaScript a livello di XML (stesso approccio del
  server: run spezzati, intestazioni, note, commenti, proprietà, grafici, stringhe condivise, valori in
  cache delle formule), zip con `CompressionStream`/`DecompressionStream` «deflate-raw»;
- **PDF**: il testo viene estratto da Rizzo-PII e inviato a Claude come **file di testo pseudonimizzato
  (.txt)** al posto del PDF, con un avviso all'utente (impaginazione e immagini non vengono inviate);
- se Rizzo-PII non risponde: avviso e **richiesta di conferma** prima di inviare senza protezione.

**Rizzo-PII e CORS.** Il servizio Flask di Rizzo-PII non invia intestazioni CORS. L'estensione lo
chiama dal service worker con il permesso `http://127.0.0.1/*` già presente nel manifest: in Chrome
queste chiamate non sono soggette a CORS (verificato in Chromium headless con un Rizzo-PII finto che non
invia intestazioni CORS). Se in un ambiente reale Rizzo-PII risultasse irraggiungibile per CORS (ad
esempio servito da un altro indirizzo o bloccato da una policy di Chrome), l'estensione lo riconosce
(stato «CORS»: risponde alle richieste opache ma non a quelle dell'estensione) e mostra un messaggio
chiaro: in quel caso servirà una **versione modificata (fork) di Rizzo-PII** che risponda con
`Access-Control-Allow-Origin: chrome-extension://<ID>` (non ancora realizzata).

## 4. Come funziona

```
claude.ai (pagina)                       estensione                               server Pseudomania
──────────────────                       ──────────                               ─────────────────
Invio / pulsante / Salva  ──intercetta──▶ content.js ──messaggio──▶ sw.js ──HTTPS──▶ /v1/pseudonymize
casella ◀── testo con [TIPO_N] ─────────┘ (sostituisce e poi rilancia l'invio)
fetch/XHR verso /api/…   ──page-hook.js── rete di sicurezza: ciò che non è già approvato
                                          passa dal server, altrimenti la richiesta è bloccata
risposta in streaming    ◀── restore.js (MutationObserver, dizionario da /v1/dictionary)
```

- **Strato DOM** (`src/content/content.js`): Invio, pulsante di invio, modifica e reinvio, istruzioni
  di progetto, file da selettore / trascinamento / incolla. Il testo pseudonimizzato sostituisce quello
  nella casella (verificato), poi l'invio prosegue. L'istruzione fissa (`tagInstruction`) è anteposta al
  primo messaggio di ogni conversazione e inserita in testa alle istruzioni di progetto.
- **Rete di sicurezza** (`src/content/page-hook.js`, mondo MAIN): esamina le richieste verso gli
  endpoint interni elencati in `NETWORK_RULES` (completamento, rigenerazione, progetti, caricamenti
  multipart). Testi e file non già approvati vengono pseudonimizzati; se non è possibile, la richiesta
  è bloccata. Copre anche ciò che lo strato DOM non vede (es. testo lungo incollato che claude.ai
  trasforma in allegato `extracted_content`).
- **Blocco** (`blocked=true`): banner rosso con `blockReason`, nessuna possibilità di forzare.
- **Ripristino** (`src/content/restore.js`): modifica solo il testo dei nodi esistenti, anche durante
  lo streaming e con segnaposto spezzati fra più nodi; evidenzia i valori ripristinati (verde) e i
  segnaposto sconosciuti (rosso, con evento `response_received.unknownTags`). Non tocca campi
  modificabili né l'istruzione fissa.
- **Copia**: la selezione copia già il testo ripristinato; i pulsanti «Copia» del sito (che copiano il
  markdown con i segnaposto) vengono corretti intercettando `navigator.clipboard`.
- **Download** di artifact/file generati (`<a download>`, URL `blob:`): passano da
  `/v1/reidentify/file`; se il server risponde con un errore (es. formato non supportato: il server
  restituisce un codice non 2xx, senza `blockReason`) il file viene scaricato con i segnaposto e un avviso.
- **Ispezione**: contrassegno «N dati protetti» sotto ogni messaggio inviato → pannello laterale con
  originale e testo inviato affiancati, entità, risposte con segnaposto, segnalazioni (la nota viene
  ripulita dai valori reali noti) e cancellazione dei dati dello scope. Anteprima facoltativa prima
  dell'invio con **Ctrl+Maiusc+Invio**.
- **Dettatura**: pulsanti nascosti, `getUserMedia` audio e `SpeechRecognition` rifiutati.
- **Scope**: `/chat/<uuid>` → conversazione; `/project/<uuid>` e chat di progetto → progetto; nuova
  chat → `pending:<uuid4>` con `POST /v1/scopes/rebind` quando l'URL riceve l'id. Se il server risponde
  **409** (tag in conflitto nella destinazione) la conversazione continua a usare lo scope pending
  (associazione salvata in locale), viene inviato un evento `page_unrecognized` con
  `details.reason = "scope_rebind_conflict"` e un avviso arancione informa l'utente.
- **Codice sorgente (AGPL)**: la pagina Impostazioni e informazioni (raggiungibile dal pulsante
  dell'estensione anche nella Server edition) mostra il sito di Pseudomania e il link restituito da
  `GET /v1/source`.
- **Server edition**: protezione sempre attiva; il pulsante apre un riquadro che spiega che è
  gestita dall'organizzazione (la scorciatoia mostra lo stesso avviso nella pagina).
- **Due edizioni, stessa interfaccia**: gli script di contenuto parlano solo con il service worker;
  `sw.js` inoltra al server (Server edition, con `keys.js` per la cifratura) oppure a `local.js`
  (Personal: Rizzo-PII, dizionario e registro locali, DOCX/XLSX/PDF in JavaScript).

### Struttura

```
extension/
  manifest.json  schema.json  NOTICE  LICENSE-APACHE-2.0  package.json
  src/shared/      strings.js (testi IT) config.js scope.js tags.js detector-lite.js activation.js
                   policy.js + policy-data.js (regole Personal) rizzo.js (client Rizzo-PII)
                   zip.js ooxml.js textfile.js (DOCX/XLSX/testo in JavaScript)
  src/sites/       claude.js (TUTTO ciò che è specifico di claude.ai) registry.js
  src/content/     content.js restore.js ui.js dom-input.js page-hook.js page.css
  src/background/  sw.js api.js auth.js keys.js (cifratura Server edition) local.js (Personal) idb.js
  src/sidepanel/ src/popup/ src/options/ src/ui/common.css
  icons/  scripts/make-icons.js scripts/extension-id.js scripts/genera-policy.py
  dev/mock-server/server.js   server di prova Server edition (cifratura, escrow, rotazione, recupero)
  dev/mock-rizzo/server.js    Rizzo-PII finto per la Personal edition (senza CORS, come l'originale)
  dev/fixture/claude-like.html pagina che imita claude.ai per i test
  dev/verifica-sito-reale/    script di verifica dei selettori sul sito reale (pilota)
  test/unit/ test/dom/ test/e2e/ test/fixtures/
```

## 5. Test

```bash
cd extension
npm test           # unitari (node:test): segnaposto, scope, configurazione, regole, Rizzo-PII, ZIP/DOCX/XLSX
npm run test:dom   # DOM in Chromium headless: ripristino su nodi spezzati/streaming, selettori
npm run test:e2e   # end-to-end: estensione in Chromium + pagina finta di claude.ai
                   #   smoke.test.js / crypto.test.js: Server edition con server di prova (escrow, rotazione, recupero)
                   #   personal.test.js: Personal con Rizzo-PII finto (DOCX, PDF→txt, CORS, Rizzo spento)
                   #   activation.test.js: attivazione per conversazione (banner, badge per scheda,
                   #     ripresa, OFF solo in uscita, scorciatoia) e pulsante bloccato nella Server edition
```

Servono Node ≥ 20 e Playwright con Chromium. I test DOM usano Chromium reale invece di jsdom.
L'end-to-end serve la pagina `dev/fixture/claude-like.html` all'indirizzo `https://claude.ai/*`
tramite `context.route` (nessuna connessione a claude.ai). La Server edition è provata con
`pgDevManaged` + `devStaticToken` (solo installazioni *decompresse*).

## 6. Aggiornare i selettori di claude.ai

> **Tutti i selettori e gli endpoint interni sono DA VERIFICARE sul sito reale**: sono ricostruiti
> a partire dal codice DFKI e non è stato possibile provarli su claude.ai.
>
> Per la verifica nel pilota c'è uno script Playwright guidato che controlla ogni selettore ed
> endpoint sulla pagina vera, senza inviare messaggi (salvo `--invia`):
> [`dev/verifica-sito-reale/`](dev/verifica-sito-reale/README.md).

Si trovano tutti in `src/sites/claude.js`:

- `SELECTORS`: elenchi ordinati di alternative (casella, pulsante di invio, messaggi, streaming,
  rigenera, microfono, finestra istruzioni, collegamento al progetto nell'intestazione…);
- `NETWORK_RULES`: percorsi e campi JSON degli endpoint sorvegliati dalla rete di sicurezza.

Procedura: aprire claude.ai con DevTools, verificare ogni selettore con
`document.querySelectorAll(...)`, controllare nella scheda *Rete* i percorsi e i nomi dei campi delle
richieste di invio, aggiornare il file e rieseguire i test. Se mancano gli elementi essenziali
l'estensione emette l'evento `page_unrecognized` e (in fail-closed) blocca l'invio.
Per aggiungere un sito (es. ChatGPT) si crea `src/sites/chatgpt.js` con la stessa interfaccia
(documentata in testa a `claude.js`) e lo si registra in `registry.js` e nel manifest.

## 7. Limitazioni note

- **Selettori ed endpoint non verificati** (vedi §6). Un cambiamento di claude.ai può rompere lo strato
  DOM: la rete di sicurezza e l'autoverifica riducono il rischio ma non lo annullano (un endpoint
  nuovo non elencato in `NETWORK_RULES` non viene controllato).
- **I valori ripristinati sono nel DOM della pagina**: gli script di claude.ai (e gli eventuali
  strumenti di telemetria del sito) possono leggerli. Il ripristino negli appunti è limitato ai
  segnaposto già mostrati e ai gesti dell'utente, ma avviene nella pagina.
- **Artifact** mostrati in iframe di altra origine (es. `claudeusercontent.com`) non vengono
  ripristinati; la pubblicazione/condivisione di artifact espone solo segnaposto.
- **Download**: intercettati solo `<a download>` e URL `blob:`/stessa origine; download avviati con
  navigazione del server (`Content-Disposition`), `window.open` o da iframe non lo sono. Il ripristino
  dei file dipende dai formati supportati da `/v1/reidentify/file`.
- **Rigenera**: il messaggio rinviato è già pseudonimizzato; si conta sulla rete di sicurezza se il
  corpo contiene testo nuovo.
- **Modifica di un messaggio**: la casella di modifica mostra i segnaposto (è il testo realmente inviato).
- **Memoria di Claude**: spenta per decisione dell'ente (console Team), quindi nessun riferimento tra
  conversazioni; segnaposto di altri scope risulterebbero comunque «sconosciuti». Le preferenze personali
  del profilo Claude non sono intercettate (il regolamento vieta di inserirvi dati personali).
- **Server edition, cambio PC**: senza recupero i dizionari creati sull'altro computer non sono
  ripristinabili (per le chat il recupero non è previsto); le voci non caricate entro
  `pendingEntryMinutes` (10) restano non ripristinabili.
- **Pulsante e scorciatoia nei test**: Chrome non permette di simulare il clic sul pulsante della
  barra né la scorciatoia in modo automatico; i test chiamano la stessa funzione del service worker
  (`pgToggleForTab`). La registrazione della scorciatoia (manifest `commands`) è verificata a parte.
- **Personal edition**: i PDF vengono inviati come testo (.txt) e non si ripristinano al download;
  il ripristino dei file scaricati vale per DOCX, XLSX e testo. La qualità del rilevamento dipende da
  Rizzo-PII desktop; le regole incluse sono una bozza come quelle del server. Se si cancellano i dati
  del browser (IndexedDB) il dizionario locale è perso. Il ripristino in CDATA dei file Office non è
  gestito (raro). Il funzionamento con l'app desktop reale di Rizzo-PII non è stato provato.
- **Record di ispezione** (originale/inviato) solo in `chrome.storage.session`: si perdono alla
  chiusura del browser; i contrassegni sui messaggi più vecchi non ricompaiono.
- **Immagini** e formati non gestiti vengono bloccati (`blocked=true`).
- **Solo Chrome desktop**: app desktop/mobile di Claude e altri browser non sono coperti.
- Il primo messaggio di ogni conversazione mostra l'istruzione fissa nel fumetto dell'utente.
- `chrome.sidePanel.open` dal contrassegno richiede un gesto dell'utente; se Chrome lo rifiuta, aprire
  il pannello dal pulsante dell'estensione.
