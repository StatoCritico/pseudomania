# Pseudomania Server edition – configurazione fuori dalla VM

> **Sperimentale – non verificata.** La Server edition non è ancora stata collaudata in un ambiente
> reale: per il momento **se ne sconsiglia il download e l'installazione**. Chi la scarica lo fa a
> proprio rischio, solo per prove e mai con dati reali.

Tutto ciò che va impostato **fuori** dal server di Pseudomania perché il pilota sia protetto:
console di Claude Team, identity provider, policy di Chrome, blocco delle app di Claude su PC
e telefoni, proxy aziendale. Ogni sezione è una lista numerata da spuntare.

- I percorsi dei menu sono indicati quando noti. **[DA VERIFICARE]** = percorso o nome non
  confermato su una fonte ufficiale durante la stesura (le pagine di support.claude.com non
  erano consultabili dall'ambiente di lavoro): controllare sulla pagina citata prima di agire.
- `ID_ESTENSIONE` = ID a 32 lettere (a–p) dell'estensione Pseudomania (§C.1).
- Valori di esempio: server `https://pseudogate.ente.local`, IdP Keycloak
  `https://idp.ente.local/realms/ente`, client dell'estensione `pseudogate-extension`.

## Indice

- [A. Console di amministrazione di Claude Team](#a-console-di-amministrazione-di-claude-team)
- [B. Identity provider](#b-identity-provider)
- [C. Policy di Chrome Enterprise](#c-policy-di-chrome-enterprise)
- [D. Bloccare Claude Desktop sui PC](#d-bloccare-claude-desktop-sui-pc)
- [E. Bloccare l'app Claude sui telefoni Android aziendali](#e-bloccare-lapp-claude-sui-telefoni-android-aziendali)
- [F. Proxy aziendale](#f-proxy-aziendale)
- [G. Personal edition: non imponibile](#g-personal-edition-non-imponibile)
- [Fonti](#fonti)

Ordine consigliato: B.1 (client OIDC) e C.1 (ID estensione) insieme, poi A, B.2, C, D, E, F.
Prima del go-live: [verifica-pilota.md](verifica-pilota.md).

---

## A. Console di amministrazione di Claude Team

Decisioni dell'ente (DECISIONI.md): SSO obbligatorio; nessun connettore e nessuna richiesta di
connettori; Claude in Chrome disattivato; voce disattivata se la console lo consente;
condivisione dei progetti e progetti pubblici disattivati; **memoria di Claude SPENTA**;
**ricerca web ATTIVA** (con misure); **feedback/valutazioni delle risposte disattivati**;
**Primary Owner su un account di servizio a doppia custodia**.

Riepilogo da spuntare:

| # | Impostazione | Valore | Paragrafo |
|---|---|---|---|
| 1 | Dominio verificato, SSO, Require SSO | attivi | A.1 |
| 2 | Connettori e richieste di connettori | disattivati | A.2 |
| 3 | Claude in Chrome | disattivato | A.3 |
| 4 | Voce | disattivata (se disponibile) + blocco del microfono | A.4 |
| 5 | Condivisione progetti, progetti pubblici, link pubblici | disattivati | A.5 |
| 6 | Memoria (e ricerca nelle chat passate) | **spenta** | A.6 |
| 7 | Ricerca web | **attiva** | A.7 |
| 8 | Feedback (pollice su/giù) e valutazioni | **disattivati** | A.8 |
| 9 | Primary Owner | account di servizio, credenziali divise tra due custodi | A.9 |
| 10 | Altre (tenant, IP, Cowork/Code/desktop) | vedi | A.10 |

Chi: un **Owner** (o Primary Owner) dell'organizzazione Claude Team. Dove: claude.ai →
icona del profilo → **Impostazioni / Settings** → sezioni dell'organizzazione (nella console
recente: *Organization settings* o *Admin settings*) [DA VERIFICARE: nome esatto della voce].

### A.1 Dominio e SSO obbligatorio

1. Verificare il dominio email dell'ente: *Settings → Identity and access* (o *Organization
   settings → Identity*) → **Add domain** → pubblicare il record TXT DNS indicato → **Verify**
   [DA VERIFICARE: percorso].
2. Configurare SSO: nella stessa sezione → **Set up SSO**. Si apre una procedura guidata
   (portale di configurazione) in cui scegliere SAML (consigliato) o OIDC e inserire i dati
   dell'IdP (vedi §B.2).
3. Provare l'accesso SSO con un account del pilota **prima** di renderlo obbligatorio.
4. Attivare **Require SSO** (l'accesso con email/link magico o Google viene rifiutato per gli
   account del dominio) [DA VERIFICARE: etichetta esatta e disponibilità sul piano Team].
5. Decidere il provisioning: inviti manuali per i 6 utenti del pilota, oppure provisioning JIT
   via SSO, se disponibile. SCIM potrebbe essere riservato al piano Enterprise
   [DA VERIFICARE].
6. Tenere **un account Owner di emergenza** e annotare la procedura di recupero in caso di
   guasto dell'IdP (vedi pagina Anthropic sull'SSO).

Fonte: «Set up single sign-on (SSO)» – support.claude.com/en/articles/13132885;
«Setting up SSO on Team and Enterprise plans» – support.claude.com/en/articles/9797544.

### A.2 Connettori

1. *Settings → Connectors* (organizzazione): **disattivare tutti** i connettori (Google Drive,
   Gmail, Calendar, Microsoft 365, GitHub, ecc.) e non aggiungere connettori personalizzati
   [DA VERIFICARE: percorso].
2. Disattivare la possibilità per i membri di **richiedere** o aggiungere connettori
   (impostazione tipo *Allow members to request connectors* / *Members can add custom
   connectors*) [DA VERIFICARE: etichetta].
3. Motivo: i connettori portano a Claude contenuti che **non passano** dall'estensione.

### A.3 Claude in Chrome

1. *Settings → Claude in Chrome* (o *Capabilities → Claude in Chrome*) → **disattivato per
   l'organizzazione** [DA VERIFICARE: percorso].
2. Bloccare comunque l'estensione «Claude» del Chrome Web Store con la policy
   `ExtensionSettings` (§C.5): la policy di Chrome vale anche se l'impostazione della console
   cambiasse.

Fonte: «Claude in Chrome admin controls» – support.claude.com/en/articles/13065128.

### A.4 Voce (dettatura e modalità vocale)

1. Cercare nelle impostazioni dell'organizzazione un'opzione per la voce. Le pagine di supporto
   consultate descrivono la modalità vocale come funzione dell'utente; **non è stata trovata una
   conferma di un interruttore a livello di organizzazione** [DA VERIFICARE].
2. In ogni caso il microfono su claude.ai è bloccato:
   - dall'estensione (pulsanti nascosti, `getUserMedia` audio e `SpeechRecognition` rifiutati);
   - dalla policy di Chrome `AudioCaptureAllowed=false` o, se il microfono serve ad altri siti,
     `AudioCaptureAllowedUrls` senza claude.ai (§C.6).
3. La voce sulle app mobili è esclusa bloccando l'app (§E).

Fonte: «Use voice mode» – support.claude.com/en/articles/11101966.

### A.5 Progetti: condivisione e progetti pubblici

1. Disattivare la condivisione dei progetti con l'organizzazione e la creazione di progetti
   pubblici / link pubblici, se la console lo prevede (*Settings → Capabilities* o sezione
   *Projects*) [DA VERIFICARE: disponibilità sul piano Team ed etichette].
2. Disattivare anche la **condivisione delle chat** e la pubblicazione degli **artifact** con
   link pubblico, se presenti [DA VERIFICARE].
3. Motivo: Pseudomania lega ogni dizionario a un solo utente (e lo cifra con la sua chiave). Un collega che apre un progetto
   condiviso vedrebbe solo segnaposto, e un link pubblico li espone fuori dall'ente.
4. Se un'impostazione non esiste sul piano Team, scriverlo nella policy d'uso
   (`governance/policy-uso-ia.md`) come divieto e verificarlo nel pilota.

Fonte: «Set organization preferences» – support.claude.com/en/articles/14546867.

### A.6 Memoria: SPENTA

1. *Settings → Capabilities* (o *Organization settings → Capabilities*) → **Memory** disattivata
   per l'organizzazione; disattivare anche la ricerca e il riferimento alle chat passate, se è
   un'opzione distinta [DA VERIFICARE: percorso ed etichette].
2. Motivo: la memoria riporterebbe in altre conversazioni segnaposto di scope diversi, che
   l'estensione non può ripristinare, e contenuti fuori dal controllo dei dizionari. Il rischio
   (R7 della DPIA) è **mitigato spegnendo la memoria**.
3. Le **preferenze personali** del profilo Claude (istruzioni dell'utente) **non** passano
   dall'estensione: il regolamento vieta di inserirvi dati personali. Se la console consente di
   disattivarle o limitarle, valutarlo [DA VERIFICARE].

### A.7 Ricerca web: ATTIVA, con misure

1. *Settings → Capabilities* → **Web search** attiva per l'organizzazione [DA VERIFICARE percorso].
2. Misure decise dall'ente:
   - verificare il **sub-fornitore** del servizio di ricerca usato da Anthropic e le sue
     condizioni (elenco dei sub-responsabili di Anthropic) e annotarlo nella DPIA;
   - **informativa** agli utenti: le richieste di ricerca sono formulate da Claude a partire dal
     testo già pseudonimizzato, ma possono contenere informazioni del contesto;
   - **regola d'uso**: niente dati personali nelle richieste di ricerca (policy d'uso);
   - nel **pilota**: campione periodico delle conversazioni con ricerca (nelle trace Langfuse e,
     se serve, nell'esportazione) per misurare quante query contengono dati sfuggiti alla
     pseudonimizzazione (verifica-pilota.md, prova F21).

### A.8 Feedback e valutazioni: DISATTIVATI

1. Disattivare per l'organizzazione il **feedback sulle risposte** (pollice su/giù, segnalazioni con
   commento) e ogni programma di valutazione o di condivisione dei dati per il miglioramento
   dei modelli, se la console lo consente [DA VERIFICARE: disponibilità ed etichetta sul piano
   Team].
2. Motivo: un feedback può trasmettere ad Anthropic l'intera conversazione per scopi diversi
   dall'erogazione del servizio. Se l'opzione non è disattivabile dalla console, vietarlo nella
   policy d'uso.

### A.9 Primary Owner su account di servizio a doppia custodia

1. Creare nell'IdP un account di servizio dedicato (es. `claude-owner@ente.it`) con MFA.
2. Password a un custode, secondo fattore a un altro: nessuno accede da solo.
3. Trasferire il ruolo di **Primary Owner** a questo account [DA VERIFICARE: procedura nella
   console]; gli amministratori operativi restano Owner/Admin con i propri account.
4. Uso solo per l'esportazione dei dati su richiesta dell'autorità giudiziaria e per le
   operazioni riservate al Primary Owner, con verbale. Procedura completa: [custodi.md §7](custodi.md#7-account-di-servizio-primary-owner-di-claude-team).

### A.10 Altre impostazioni da controllare

1. **Addestramento dei modelli**: sui piani commerciali (Team) i dati non sono usati per
   addestrare i modelli per impostazione predefinita; verificare che non sia stata data
   un'adesione esplicita [DA VERIFICARE nei termini commerciali vigenti].
2. **Conservazione dei dati** delle conversazioni del piano Team: annotarla nella DPIA.
3. **Restrizioni di rete per tenant** (§F.4) [DA VERIFICARE disponibilità sul piano Team].
4. **Lista di IP ammessi**, probabilmente solo Enterprise [DA VERIFICARE].
5. **Cowork / Claude Code / app desktop**: se la console permette di disattivarli, disattivarli
   (non sono coperti dall'estensione) [DA VERIFICARE].

---

## B. Identity provider

Due integrazioni distinte:

| | Per cosa | Protocollo |
|---|---|---|
| B.1 | Estensione Pseudomania → server Pseudomania | OIDC, authorization code + PKCE, client pubblico |
| B.2 | Accesso a claude.ai (Claude Team) | SAML 2.0 (o OIDC) tramite la procedura SSO di Anthropic, con accesso condizionato |

### B.1 Client OIDC per l'estensione

Requisiti comuni (da `extension/README.md`, `extension/src/background/auth.js`,
`server/pseudogate/auth.py`):

| Parametro | Valore |
|---|---|
| Tipo di client | **pubblico**, nessun secret |
| Flusso | authorization code con **PKCE S256** |
| Redirect URI | `https://ID_ESTENSIONE.chromiumapp.org/oidc` (esattamente, con `/oidc`: l'estensione usa `chrome.identity.getRedirectURL('oidc')`) |
| Refresh token | abilitato (l'estensione prova prima un login silenzioso `prompt=none`) |
| Scope | `oidcScopes` nella policy, predefinito `openid profile` |
| Token inviato al server | `oidcTokenType`: `access_token` (predefinito) oppure `id_token` |
| CORS sull'endpoint dei token | origine `chrome-extension://ID_ESTENSIONE` ammessa, oppure host dell'IdP aggiunto a `host_permissions` prima di impacchettare (README §2.2) |
| Lato server (`.env`) | `OIDC_ISSUER` = claim `iss` esatto; `OIDC_AUDIENCE` = claim `aud` atteso; `OIDC_USER_CLAIM=sub`; algoritmi `RS256,PS256,ES256` |

Regola pratica per `aud`:

- con `oidcTokenType = id_token` il claim `aud` è il **client ID** dell'estensione →
  `OIDC_AUDIENCE=<client id>`;
- con `access_token` l'`aud` dipende dall'IdP: va configurato perché contenga un valore noto
  (es. `pseudogate`) e quello va in `OIDC_AUDIENCE`.

#### B.1.a Keycloak

1. *Realm `ente` → Clients → Create client*:
   - Client type: **OpenID Connect**; Client ID: `pseudogate-extension`; **Next**.
   - Client authentication: **Off** (client pubblico); Authentication flow: solo
     **Standard flow**; **Next**.
   - Valid redirect URIs: `https://ID_ESTENSIONE.chromiumapp.org/oidc`
   - Web origins: `chrome-extension://ID_ESTENSIONE` → **Save**.
2. *Clients → pseudogate-extension → Advanced → Advanced settings*: **Proof Key for Code
   Exchange Code Challenge Method** = `S256`.
3. Audience nell'access token: *Client scopes → Create client scope* `pseudogate-audience`
   (tipo Default) → *Mappers → Configure a new mapper → Audience* → **Included Custom
   Audience** = `pseudogate`, *Add to access token* = On. Poi *Clients → pseudogate-extension →
   Client scopes → Add client scope* → `pseudogate-audience` (Default).
4. Limitare l'accesso ai soli utenti del pilota (gruppo `pilota-ia`), ad esempio con un flusso di
   autenticazione dedicato che controlla il ruolo/gruppo [DA VERIFICARE: dipende dalla versione
   di Keycloak; in alternativa il controllo resta sull'accesso a Claude Team, §B.2].
5. `.env` del server:
   ```
   OIDC_ISSUER=https://idp.ente.local/realms/ente
   OIDC_AUDIENCE=pseudogate
   OIDC_USER_CLAIM=sub
   ```
   Policy dell'estensione: `oidcIssuer=https://idp.ente.local/realms/ente`,
   `oidcClientId=pseudogate-extension`, `oidcScopes=openid profile`, `oidcTokenType` assente
   (= `access_token`).
6. Verifica: `https://idp.ente.local/realms/ente/.well-known/openid-configuration` raggiungibile
   dai PC e dalla VM.

#### B.1.b Microsoft Entra ID

Con Entra un access token richiesto con soli `openid profile` è destinato a Microsoft Graph e
non è verificabile da terzi. Due possibilità: **(1) id_token** (più semplice) o **(2) API
esposta**.

1. *Entra admin center → Identity → Applications → App registrations → New registration*:
   - Name: `Pseudomania estensione`; account: solo questa directory.
   - Redirect URI: piattaforma **Single-page application (SPA)**,
     `https://ID_ESTENSIONE.chromiumapp.org/oidc` → **Register**.
   Motivo della piattaforma SPA: l'estensione scambia il codice con una richiesta cross-origin
   (CORS) dal service worker, che Entra consente solo per i redirect URI di tipo SPA
   [DA VERIFICARE con una prova: se Entra rifiuta l'origine `chrome-extension://`, provare la
   piattaforma *Mobile and desktop applications* con *Allow public client flows* = Yes].
2. *Authentication*: lasciare disattivati implicit grant e token ID impliciti (il flusso è con
   codice + PKCE). Nota: per le app SPA Entra emette refresh token di durata limitata (24 ore),
   poi serve un nuovo login (silenzioso se la sessione Entra è attiva) [DA VERIFICARE].
3. Annotare **Application (client) ID** e **Directory (tenant) ID**.
4. **Opzione 1 – id_token:**
   ```
   # .env
   OIDC_ISSUER=https://login.microsoftonline.com/<TENANT_ID>/v2.0
   OIDC_AUDIENCE=<CLIENT_ID>
   OIDC_USER_CLAIM=sub
   ```
   Policy: `oidcIssuer=https://login.microsoftonline.com/<TENANT_ID>/v2.0`,
   `oidcClientId=<CLIENT_ID>`, `oidcScopes=openid profile offline_access`,
   `oidcTokenType=id_token`.
5. **Opzione 2 – access token per un'API dedicata:** *Expose an API* → Application ID URI
   (es. `api://pseudogate`) → **Add a scope** `access_as_user` (consenso: admin). In *Manifest*
   impostare `"requestedAccessTokenVersion": 2` (nel manifest Microsoft Graph:
   `api.requestedAccessTokenVersion`). Con token v2 il claim `aud` è il **client ID** e `iss` è
   `https://login.microsoftonline.com/<TENANT_ID>/v2.0`.
   Policy: `oidcScopes=openid profile offline_access api://pseudogate/access_as_user`,
   `oidcTokenType` assente. `.env`: `OIDC_AUDIENCE=<CLIENT_ID>` [DA VERIFICARE con un token reale
   su jwt.ms o decodificandolo localmente].
6. *Enterprise applications → Pseudomania estensione → Properties*: **Assignment required** = Yes
   e assegnare il gruppo del pilota.
7. Il claim `sub` di Entra è specifico per applicazione (pairwise): va bene, il server ne salva
   solo l'HMAC. Non cambiare client in seguito, altrimenti cambiano gli pseudonimi.
8. La VM deve raggiungere `login.microsoftonline.com` (discovery e JWKS): di norma tramite il
   proxy aziendale (`OUTBOUND_HTTPS_PROXY`, installazione-ente.md §10 e §17).

### B.2 SSO per Claude Team con accesso condizionato

Obiettivo: si accede a claude.ai con l'account dell'ente **solo** da dispositivi gestiti e/o
dalla rete interna. Così l'estensione non è aggirabile usando un PC personale o un'altra rete.

#### B.2.a Configurazione SAML (comune)

1. Avviare *Set up SSO* nella console di Claude (§A.1): la procedura mostra **ACS URL** ed
   **Entity ID / SP Entity ID** da copiare nell'IdP e chiede l'**URL dei metadati** dell'IdP (o
   il certificato e l'URL SSO).
2. NameID: indirizzo email dell'utente (formato emailAddress); attributi richiesti secondo la
   procedura (tipicamente email, nome, cognome) [DA VERIFICARE nella procedura guidata].
3. Assegnare l'app solo al gruppo del pilota.

#### B.2.b Microsoft Entra ID: Conditional Access

1. *Entra admin center → Identity → Applications → Enterprise applications → New application*
   → cercare «Claude» o «Anthropic» nella galleria; se non c'è → **Create your own
   application** → *Integrate any other application (Non-gallery)* [DA VERIFICARE presenza in
   galleria].
2. *Single sign-on → SAML*: incollare Entity ID e Reply URL (ACS) forniti da Anthropic;
   scaricare *App Federation Metadata Url* e incollarlo nella procedura di Anthropic.
3. *Users and groups*: solo il gruppo `pilota-ia`.
4. *Protection → Conditional Access → Create new policy* «Claude solo da dispositivi gestiti»:
   - Users: gruppo `pilota-ia`.
   - Target resources: l'app Claude creata al punto 1.
   - Conditions → Client apps: Browser **e** Mobile apps and desktop clients.
   - Grant: **Require device to be marked as compliant** e/o **Require Microsoft Entra hybrid
     joined device** → *Require all the selected controls*.
   - Abilitare prima in **Report-only**, controllare i *Sign-in logs*, poi **On**.
5. Seconda policy «Claude solo dalla rete interna» (se richiesto): *Conditions → Locations* →
   Include *Any location*, Exclude la *named location* con gli IP pubblici di uscita del proxy
   dell'ente → Grant: **Block access**.
6. **Chrome e verifica del dispositivo**: perché Entra riconosca il dispositivo da Chrome su
   Windows impostare la policy di Chrome `CloudAPAuthEnabled = 1` (oppure installare
   l'estensione «Microsoft Single Sign On») [DA VERIFICARE la versione minima di Chrome].
   Senza, l'accesso da Chrome gestito verrebbe bloccato dalla policy «compliant».
7. Le stesse regole si possono applicare al client OIDC dell'estensione (§B.1.b), ma non è
   indispensabile: l'estensione è installata solo su Chrome gestito.

#### B.2.c Keycloak: equivalenti

Keycloak non conosce lo stato di conformità dei dispositivi. Opzioni, da combinare:

1. **Rete:** pubblicare gli endpoint del realm verso Internet solo tramite reverse proxy e
   **non** esporre l'endpoint SAML del client Claude
   (`/realms/ente/protocol/saml` con il client di Claude) fuori dalla rete interna. Dato che il
   browser dell'utente parla direttamente con Keycloak, un accesso da fuori rete non riesce a
   completare il login.
2. **Certificato del dispositivo:** distribuire ai PC gestiti un certificato client (PKI
   dell'ente, via GPO/Intune) e usare nel flusso di autenticazione del client Claude
   l'autenticatore **X509/Validate Username Form** (mTLS tra browser e Keycloak). I dispositivi
   non gestiti non hanno il certificato. Richiede che il reverse proxy di Keycloak inoltri il
   certificato client [DA VERIFICARE configurazione del proxy].
3. **Restrizione per IP:** Keycloak non ha un autenticatore nativo per IP; esistono estensioni
   della comunità (non valutate) [DA VERIFICARE].
4. Creare il client SAML: *Clients → Import client* con i metadati SP di Anthropic, oppure
   *Create client* → *SAML*, Client ID = Entity ID di Anthropic, *Valid redirect URIs* = ACS URL,
   *Name ID format* = email; flusso di autenticazione dedicato (*Authentication → Create flow*) e
   collegato nel client (*Advanced → Authentication flow overrides*).

#### B.2.d Sessioni già aperte

Un PC gestito portato fuori rete mantiene la sessione claude.ai già aperta fino alla sua
scadenza. Il proxy (§F) non la vede fuori rete. Valutare: VPN sempre attiva sui portatili,
durata breve della sessione SSO, e che il pilota usi solo postazioni fisse.

---

## C. Policy di Chrome Enterprise

### C.1 ID stabile dell'estensione

L'ID dipende dalla **chiave pubblica** dell'estensione. `extension/manifest.json` contiene il campo
`key` con la chiave pubblica di sviluppo/pilota (ID `mbibgkkkoffbbpgbhelbmdgpjdebjlfd`; la chiave
privata non è nel repository): anche le installazioni *decompresse* hanno quindi lo stesso ID su
ogni PC.

Per la distribuzione l'ente genera **la propria** chiave e la scrive nel manifest (extension/README.md §2.1):

```bash
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out /percorso/sicuro/pseudogate-ente.pem
chmod 600 /percorso/sicuro/pseudogate-ente.pem
cd /opt/pseudogate/extension
node scripts/extension-id.js /percorso/sicuro/pseudogate-ente.pem --scrivi   # aggiorna "key", stampa ID
google-chrome --pack-extension=/opt/pseudogate/extension --pack-extension-key=/percorso/sicuro/pseudogate-ente.pem
```

Calcolo dell'ID senza Node (equivalente):

```bash
openssl pkey -in pseudogate-ente.pem -pubout -outform DER \
  | sha256sum | head -c 32 | tr '0-9a-f' 'a-p'; echo
```

Conservare la chiave privata come un segreto: serve per firmare ogni aggiornamento con lo stesso ID.

Chrome Web Store (non in elenco / unlisted, oppure pubblicazione privata per il dominio
Google Workspace): l'ID è assegnato dal Web Store al primo caricamento e resta stabile; la
chiave pubblica si legge nella dashboard sviluppatore [DA VERIFICARE percorso].

Dopo aver fissato l'ID:

1. registrare il redirect URI nell'IdP (§B.1);
2. impostare nel server `CORS_ALLOW_ORIGIN_REGEX=^chrome-extension://ID_ESTENSIONE`
   (installazione-ente.md §10) e `docker compose up -d api`.

### C.2 Pubblicare `.crx` e `update.xml`

Il file di aggiornamento (dal README dell'estensione):

```xml
<?xml version='1.0' encoding='UTF-8'?>
<gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>
  <app appid='ID_ESTENSIONE'>
    <updatecheck codebase='https://pseudogate.ente.local/extension/pseudogate-0.1.0.crx' version='0.1.0' />
  </app>
</gupdate>
```

- `version` deve coincidere con `version` del manifest; per aggiornare: nuovo `.crx` firmato con
  la stessa chiave, `version` aumentata in manifest e `update.xml`.
- Ospitarli su HTTPS con certificato attendibile dai PC: il `Caddyfile` del repository pubblica
  `https://pseudogate.ente.local/extension/` dalla cartella `deploy/estensione/` (vedi
  [installazione-ente.md §15](installazione-ente.md#15-pacchetto-dellestensione));
  in alternativa un web server intranet esistente.
- Su **Windows e macOS** Chrome installa estensioni fuori dal Web Store solo su dispositivi
  gestiti (dominio AD, Intune/MDM o Chrome Enterprise Core) [DA VERIFICARE i dettagli correnti].

### C.3 Configurazione gestita dell'estensione (`3rdparty`)

Chiavi da `extension/schema.json`:

| Chiave | Tipo | Valore nel pilota |
|---|---|---|
| `mode` | stringa | `"ente"` |
| `serverUrl` | stringa | `"https://pseudogate.ente.local"` (senza `/v1`) |
| `oidcIssuer` | stringa | issuer dell'IdP |
| `oidcClientId` | stringa | client ID del §B.1 |
| `oidcScopes` | stringa | `"openid profile"` (Entra: vedi §B.1.b) |
| `oidcTokenType` | stringa | assente (= `access_token`) oppure `"id_token"` |
| `failClosed` | booleano | `true` |
| `allowDisable` | booleano | `false` |
| `sites` | lista | `["claude.ai"]` |
| `imagePolicy` | stringa | assente o `"block"` (= immagini bloccate) |

`imagePolicy` decide cosa succede alle **immagini** (screenshot, foto). Il testo dentro le immagini
**non** viene pseudonimizzato.

- `"block"` (predefinito): le immagini non vengono inviate.
- `"confirm"`: prima dell'invio l'utente vede l'anteprima e conferma ogni immagine; il nome del
  file diventa generico (es. `immagine-20261105183000.png`); il registro annota la scelta, senza
  l'immagine. Abilitarlo va previsto nella DPIA e nel regolamento d'uso.
- `"ocr"`: oscuramento automatico, **non ancora disponibile**; per ora vale come `"block"`.

L'utente vede il valore nelle impostazioni dell'estensione, in sola lettura.

### C.4 Permessi di rete dell'estensione (CORS)

Il manifest concede in modo permanente solo `https://claude.ai/*`, `http://127.0.0.1/*`,
`http://localhost/*`. Per le chiamate al server e all'endpoint dei token dell'IdP serve
**una** delle due (README §2.2); si consiglia di configurarle **entrambe**:

1. **CORS:**
   - server Pseudomania: già attivo, regola `CORS_ALLOW_ORIGIN_REGEX` (predefinito: qualsiasi
     estensione; nel pilota restringere all'ID). Il server ammette `GET, POST, PUT, DELETE, OPTIONS` (il `PUT` serve alla rotazione delle chiavi,
     `PUT /v1/dictionary/rekey`);
   - IdP: Keycloak → *Web origins* `chrome-extension://ID_ESTENSIONE`; Entra → redirect URI di
     tipo SPA (§B.1.b).
2. **`host_permissions`:** aggiungere prima di impacchettare
   `"https://pseudogate.ente.local/*"` e `"https://idp.ente.local/*"` al manifest (modifica
   locale, cambia il pacchetto ma non l'ID se si usa la stessa chiave).

### C.5 Policy da impostare

| Policy | Valore | Scopo |
|---|---|---|
| `ExtensionInstallForcelist` | `ID_ESTENSIONE;https://pseudogate.ente.local/extension/update.xml` | installazione forzata, non disattivabile né rimovibile |
| `3rdparty` → `extensions` → `ID_ESTENSIONE` | chiavi del §C.3 | configurazione gestita |
| `IncognitoModeAvailability` | `1` (incognito disattivato) | le estensioni non girano in incognito |
| `BrowserGuestModeEnabled` | `false` | nella modalità ospite le estensioni non girano |
| `BrowserAddPersonEnabled` | `false` | niente nuovi profili [DA VERIFICARE: le policy di macchina si applicano comunque a tutti i profili] |
| `DeveloperToolsAvailability` | `2` | impedisce di manomettere l'estensione dalla console |
| `AudioCaptureAllowed` | `false` (o `AudioCaptureAllowedUrls` senza claude.ai) | microfono |
| `ExtensionSettings` | vedi sotto | bloccare altre estensioni di IA |
| `CloudAPAuthEnabled` | `1` | solo con Entra Conditional Access (§B.2.b) |

`ExtensionSettings` (facoltativo; esempio che blocca l'estensione ufficiale «Claude» e lascia
installabili le altre). L'ID dell'estensione Claude va letto dal Chrome Web Store
[DA VERIFICARE: `ID_CLAUDE_IN_CHROME`]. Per un approccio più rigoroso: `"*": {"installation_mode":
"blocked"}` più un elenco di estensioni ammesse.

```json
{
  "ID_ESTENSIONE": {
    "installation_mode": "force_installed",
    "update_url": "https://pseudogate.ente.local/extension/update.xml",
    "toolbar_pin": "force_pinned"
  },
  "ID_CLAUDE_IN_CHROME": {
    "installation_mode": "blocked",
    "blocked_install_message": "Estensione non ammessa dalla policy dell'ente sull'uso dell'IA."
  },
  "*": {
    "runtime_blocked_hosts": [],
    "blocked_permissions": []
  }
}
```

Nota: se si usa `ExtensionSettings` con `force_installed` per Pseudomania, non serve anche
`ExtensionInstallForcelist` (usarne uno solo per chiarezza). Per impedire che **altre**
estensioni leggano o modifichino claude.ai si può aggiungere sotto `"*"`:
`"runtime_blocked_hosts": ["*://claude.ai"]` — non si applica alle estensioni con voce propria,
quindi Pseudomania resta attiva [DA VERIFICARE in prova].

### C.6 Esempi di distribuzione

#### C.6.a GPO / registro di Windows

Con i modelli ADMX di Chrome: *Configurazione computer → Modelli amministrativi → Google →
Google Chrome → Estensioni → Configura l'elenco delle app e delle estensioni con installazione
forzata*. Il `3rdparty` non ha un modello ADMX: si imposta nel registro (GPO → *Preferenze →
Impostazioni di Windows → Registro di sistema*). File `.reg` equivalente:

```reg
Windows Registry Editor Version 5.00

[HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Google\Chrome]
"IncognitoModeAvailability"=dword:00000001
"BrowserGuestModeEnabled"=dword:00000000
"BrowserAddPersonEnabled"=dword:00000000
"DeveloperToolsAvailability"=dword:00000002
"AudioCaptureAllowed"=dword:00000000

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
"imagePolicy"="block"

[HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Google\Chrome\3rdparty\extensions\ID_ESTENSIONE\policy\sites]
"1"="claude.ai"
```

`ExtensionSettings` nel registro è una stringa JSON su una riga:

```reg
[HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Google\Chrome]
"ExtensionSettings"="{\"ID_CLAUDE_IN_CHROME\":{\"installation_mode\":\"blocked\"}}"
```

Verifica su un PC: `gpupdate /force`, poi in Chrome `chrome://policy` → **Ricarica criteri**:
devono comparire le policy con stato *OK*, e la sezione dell'estensione con le chiavi
`3rdparty`. In `chrome://extensions` Pseudomania deve risultare «Installata dall'amministratore».

#### C.6.b Microsoft Intune

1. *Intune admin center → Devices → Configuration → Create → New policy* → Windows 10 and later
   → **Settings catalog** → cercare «Google Chrome» (serve il pacchetto ADMX di Chrome importato
   o presente nel catalogo) → *Extensions → Configure the list of force-installed apps and
   extensions* → valore `ID_ESTENSIONE;https://pseudogate.ente.local/extension/update.xml`
   [DA VERIFICARE nomi nel catalogo].
2. Nello stesso profilo: *Incognito mode availability* = Incognito mode disabled, *Enable guest
   mode* = Disabled, *Control where Developer Tools can be used* = Disallow, ecc.
3. Configurazione `3rdparty`: il catalogo non la copre. Usare uno **script PowerShell** o una
   **Remediation** che scrive le chiavi del §C.6.a sotto
   `HKLM\SOFTWARE\Policies\Google\Chrome\3rdparty\extensions\ID_ESTENSIONE\policy`, oppure una
   policy *Custom* OMA-URI con ingestione ADMX [DA VERIFICARE]. Esempio di script:

```powershell
$base = "HKLM:\SOFTWARE\Policies\Google\Chrome\3rdparty\extensions\ID_ESTENSIONE\policy"
New-Item -Path "$base\sites" -Force | Out-Null
Set-ItemProperty -Path $base -Name mode         -Value "ente"
Set-ItemProperty -Path $base -Name serverUrl    -Value "https://pseudogate.ente.local"
Set-ItemProperty -Path $base -Name oidcIssuer   -Value "https://idp.ente.local/realms/ente"
Set-ItemProperty -Path $base -Name oidcClientId -Value "pseudogate-extension"
Set-ItemProperty -Path $base -Name oidcScopes   -Value "openid profile"
Set-ItemProperty -Path $base -Name failClosed   -Value 1 -Type DWord
Set-ItemProperty -Path $base -Name allowDisable -Value 0 -Type DWord
Set-ItemProperty -Path $base -Name imagePolicy  -Value "block"
Set-ItemProperty -Path "$base\sites" -Name "1"  -Value "claude.ai"
```

4. Assegnare il profilo al gruppo di dispositivi del pilota.

#### C.6.c Console di amministrazione Google (Chrome Enterprise Core)

1. *admin.google.com → Dispositivi → Chrome → App ed estensioni → Utenti e browser* →
   selezionare l'unità organizzativa del pilota.
2. **+** (giallo) → *Aggiungi da URL personalizzato* → ID `ID_ESTENSIONE`, URL
   `https://pseudogate.ente.local/extension/update.xml` (oppure *Aggiungi app o estensione
   Chrome tramite ID* se pubblicata sul Web Store).
3. Criterio di installazione: **Installazione forzata** (eventualmente *+ blocca nella barra*).
4. Campo **Criteri per le estensioni** (JSON, formato con `Value`):

```json
{
  "mode": { "Value": "ente" },
  "serverUrl": { "Value": "https://pseudogate.ente.local" },
  "oidcIssuer": { "Value": "https://idp.ente.local/realms/ente" },
  "oidcClientId": { "Value": "pseudogate-extension" },
  "oidcScopes": { "Value": "openid profile" },
  "failClosed": { "Value": true },
  "allowDisable": { "Value": false },
  "imagePolicy": { "Value": "block" },
  "sites": { "Value": ["claude.ai"] }
}
```

5. *Dispositivi → Chrome → Impostazioni → Utenti e browser*: Modalità di navigazione in
   incognito = *Non consentire*; Navigazione come ospite = *Non consentire*; Strumenti per
   sviluppatori = *Non consentire mai*; Accesso al microfono = blocca per claude.ai
   [DA VERIFICARE etichette in italiano].
6. Per bloccare l'estensione Claude: stessa pagina *App ed estensioni* → aggiungere l'ID e
   impostarla su **Blocca**.

#### C.6.d Linux / macOS (se presenti)

- Linux: JSON in `/etc/opt/chrome/policies/managed/pseudogate.json` (esempio completo in
  `extension/README.md` §2.4).
- macOS: profilo di configurazione (`.mobileconfig`) per il dominio `com.google.Chrome`
  distribuito via MDM; il `3rdparty` va nella chiave `3rdparty` → `extensions` →
  `ID_ESTENSIONE` [DA VERIFICARE con l'MDM in uso].

---

## D. Bloccare Claude Desktop sui PC

L'app desktop di Claude non passa dall'estensione: va bloccata sui PC del pilota (e in
generale su tutti i PC dell'ente se si vuole evitare l'uso fuori controllo).

### D.1 Windows con AppLocker (GPO)

1. Su un PC di prova scaricare l'installer di Claude Desktop e, se possibile, installarlo.
2. Ricavare editore e nome del prodotto dalla firma (è più robusto del percorso):
   ```powershell
   Get-AppLockerFileInformation -Path "$env:USERPROFILE\Downloads\Claude*Setup*.exe" | Format-List
   Get-AppLockerFileInformation -Path "$env:LOCALAPPDATA\AnthropicClaude\*\claude.exe" -ErrorAction SilentlyContinue | Format-List
   Get-AppxPackage *Claude* | Select Name, Publisher, PackageFamilyName
   ```
   Il percorso `%LOCALAPPDATA%\AnthropicClaude\` e l'eventuale pacchetto MSIX vanno confermati
   sulla versione corrente [DA VERIFICARE].
3. *Gestione Criteri di gruppo → Configurazione computer → Criteri → Impostazioni di Windows →
   Impostazioni sicurezza → Criteri di controllo dell'applicazione → AppLocker*:
   - **Regole eseguibili** → *Crea nuova regola* → **Nega** → gruppo *Everyone* →
     condizione **Autore** → selezionare il file `claude.exe` o l'installer → livello
     *Nome prodotto* (o *Autore* se si vuole bloccare ogni software Anthropic).
   - **Regole app in pacchetto** → *Nega* → stessa logica per il pacchetto MSIX di Claude, se
     presente.
   - Creare le **regole predefinite** se AppLocker non era già in uso, altrimenti si blocca tutto.
4. *Proprietà AppLocker → Applicazione*: prima **Solo controllo** (audit), verificare il
   registro eventi *Applicazioni e servizi → Microsoft → Windows → AppLocker*, poi **Applica
   regole**.
5. Servizio *Identità applicazione* (AppIDSvc) in avvio automatico.

### D.2 Windows con Intune / WDAC (App Control for Business)

1. *Intune → Endpoint security → Application control* (o *Devices → Configuration → Templates →
   Endpoint protection*) [DA VERIFICARE percorso]: creare una policy di App Control con una
   regola di **negazione** per editore/prodotto di Claude, oppure distribuire la policy AppLocker
   esportata (XML) via profilo *Custom* OMA-URI
   `./Vendor/MSFT/AppLocker/ApplicationLaunchRestrictions/...` [DA VERIFICARE].
2. In aggiunta (non sufficiente da solo): se si distribuisce software via *Company Portal*, non
   pubblicare Claude Desktop; per il Microsoft Store: policy che limita lo Store alle app
   private.
3. Verifica: avviare l'installer su un PC del pilota → deve essere bloccato con messaggio
   dell'amministratore.

### D.3 macOS (se ci sono Mac nel pilota)

- Rimuovere/impedire `Claude.app` con l'MDM: regola di blocco applicazioni per bundle ID
  `com.anthropic.claudefordesktop` [DA VERIFICARE il bundle ID con
  `mdls -name kMDItemCFBundleIdentifier /Applications/Claude.app`], ad esempio con le funzioni
  di restrizione app dell'MDM o con uno strumento come Santa (regola per Team ID dello
  sviluppatore).

### D.4 Ulteriore protezione di rete

L'app desktop usa domini di Anthropic e il motore di Chromium. La regola del proxy «claude.ai
solo da Chrome gestito» (§F) è una seconda barriera, ma basata su intestazioni falsificabili:
il blocco sul PC resta la misura principale.

---

## E. Bloccare l'app Claude sui telefoni Android aziendali

Nome del pacchetto dell'app ufficiale: **`com.anthropic.claude`** (pagina Google Play
`https://play.google.com/store/apps/details?id=com.anthropic.claude`; confermato da più
cataloghi di app, vedi Fonti).

### E.1 Principio

Con Android Enterprise (profilo di lavoro o dispositivo interamente gestito) e Google Play
gestito, nel profilo di lavoro si installano **solo le app approvate**. Basta non approvare
Claude e, dove l'MDM lo consente, bloccarla esplicitamente.

### E.2 Microsoft Intune

1. *Intune → Devices → Android → Configuration → Create → Device restrictions* (dispositivi
   interamente gestiti o profilo di lavoro aziendale) → *Applications* → **Allow access to all
   apps in Google Play store** = *Not configured* / *Block* [DA VERIFICARE etichette].
2. Non aggiungere `com.anthropic.claude` in *Apps → Android → Managed Google Play*.
3. Per bloccarla anche se già presente: *Apps → Android → + Add → Managed Google Play app* →
   approvarla e assegnarla con intento **Uninstall** al gruppo dei dispositivi [DA VERIFICARE].
4. Dispositivi interamente gestiti: valutare anche l'elenco di app vietate (*Restricted apps*
   / compliance) per segnalare il dispositivo come non conforme.

### E.3 Console Google Admin (gestione endpoint Android)

1. *admin.google.com → App → App web e per dispositivi mobili* → cercare
   `com.anthropic.claude` → **Blocca** per l'unità organizzativa [DA VERIFICARE percorso].

### E.4 Altri MDM (API Android Management)

Nella policy dell'API Android Management:

```json
{ "applications": [ { "packageName": "com.anthropic.claude", "installType": "BLOCKED" } ] }
```

### E.5 Limiti

- Sul **lato personale** di un telefono BYOD con profilo di lavoro l'ente non può bloccare app:
  la protezione viene dall'accesso condizionato (§B.2: il telefono personale non è
  conforme/gestito, quindi l'SSO a Claude Team fallisce).
- Il browser del telefono può aprire claude.ai: stessa protezione (SSO condizionato) e, sulla
  rete aziendale, il proxy (§F).
- iOS: equivalente con l'MDM (app vietate in supervisione) [DA VERIFICARE se ci sono iPhone].

---

## F. Proxy aziendale

Obiettivo: claude.ai raggiungibile **solo** da Chrome gestito (su cui Pseudomania è forzata).
Il prodotto proxy dell'ente non è noto: le indicazioni sono generiche.

### F.1 Domini da consentire

Anthropic non pubblica (nelle pagine consultate) un elenco completo dei domini dell'interfaccia
web claude.ai. Elenco di partenza, da confermare guardando i log del proxy durante il pilota:

| Dominio | Uso | Stato |
|---|---|---|
| `claude.ai` | applicazione web, login | documentato |
| `*.claude.ai` (es. `downloads.claude.ai`) | risorse e download | `downloads.claude.ai` documentato per l'app desktop |
| `www.claudeusercontent.com`, `*.claudeusercontent.com` | anteprima degli artifact (iframe) | documentato per il frame di anteprima |
| `*.anthropic.com` (es. `api.anthropic.com`, `console.anthropic.com`) | API e servizi correlati | documentato per altri prodotti; [DA VERIFICARE] se necessario a claude.ai web |
| `claude.com`, `*.claude.com` | sito e documentazione | [DA VERIFICARE] |
| CDN e servizi di terze parti (statistiche, assistenza) | | [DA VERIFICARE] dai log del proxy |
| l'IdP dell'ente | login SSO | necessario |

Procedura: nella prima settimana registrare in modalità «consenti e registra» i domini
contattati dalle postazioni del pilota con claude.ai aperto, poi fissare l'elenco.

**Non consentire** ai PC del pilota: domini di altri servizi di IA generativa non approvati
(decisione dell'ente), e l'accesso a claude.ai da browser diversi da Chrome gestito.

### F.2 Consentire solo Chrome gestito: opzioni

Nessuna opzione è perfetta da sola; combinarle con il blocco delle app (§D) e l'SSO condizionato
(§B.2).

1. **Gruppo autenticato + User-Agent.** Il proxy autentica già gli utenti: consentire
   `claude.ai` e domini collegati solo agli utenti del gruppo `pilota-ia` **e** solo se lo
   User-Agent è Chrome desktop (contiene `Chrome/` e non `Edg/`, `OPR/`, `Electron/`,
   `Claude/`). L'app desktop di Claude è basata su Electron e di norma lo dichiara nello
   User-Agent [DA VERIFICARE con i log]. Debole: lo User-Agent si falsifica.
2. **Intestazione inserita da Chrome gestito.** Molti proxy possono richiedere un'intestazione
   presente solo nel browser gestito. Chrome non ha una policy generica per intestazioni
   arbitrarie; alcuni prodotti di sicurezza la aggiungono tramite propria estensione
   [DA VERIFICARE con il fornitore del proxy].
3. **PAC distribuito solo a Chrome gestito.** Policy di Chrome `ProxyMode=pac_script` e
   `ProxyPacUrl=https://.../claude-chrome.pac` che instrada claude.ai verso una **porta o
   istanza del proxy dedicata** (es. `proxy.ente.local:3129`) dove claude.ai è consentito;
   sulla porta standard (usata da tutti gli altri programmi) claude.ai è bloccato. Il PAC non
   è un controllo di sicurezza in sé (un utente esperto può puntare un altro programma alla
   porta dedicata): combinarlo con autenticazione e con l'opzione 1.
4. **Certificato client / postura del dispositivo.** Se il proxy o il gateway supporta
   l'autenticazione del dispositivo (certificato macchina, agente di postura), consentire
   claude.ai solo ai dispositivi gestiti.

Esempio di PAC (per l'opzione 3):

```javascript
function FindProxyForURL(url, host) {
  if (dnsDomainIs(host, "claude.ai") || shExpMatch(host, "*.claude.ai") ||
      shExpMatch(host, "*.claudeusercontent.com") || shExpMatch(host, "*.anthropic.com")) {
    return "PROXY proxy.ente.local:3129";   // porta dedicata: claude.ai consentito
  }
  if (isPlainHostName(host) || dnsDomainIs(host, ".ente.local")) return "DIRECT";
  return "PROXY proxy.ente.local:3128";
}
```

### F.3 Ispezione TLS

- Se il proxy fa ispezione TLS su claude.ai, verificare che l'interfaccia (streaming delle
  risposte, caricamento file) funzioni; in caso di problemi escludere dall'ispezione i domini
  di Anthropic **solo** se il controllo per gruppo/User-Agent resta possibile (senza ispezione
  il proxy vede solo il nome host).
- **Non** ispezionare `pseudogate.ente.local` (traffico interno) e non registrare i corpi delle
  richieste verso claude.ai: contengono testi (pseudonimizzati) e nel caso di un'evasione
  potrebbero contenere dati reali.

### F.4 Restrizioni per tenant (se disponibili)

Anthropic documenta «Enforce network-level access control with tenant restrictions»: il proxy
inserisce in ogni richiesta verso Claude un'intestazione con gli ID delle organizzazioni
ammesse, e Claude rifiuta account di altre organizzazioni (compresi account personali)
dalla rete dell'ente. Richiede ispezione TLS. Per Claude for Government l'intestazione è
`Anthropic-Allowed-Tenant-Ids`; per claude.ai nome dell'intestazione, formato dell'ID
dell'organizzazione e piani supportati vanno letti sulla pagina di supporto
[DA VERIFICARE]. Il proxy deve **sovrascrivere** (non aggiungere) l'intestazione inviata dal
client.

### F.5 Uscite della VM di Pseudomania

La VM non deve raggiungere claude.ai. In esercizio esce solo verso l'IdP (installazione-ente.md
§17). Se usa il proxy, consentire solo l'IdP (ed eventualmente il Langfuse condiviso).

---

## G. Personal edition: non imponibile

La **Personal edition** (solo estensione + app desktop di Rizzo-PII sul PC, nessun server) è
una scelta **volontaria** del singolo: l'utente può disattivarla con un clic, usare un altro
browser o l'app di Claude. Non è un controllo dell'ente e non va presentata come tale.

- Sui PC dell'ente vale solo la Server edition: la policy `mode="ente"` prevale su qualsiasi
  impostazione locale. In Server edition la protezione è **sempre attiva**: il pulsante della barra
  degli strumenti e la scorciatoia Alt+Maiusc+P sono **bloccati su acceso** (`allowDisable=false`)
  e non esiste lo stato per conversazione né il banner della Personal edition; senza policy l'estensione parte in Personal edition, quindi la policy
  deve essere applicata a **tutti** i profili Chrome dei PC del pilota.
- Per i professionisti esterni (fornitori, consulenti) che trattano dati dell'ente, la Personal
  edition può essere **raccomandata** per contratto, ma non verificata tecnicamente. Gli obblighi
  vanno scritti nell'atto di nomina a responsabile del trattamento.
- Istruzioni: [installazione-personale.md](installazione-personale.md).

---

## Fonti

Pagine consultate o individuate (ottobre 2026). Le pagine di support.claude.com sono state
individuate tramite ricerca ma **non lette integralmente** (accesso bloccato dall'ambiente di
lavoro): i relativi percorsi di menu restano [DA VERIFICARE].

- Anthropic – Set up single sign-on (SSO): https://support.claude.com/en/articles/13132885-setting-up-single-sign-on-sso
- Anthropic – SSO on Team and Enterprise plans: https://support.claude.com/en/articles/9797544-setting-up-single-sign-on-sso-on-team-and-enterprise-plans
- Anthropic – Set organization preferences: https://support.claude.com/en/articles/14546867-set-organization-preferences
- Anthropic – Claude in Chrome admin controls: https://support.claude.com/en/articles/13065128-claude-in-chrome-admin-controls
- Anthropic – Use voice mode: https://support.claude.com/en/articles/11101966-use-voice-mode
- Anthropic – Tenant restrictions (claude.ai): https://support.claude.com/en/articles/13198485-enforce-network-level-access-control-with-tenant-restrictions
- Anthropic – Tenant restrictions (Claude for Government, letta: intestazione `Anthropic-Allowed-Tenant-Ids`, sovrascrittura obbligatoria): https://claude.com/docs/government/tenant-admin/tenant-restrictions
- Anthropic – IP allowlisting (versione tedesca individuata): https://support.claude.com/de/articles/13200993-zugriff-auf-claude-mit-ip-allowlisting-einschranken
- Anthropic – Security and data handling (letta: `downloads.claude.ai`, `www.claudeusercontent.com` per il frame di anteprima degli artifact, rispetto del proxy di sistema e PAC da parte dell'app desktop): https://claude.com/docs/government/security/security-and-data-handling
- Anthropic – Network requirements di Claude Science (letta: `claude.ai`, `platform.claude.com`, `api.anthropic.com`, `console.anthropic.com` per prodotti desktop): https://claude.com/docs/claude-science/network-requirements
- Anthropic – Deploy Claude Desktop for Windows: https://support.claude.com/en/articles/12622703-deploy-claude-desktop-for-windows
- Anthropic – Deploy Claude Desktop for macOS: https://support.claude.com/en/articles/12611117-deploy-claude-desktop-for-macos
- Anthropic – Enterprise configuration for Claude Desktop: https://support.claude.com/en/articles/12622667-enterprise-configuration-for-claude-desktop
- Anthropic – Install Claude for Android: https://support.claude.com/en/articles/9612887-install-claude-for-android
- Pacchetto Android `com.anthropic.claude` (cataloghi): https://appgoblin.info/apps/com.anthropic.claude/keywords , https://www.similarweb.com/app/google/com.anthropic.claude/spain
- Google – Configure ExtensionSettings policy: https://support.google.com/chrome/a/answer/9867568
- Chromium – Extension Settings full description: https://www.chromium.org/administrators/policy-list-3/extension-settings-full
- Google – Chrome Enterprise policy list: https://chromeenterprise.google/policies/
- Microsoft – Add a redirect URI (tipi di piattaforma): https://learn.microsoft.com/en-au/Entra/identity-platform/how-to-add-redirect-uri
- Microsoft – MSAL.js initialization (redirect URI per estensioni): https://learn.microsoft.com/en-us/entra/msal/javascript/browser/initialization
- Repository: `extension/README.md`, `extension/schema.json`, `extension/manifest.json`,
  `extension/src/background/auth.js`, `server/pseudogate/auth.py`, `deploy/.env.example`.
