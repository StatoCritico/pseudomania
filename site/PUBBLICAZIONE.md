# Pubblicare Pseudomania: codice, sito, catalogo e Chrome Web Store

Questa guida descrive come rendere pubblici il codice sorgente, la landing page (`site/`),
la scheda nel catalogo del riuso di Developers Italia e l'estensione nel Chrome Web Store.
I valori tra parentesi quadre e i segnaposto `ORG` / `ENTE` vanno sostituiti con quelli reali
(elenco completo in fondo, sezione 8).

> Le procedure dei servizi esterni cambiano spesso. I passaggi qui riportati sono stati verificati
> sulle pagine ufficiali il 30 ottobre 2026 (vedi «Fonti»): controllale di nuovo prima di procedere.

---

## 1. Prima di pubblicare: controlli sul repository

Developers Italia chiede, oltre al codice, una licenza aperta, un README con prerequisiti e
istruzioni di installazione, la documentazione, le istruzioni di contribuzione e un changelog, e
raccomanda analisi statica e controllo delle vulnerabilità prima del rilascio.

Lista di controllo:

- [ ] `LICENSE` con il testo AGPL-3.0 nella radice; intestazione SPDX
      (`SPDX-License-Identifier: AGPL-3.0-or-later`) nei file nuovi.
- [ ] `extension/NOTICE` e `extension/LICENSE-APACHE-2.0` conservati (obbligo della licenza Apache-2.0
      di Privacy Guardrail).
- [ ] **Verificare il file `TERMS.md` di Privacy Guardrail.** Il NOTICE originale del DFKI richiama
      condizioni d'uso supplementari («Nutzungsbedingungen / Terms of Use»): va accertato con l'ufficio
      legale che non aggiungano vincoli incompatibili con la ridistribuzione in AGPL e che il nome
      «Privacy Guardrail» e il marchio DFKI non siano usati oltre la semplice attribuzione.
- [ ] Verificare la licenza dei **pesi del modello** Rizzo-PII (oltre a quella del codice) e delle
      immagini container usate in `deploy/`.
- [ ] `README.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, `SECURITY.md` (come segnalare vulnerabilità in
      modo riservato), codice di condotta.
- [ ] Nessun segreto nel repository: `.env` reali, token, chiavi OpenBao, certificati, URL interni non
      destinati alla pubblicazione. Controllare anche la **cronologia** git (es. con `gitleaks`).
- [ ] Nessun dato personale reale in test, esempi, screenshot e log.
- [ ] `publiccode.yml` nella radice (vedi sezione 4).
- [ ] Verificare che il nome «Pseudomania» non sia già un marchio registrato in uso nello stesso settore.

## 2. Repository del codice (GitHub o GitLab)

1. Creare un'**organizzazione** intestata all'ente (es. `github.com/ORG` o `gitlab.com/ORG`), non un
   account personale. Abilitare l'autenticazione a due fattori obbligatoria per i membri.
2. Creare il repository pubblico `pseudogate` e caricare il contenuto dell'albero di lavoro.
3. Impostazioni consigliate:
   - protezione del ramo `main` (revisione obbligatoria delle merge request / pull request);
   - segnalazione privata delle vulnerabilità (GitHub: *Security → Private vulnerability reporting*);
   - scansione dei segreti e delle dipendenze (Dependabot / Renovate, o gli equivalenti GitLab).
4. **Release**: per ogni versione creare un tag `vX.Y.Z` e una release con allegati
   - `pseudogate-extension-X.Y.Z.zip` (cartella `extension/` impacchettata, `manifest.json` alla radice dello zip);
   - `pseudogate-server-X.Y.Z.tar.gz` (cartelle `server/` e `deploy/`);
   - `SHA256SUMS` con le somme di controllo.
   Facoltativo: immagini container su `ghcr.io/ORG/pseudogate-api` o sul registry GitLab, firmate con cosign.

I pulsanti di download della landing page puntano a `https://github.com/ORG/pseudogate/releases/latest`.
Se si usa GitLab, sostituire con `https://gitlab.com/ORG/pseudogate/-/releases/permalink/latest`.

## 3. Pubblicare il sito

Il sito ufficiale è **https://pseudomania.statocritico.it**. La cartella `site/` contiene file statici
(HTML, CSS, poco JavaScript, nessuna risorsa esterna) pronti da pubblicare:

```
site/index.html                landing page (sezioni a carosello)
site/privacy.html              informativa privacy dell'estensione (URL per il Chrome Web Store)
site/approfondimenti/*.html    pagine di approfondimento con menu ad albero
site/assets/                   style.css, main.js, theme-init.js, favicon.svg
```

**Non vanno pubblicati**: `site/_build/`, `site/_screens/`, `site/PUBBLICAZIONE.md`,
`site/publiccode.yml.draft`.

### 3.0 Modificare i contenuti

Le pagine sono generate da `site/_build/genera.py` (solo libreria standard di Python 3) a partire da
`site/_build/home.json` (sezioni e schede della landing page) e `site/_build/pagine/*.html` (corpo
delle pagine). Intestazione, menu ad albero, piè di pagina e paginazione sono uguali ovunque perché
li scrive il generatore. Dopo una modifica:

```bash
python3 site/_build/genera.py     # rigenera le pagine e controlla tutti i collegamenti interni
```

Il comando termina con errore se un collegamento o un'ancora interna non esiste. Le ancore
richiamate dall'estensione (in particolare `/approfondimenti/#recupero-chiavi`) **non vanno
rinominate**. Si consiglia di pubblicare le pagine generate insieme alle sorgenti, così il sito si può
servire senza eseguire nulla.

### 3.1 Cloudflare Pages collegato a GitHub (scelta adottata per pseudomania.statocritico.it)

Il sito ufficiale è pubblicato con **Cloudflare Pages** (account e DNS di `statocritico.it`), collegato al
repository `StatoCritico/pseudomania`: ogni `git push` sul ramo `main` ripubblica il sito.

Impostazioni del progetto Pages `pseudomania`:

| Campo | Valore |
|---|---|
| Repository | `StatoCritico/pseudomania`, ramo `main` |
| Framework preset | None |
| Build command | `sh site/_build/pubblica.sh` (copia in `dist/` solo le pagine pubblicabili, compresa la pagina `404.html`) |
| Build output directory | `dist` |
| Dominio personalizzato | `pseudomania.statocritico.it` (Custom domains → Set up a custom domain; il record CNAME viene creato da Cloudflare) |

Il comando di build copia solo le pagine pubblicabili (esclude `_build/`, `_screens/`, `PUBBLICAZIONE.md` e la
bozza di `publiccode.yml`). Le intestazioni di sicurezza del punto 4 qui sotto sono nel file `site/_headers`, letto
da Cloudflare Pages. Le pagine generate vanno rigenerate con `genera.py` e incluse nel commit: Cloudflare non
esegue Python.

### 3.1 bis Sottodominio su un server proprio (alternativa)

1. **DNS** (nel pannello del registrar o del DNS di `statocritico.it`):
   - se il sito è su un server proprio: record `A` (e `AAAA` per IPv6) `pseudomania` → indirizzo del server;
   - se il sito è su un servizio di hosting statico (GitHub Pages, GitLab Pages, altro): record
     `CNAME` `pseudomania` → nome indicato dal servizio (es. `ORG.github.io`). Un `CNAME` non può
     coesistere con altri record sullo stesso nome.
   - Se il dominio usa CAA, consentire l'autorità di certificazione usata (es. `letsencrypt.org`).
2. **File**: copiare sul server il contenuto di `site/` senza i file esclusi, ad esempio
   ```bash
   rsync -av --delete --exclude '_build' --exclude '_screens' --exclude 'PUBBLICAZIONE.md' \
         --exclude 'publiccode.yml.draft' site/ utente@server:/var/www/pseudomania/
   ```
3. **HTTPS**: certificato automatico Let's Encrypt (Caddy lo fa da solo; con nginx o Apache usare
   certbot). Reindirizzare HTTP verso HTTPS e, dopo aver verificato che tutto funziona, attivare HSTS.
4. **Intestazioni di sicurezza** consigliate. Il sito non usa script o stili in linea, quindi regge una
   Content Security Policy restrittiva:
   ```
   Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'none'
   Referrer-Policy: no-referrer
   X-Content-Type-Options: nosniff
   Permissions-Policy: camera=(), microphone=(), geolocation=()
   ```
   Esempio con Caddy:
   ```
   pseudomania.statocritico.it {
       root * /var/www/pseudomania
       file_server
       header {
           Content-Security-Policy "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'none'"
           Referrer-Policy no-referrer
           X-Content-Type-Options nosniff
           Strict-Transport-Security "max-age=31536000"
       }
   }
   ```
5. **Log del server web**: registrano l'indirizzo IP dei visitatori; tenerli per il tempo strettamente
   necessario e citarli nella sezione «Privacy di questo sito» delle note legali.
6. Verifica: aprire `https://pseudomania.statocritico.it/`, `/privacy.html` e
   `/approfondimenti/#recupero-chiavi`; controllare il certificato e le intestazioni (strumenti per
   sviluppatori del browser, scheda Rete).

### 3.1 GitHub Pages

GitHub Pages pubblica da un ramo solo la radice o la cartella `/docs`; per pubblicare `site/` si usa
un workflow di GitHub Actions.

1. *Settings → Pages → Build and deployment → Source*: **GitHub Actions**.
2. Creare `.github/workflows/pages.yml`:

```yaml
name: Pubblica il sito
on:
  push:
    branches: [main]
    paths: ["site/**"]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v6
      - uses: actions/configure-pages@v5
      - name: Prepara i file del sito
        run: |
          mkdir _site
          rsync -a --exclude '_build' --exclude '_screens' --exclude 'PUBBLICAZIONE.md' \
                --exclude 'publiccode.yml.draft' site/ _site/
      - uses: actions/upload-pages-artifact@v4
        with:
          path: _site
      - id: deployment
        uses: actions/deploy-pages@v4
```

3. Il sito sarà disponibile su `https://ORG.github.io/pseudogate/`. Per il dominio ufficiale
   configurare *Custom domain* = `pseudomania.statocritico.it`, il record DNS `CNAME`
   `pseudomania` → `ORG.github.io` e *Enforce HTTPS*; verificare il dominio nelle impostazioni
   dell'organizzazione per evitarne l'appropriazione. GitHub Pages non consente intestazioni
   personalizzate: la CSP del punto 3.1 si applica solo con un server proprio.

### 3.2 GitLab Pages

Creare `.gitlab-ci.yml` nella radice:

```yaml
pages:
  stage: deploy
  image: alpine:3.20
  script:
    - apk add --no-cache rsync
    - mkdir public
    - rsync -a --exclude '_build' --exclude '_screens' --exclude 'PUBBLICAZIONE.md' --exclude 'publiccode.yml.draft' site/ public/
  artifacts:
    paths:
      - public
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
```

Il sito sarà pubblicato su `https://ORG.gitlab.io/pseudogate/`. Le versioni recenti di GitLab
consentono anche la parola chiave `pages.publish` per indicare una cartella diversa da `public`.

### 3.3 Hosting sul sito dell'ente e obblighi per i siti della PA

- Un ente che riusa Pseudomania può pubblicare una copia del sito sul proprio dominio con la stessa
  procedura del punto 3.1. GitHub e GitLab, come ogni hosting, registrano gli indirizzi IP dei
  visitatori; se si usano, citarli nelle note legali del sito.
- Il sito non usa cookie, non carica font o script da terzi e non contiene strumenti di
  statistica: non serve il banner dei cookie. Se si aggiungono statistiche, preferire Web Analytics
  Italia (WAI) e aggiornare l'informativa.
- Se il sito è un sito web della PA ai sensi della L. 4/2004, va pubblicata la **dichiarazione di
  accessibilità** tramite la procedura AGID (form.agid.gov.it) e collegata nel piè di pagina.
- L'**informativa privacy** dell'estensione è `site/privacy.html`, pubblicata su
  `https://pseudomania.statocritico.it/privacy.html` (URL da indicare nel Chrome Web Store, vedi 5.3): prima della pubblicazione completare titolare, DPO, versione, data, periodo di
  conservazione del registro e link all'informativa ai dipendenti, e farla validare dal DPO.

## 4. Catalogo del riuso di Developers Italia (`publiccode.yml`)

L'art. 69 del CAD prevede che le amministrazioni titolari di software realizzato su loro commissione
lo rendano disponibile in riuso con licenza aperta. Il catalogo di Developers Italia (area A, software
di titolarità delle PA) si popola automaticamente: un crawler esamina ogni notte gli spazi di code
hosting registrati dalle amministrazioni e indicizza i repository che contengono un `publiccode.yml` valido.

### 4.1 Preparare il file

1. Partire da `site/publiccode.yml.draft` (scritto per lo standard **v0.4**), sostituire i segnaposto
   e salvarlo come `publiccode.yml` nella **radice** del repository, sul ramo principale.
2. Campi da completare:
   - `url`, `landingURL`: indirizzi reali del repository e del sito;
   - `softwareVersion` e `releaseDate`: allineati all'ultima release;
   - `legal.mainCopyrightOwner`, `legal.repoOwner`: denominazione dell'ente;
   - `maintenance`: `internal` con un referente reale (nome, email) oppure `contract` con il fornitore
     e la data di fine contratto (`until`);
   - `it.riuso.codiceIPA`: codice iPA dell'ente (dall'Indice dei domicili digitali della PA, indicepa.gov.it);
   - eventuali `screenshots` dell'estensione (PNG/JPG nel repository).
3. Validare il file con l'editor ufficiale (publiccode-editor.developers.italia.it) oppure con
   `publiccode-parser` da riga di comando.

**Esito della validazione della bozza.** La bozza è stata verificata con `publiccode-parser` v5.2.0
(offline, senza controlli di rete): con un codice iPA reale non ci sono errori; restano solo
avvertimenti, perché il parser legge i file v0.4 come v0.5 e segnala come deprecati:

| Avviso | Come aggiornare (standard v0.5 o successivo) |
|---|---|
| codici paese minuscoli (`it`) | `intendedAudience.countries: [IT]` e sezione `IT:` invece di `it:` |
| `legal.repoOwner` | `organisation.name: "[NOME ENTE]"` |
| `it.riuso.codiceIPA` | `organisation.uri: "urn:x-italian-pa:[codice iPA]"` |

Si può pubblicare in v0.4 così com'è oppure applicare queste modifiche e dichiarare la versione
più recente indicata dall'editor. Lo standard (v0.5 e successive) ha inoltre deprecato le chiavi
`it.conforme.*`: per questo la bozza non le valorizza.

### 4.2 Registrare l'ente e il repository

1. Il **referente** dell'ente registrato nell'Indice PA (iPA) accede a
   `https://onboarding.developers.italia.it/` e registra l'amministrazione indicando l'URL dello spazio
   di code hosting (preferibilmente l'intera organizzazione, es. `https://github.com/ORG`, oppure il singolo repository).
   La procedura richiede la conferma tramite il domicilio digitale (PEC) dell'ente registrato in iPA.
2. Dopo la registrazione il crawler esamina lo spazio di notte: se `publiccode.yml` è valido, il
   software compare nel catalogo (`developers.italia.it/it/software-open-source`) nei giorni successivi.
3. Ogni aggiornamento di `publiccode.yml` sul ramo principale viene ripreso automaticamente. Tenere
   aggiornati `softwareVersion`, `releaseDate`, `developmentStatus` (oggi `beta`; passare a `stable`
   dopo il pilota) e i contatti di manutenzione.
4. Facoltativo: pubblicare un annuncio sul forum di Developers Italia (forum.italia.it) per raccogliere
   amministrazioni interessate al riuso e, quando ci sono, elencarle in `usedBy`.

## 5. Chrome Web Store

L'estensione serve in due forme: per i **professionisti** (installazione libera) e per gli **enti**
(installazione forzata via policy). Lo stesso elemento del Web Store può servire entrambi.

### 5.1 Account sviluppatore

1. Usare un **account Google istituzionale** dedicato (es. una casella `pseudogate@ENTE.it`
   associata a un account Google), non un account personale: l'email dello sviluppatore non si può
   cambiare dopo la registrazione.
2. Aprire la console sviluppatori (`chrome.google.com/webstore/devconsole`), accettare il contratto
   per gli sviluppatori e le norme del programma, pagare la **quota di registrazione una tantum**
   (attualmente 5 USD; verificare l'importo al momento della registrazione) e attivare la verifica in
   due passaggi sull'account.
3. Completare il profilo: nome editore (es. «[NOME ENTE]»), **email di contatto verificata**,
   **dichiarazione di operatore commerciale/non commerciale** (*trader*) richiesta nell'UE. Valutare
   con l'ufficio legale come qualificare l'ente; chi si dichiara *trader* deve pubblicare indirizzo e
   contatti verificati.
4. Facoltativo: verificare il dominio del sito per ottenere il badge dell'editore verificato.

### 5.2 Pacchetto e scheda

1. Caricare lo zip dell'estensione (`manifest.json` alla radice dello zip, Manifest V3) nella scheda **Package**.
2. **Store listing** in italiano: descrizione onesta (misura di mitigazione, non anonimizzazione),
   categoria, icona 128×128, almeno uno screenshot 1280×800 o 640×400, link al sito e al supporto.
3. Indicare nelle **istruzioni per i revisori** come provare l'estensione: senza policy funziona come
   **Personal edition** e richiede l'app desktop di Rizzo-PII avviata su `127.0.0.1:5005` (spiegare come
   installarla); la Server edition richiede un server dell'ente. Senza queste indicazioni la
   revisione può fallire.

### 5.3 Pratiche relative alla privacy (scheda *Privacy*)

Il Web Store richiede di compilare:

- **Scopo unico**: es. «Sostituisce i dati personali con segnaposto nei testi inviati a claude.ai,
  usando il servizio di rilevamento locale (Rizzo-PII) o il server dell'ente, e li ripristina nelle
  risposte».
- **Giustificazione di ogni permesso** dichiarato nel manifest (es. `storage`, `identity`, permessi
  host per `claude.ai` e per il server configurato). Rimuovere i permessi non usati prima dell'invio.
- **Codice remoto**: dichiarare che l'estensione **non** esegue codice remoto (MV3 non lo consente).
- **Dati utente raccolti**: dichiarare con esattezza le categorie trattate, verosimilmente
  «Informazioni personali identificabili», «Contenuti del sito web» e «Informazioni di autenticazione»
  (token OIDC nella Server edition), precisando che sono inviati **solo** all'app Rizzo-PII locale
  o al server configurato dall'ente e non a sviluppatori o terzi.
- **Certificazioni** sull'uso dei dati (incluse le norme sull'uso limitato).
- **URL dell'informativa privacy**: `https://pseudomania.statocritico.it/privacy.html`.

### 5.4 Visibilità e distribuzione

Nella scheda **Distribution** si sceglie la visibilità:

| Visibilità | Effetto | Uso consigliato |
|---|---|---|
| **Pubblica** | elencata e ricercabile nello store | Personal edition per i professionisti |
| **Non in elenco** (*unlisted*) | installabile solo da chi ha il link | fase pilota, test esterni |
| **Privata** | solo tester fidati o gruppi Google indicati | prove interne |
| **Privata per il dominio** | solo utenti del dominio Google Workspace dell'ente | ente che usa Google Workspace |

Si possono limitare le regioni (es. solo Italia). Dopo la revisione si hanno 30 giorni per pubblicare
(pubblicazione differita).

### 5.5 Installazione forzata nell'ente

- **Ente con Google Workspace / Chrome Enterprise**: nella Console di amministrazione,
  *Dispositivi → Chrome → App ed estensioni → Utenti e browser*, selezionare l'unità organizzativa,
  aggiungere l'estensione per ID (o dallo store privato del dominio), impostare **Installazione forzata**
  e incollare la configurazione gestita in JSON (`mode`, `serverUrl`, `oidcIssuer`, `oidcClientId`,
  `failClosed`, `allowDisable`…; schema in `extension/schema.json`).
- **Ente senza Google Workspace** (es. Active Directory / Microsoft Intune): pubblicare l'estensione
  come *non in elenco* o pubblica e usare il criterio `ExtensionInstallForcelist` (o `ExtensionSettings`)
  tramite modelli ADMX o Intune, con l'ID dell'estensione e l'URL di aggiornamento del Web Store;
  la configurazione va nel criterio `3rdparty` → `extensions` → `<ID>` → `policy`.
  Le estensioni ospitate fuori dal Web Store si possono forzare solo su dispositivi gestiti: consultare
  la documentazione di Chrome Enterprise prima di scegliere l'auto-hosting.
- Le estensioni installate in modo forzato non possono essere rimosse dagli utenti.

Dettagli operativi: `docs/installazione-ente.md`, `docs/configurazione.md` e, prima del go-live, `docs/verifica-pilota.md`; adempimenti in `governance/checklist-adempimenti.md`.

## 6. Ordine consigliato

1. Controlli del repository (sezione 1) e parere dell'ufficio legale e del DPO.
2. Repository pubblico e prima release `v0.1.0` (sezione 2).
3. Sito su pseudomania.statocritico.it (sezione 3) con informativa privacy e dichiarazione di accessibilità.
4. `publiccode.yml` e onboarding su Developers Italia (sezione 4).
5. Chrome Web Store: prima *non in elenco* durante il pilota, poi pubblica (sezione 5); aggiornare il
   pulsante «Chrome Web Store – in arrivo» in `site/_build/pagine/strumenti-e-download.html` con il link reale e rigenerare il sito.

## 7. Dopo la pubblicazione

- Rispondere a issue e merge request; pubblicare le note di rilascio e il changelog.
- Aggiornare `publiccode.yml` a ogni release.
- Tenere aggiornate le dipendenze (Rizzo-PII, Langfuse, OpenBao, PostgreSQL) e pubblicare gli avvisi di sicurezza.

## 8. Segnaposto da sostituire

| Segnaposto | Dove | Valore |
|---|---|---|
| `ORG` (repository) | `site/_build/genera.py` (`REPO`), pagine in `site/_build/pagine/`, `publiccode.yml.draft`, questa guida | organizzazione GitHub/GitLab; poi rigenerare il sito |
| `[NOME ENTE]` | `site/_build/pagine/privacy.html`, `publiccode.yml.draft` | denominazione ufficiale |
| `referente@ENTE.it` | `publiccode.yml.draft` | casella istituzionale reale |
| `[contatto per la sicurezza da definire]` | `site/_build/pagine/note-legali.html` | contatto riservato per le vulnerabilità |
| `[codice iPA dell'ente]` | `publiccode.yml.draft` | codice iPA |
| `[Nome Cognome del referente tecnico]` | `publiccode.yml.draft` | referente della manutenzione |
| `softwareVersion`, `releaseDate` | `publiccode.yml.draft` | ultima release |
| link «Chrome Web Store – in arrivo» | `site/_build/pagine/strumenti-e-download.html` | URL della scheda nel Web Store |
| requisiti hardware indicativi | `site/_build/pagine/server-edition.html` (stime di `docs/installazione-ente.md`) | valori misurati nel pilota |
| `[NOME ENTE]`, `[indirizzo]`, `pec@ENTE.it`, `rpd@ENTE.it`, versione/data, link all'informativa | `site/_build/pagine/privacy.html` | dati dell'ente e del DPO |

---

## Fonti

Consultate il 30 ottobre 2026.

- Developers Italia, *Pubblicare software per la PA*: https://developers.italia.it/it/guide/pubblicare-software-per-la-pa
- Developers Italia, *Publication* (versione inglese): https://developers.italia.it/en/reuse/publication
- Developers Italia, onboarding delle amministrazioni: https://onboarding.developers.italia.it/
- Developers Italia, catalogo del software open source: https://developers.italia.it/it/software-open-source
- Policy di inserimento nel catalogo: https://docs.italia.it/italia/developers-italia/policy-inserimento-catalogo-docs/it/stabile/catalogo-di-developers-italia.html
- Linee guida AGID, Allegato A – Guida alla pubblicazione open source di software realizzato per la PA: https://docs.italia.it/italia/developers-italia/lg-acquisizione-e-riuso-software-per-pa-docs/it/stabile/attachments/allegato-a-guida-alla-pubblicazione-open-source-di-software-realizzato-per-la-pa.html
- Standard publiccode.yml, documentazione (chiavi principali): https://docs.italia.it/italia/developers-italia/publiccodeyml/it/master/schema.core.html
- Standard publiccode.yml, estensioni nazionali italiane: https://docs.italia.it/italia/developers-italia/publiccodeyml/it/master/country.html
- Standard publiccode.yml, elenco delle categorie: https://docs.italia.it/italia/developers-italia/publiccodeyml/it/master/categories-list.html
- Standard publiccode.yml, elenco degli ambiti (*scope*): https://docs.italia.it/italia/developers-italia/publiccodeyml/it/master/scope-list.html
- Standard publiccode.yml, repository e note di rilascio (v0.4.0, v0.5.0, v0.7.0): https://github.com/publiccodeyml/publiccode.yml/releases
- Esempio minimo v0.4 (OpenCoDE): https://guide.opencode.de/assets/code/min.publiccode.yml
- Editor e validatore di publiccode.yml: https://publiccode-editor.developers.italia.it/
- publiccode-parser (validatore da riga di comando): https://github.com/italia/publiccode-parser-go
- GitHub Docs, *Using custom workflows with GitHub Pages*: https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
- GitHub Docs, *Configuring a publishing source*: https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
- GitLab Docs, *GitLab Pages public folder*: https://docs.gitlab.com/17.6/ee/user/project/pages/public_folder.html
- Chrome Web Store, *Register your developer account*: https://developer.chrome.com/docs/webstore/register
- Chrome Web Store, *Publish in the Chrome Web Store*: https://developer.chrome.com/docs/webstore/publish
- Chrome Web Store, *Fill out the privacy fields*: https://developer.chrome.com/docs/webstore/cws-dashboard-privacy
- Chrome Web Store, *Set up distribution* (visibilità): https://developer.chrome.com/docs/webstore/cws-dashboard-distribution
- Chrome Web Store, *Enterprise publishing options*: https://developer.chrome.com/docs/webstore/cws-enterprise
- Chrome Web Store, verifica operatore commerciale (*trader*): https://developer.chrome.com/docs/webstore/program-policies/trader-verification-faq
- Google, *Automatically install apps and extensions* (Console di amministrazione): https://support.google.com/chrome/a/answer/6306504
- Chrome Enterprise, criterio `ExtensionInstallForcelist`: https://chromeenterprise.google/policies/?policy=ExtensionInstallForcelist
