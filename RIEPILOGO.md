# Pseudomania – riepilogo per riprendere il lavoro

Aggiornato al 4/11/2026 (codice pubblicato su GitHub, sito online su Cloudflare Pages, Piano d'azione aggiornato). Questo file serve a riprendere la conversazione da zero: incollalo (o allegalo) all'inizio di una nuova sessione insieme all'archivio del progetto.

## 1. Obiettivo

Permettere ai dipendenti di un ente pubblico italiano di usare Claude (piano **Claude Team**, abbonamento: prerequisito non negoziabile) in modo più conforme al GDPR. Il sistema pseudonimizza in automatico ciò che viene inviato a claude.ai (chat, allegati PDF/DOCX/XLSX, Progetti) e ripristina i dati reali nelle risposte. Il codice è rilasciato in **AGPL-3.0** per il riuso gratuito da parte di tutte le PA.

È una **misura di mitigazione del rischio**, non una garanzia: oggi i dipendenti usano account Team senza alcun controllo. La pseudonimizzazione resta un trattamento di dati personali. Tutta la responsabilità legale resta in capo a chi adotta e usa il sistema.

Nome: **Pseudomania**. Sito: **https://pseudomania.statocritico.it**. Due edizioni: **Personal edition** e **Enterprise edition**.

## 2. Percorso delle decisioni (in sintesi)

1. Prima ipotesi: stack di proxy con piighost + Presidio + Langfuse + LibreChat. **Scartata**: Claude Team è un abbonamento e non ha API, quindi il suo traffico non si può far passare da un proxy (servirebbe intercettare il TLS, contrario ai termini e tecnicamente fragile). Cowork e Claude Code non sono replicabili in LibreChat.
2. Valutato un browser in sandbox comandato da un server: **scartato**. È accesso automatizzato (area grigia nei termini commerciali, vietato in quelli consumer), costoso da sviluppare e fragile.
3. Scelta: **estensione Chrome** installata d'ufficio e non disattivabile, più un **server interno** con **Rizzo-PII** (modello italiano per i dati personali, licenza MIT). Base del codice: **Privacy Guardrail del DFKI** (Apache-2.0, compatibile con l'AGPL).
4. Ambito: pilota con 6 utenti, solo Claude, solo chat (Progetti compresi). Poi, nell'ordine: agenti locali (Goose, OpenCode) tramite API, ed eventualmente ChatGPT. Gli altri chatbot sono esclusi (Copilot M365 non è copribile).

## 3. Decisioni prese

| Tema | Decisione |
|---|---|
| Servizio | Claude Team su claude.ai, Chrome gestito |
| Pseudonimizzazione | Automatica, con ispezione su richiesta (pannello laterale, anteprima con Ctrl+Maiusc+Invio) |
| Tag | `[TIPO_n]`. Claude è istruito a non modificarli e a non crearne di nuovi |
| Categorie particolari (artt. 9-10 GDPR) | Bloccate senza possibilità di forzare. Pulsante «Segnala blocco errato» |
| Modifica e rigenerazione | Intercettate come un nuovo invio |
| Progetti | Attivi (non si possono disattivare), con condivisione spenta. File e istruzioni pseudonimizzati, dizionario per progetto |
| Memoria di Claude | **Spenta**: i tag numerati per chat causerebbero ripristini con la persona sbagliata |
| Ricerca web di Claude | **Attiva**, con misure: verifica del sub-fornitore, informativa, regola d'uso, misura nel pilota |
| Funzioni spente | Connettori, richieste di connettori, Claude in Chrome, voce, valutazioni/feedback, app desktop, app Android aziendale (MDM) |
| Accesso | SSO obbligatorio con accesso condizionato dell'identity provider. Il proxy aziendale (che autentica già gli utenti) lascia passare claude.ai solo da Chrome gestito |
| Dizionario | Cifrato **nel browser**, chiave automatica (nessuna frase segreta) non estraibile, rotazione ogni 90 giorni. Copia della chiave cifrata per i custodi (chiave privata di custodia offline, divisa 2 su 3). Root sulla VM non può decifrare in blocco i dizionari |
| Cambio PC | Le chat vecchie restano con i tag. I progetti si recuperano tramite i custodi, su richiesta |
| Osservabilità | Ibrida: i contenuti si recuperano con l'esportazione di Claude Team (Primary Owner su account di servizio con credenziali e MFA divise tra due custodi, solo su richiesta dell'autorità giudiziaria, verbale). Sul server resta un registro minimo senza testi, con hash di ogni messaggio. Langfuse solo nell'Enterprise edition, eventualmente condiviso con altre applicazioni dell'ente |
| Accesso ai registri | Solo i custodi, su richiesta dell'autorità giudiziaria (come per la videosorveglianza). Serve l'accordo sindacale o l'autorizzazione dell'Ispettorato (art. 4 L. 300/1970) |
| Backup | Cancellazione crittografica: si distrugge la chiave, non il record. Archivio delle chiavi separato dai backup del database |
| Personal edition | Solo estensione + app desktop di Rizzo-PII. Nessun server, nessun Docker, nessun Langfuse. I PDF vengono inviati come testo pseudonimizzato |
| Attivazione | Enterprise: sempre attiva, pulsante bloccato. Personal: pulsante nella barra di Chrome (e Alt+Maiusc+P) con stato **per conversazione**; nuova chat: si attiva da sola se l'ultima scelta era "attivo", altrimenti chiede; chat ripresa: si riattiva se era attiva, altrimenti chiede; mentre chiede, i messaggi restano protetti; spenta vale solo in uscita, il ripristino in entrata è sempre attivo |
| Browser e chatbot supportati | Solo **Chrome** e **claude.ai** (quelli usati dall'autore). Tutto ciò che è specifico del sito sta in un modulo adattatore (`extension/src/sites/claude.js`, `registry.js`): altri possono aggiungere chatbot o portarla su altri browser Chromium sotto AGPL; Firefox richiede adattamenti. FAQ sul sito: `#faq-altri-siti` |
| Licenza | Codice in AGPL-3.0, componenti con licenze compatibili (MIT, Apache, BSD, MPL, PostgreSQL) |
| Realizzazione | Team interno + fornitore |
| Lettera ad Anthropic | Da inviare **dopo** la prova tecnica (bozza in `governance/verifiche-fase0.md`) |

## 4. Durate di conservazione (Enterprise edition)

| Dato | Durata |
|---|---|
| Dizionario chat | 30 giorni dall'ultimo uso, nessun recupero |
| Dizionario progetti | Durata del progetto + 30 giorni, con conferma annuale da parte dell'utente. Recupero via custodi su richiesta |
| Registro delle azioni | 90 giorni (con accordo sindacale), poi solo dati aggregati anonimi |
| Tracce Langfuse | 30 giorni durante il pilota, poi 7 |
| Backup database | Rotazione entro 35 giorni (7 giornalieri + 4 settimanali), copia offline |
| Archivio chiavi | Backup separati, rotazione 14 giorni |
| Copie delle chiavi per i custodi | Quanto la chiave; distrutte con essa |
| Registri tecnici degli accessi | 24 mesi |
| Verbali dei custodi | Secondo il massimario dell'ente |

Fonti principali: Garante 27/11/2008 (amministratori di sistema), Garante su Regione Lombardia (90 giorni, doc. web 10134221), Garante 6/6/2024 (metadati email), Garante LG 2007, EDPB LG 3/2019, NIST SP 800-88 Rev. 2, rapporto EDPB CEF 2025. Non esiste un obbligo generale di conservare i dati in vista di richieste dell'autorità: si blocca la cancellazione solo quando la richiesta arriva.

## 5. Verifiche già fatte

- Claude Team: SSO e "Require SSO" disponibili; blocco per IP, audit log, Compliance API e conservazione personalizzata solo in Enterprise; il Primary Owner può esportare le conversazioni di tutti; la memoria si spegne a livello di organizzazione (cancella i dati); le valutazioni (feedback) sono conservate fino a 5 anni.
- Contraente per l'UE: Anthropic Ireland. Trasferimenti: clausole contrattuali standard; certificazione DPF non confermata.
- Qualificazione ACN di Claude Team: **non trovata** (catalogo consultabile solo da IP italiani).
- Licenze: Rizzo-PII codice e modello MIT (le immagini Docker redistribuite sono AGPL per via di PyMuPDF); termini aggiuntivi del DFKI compatibili con l'AGPL; MinIO archiviato (sostituito da SeaweedFS), Vault non open source (sostituito da OpenBao), MongoDB SSPL non usato.

## 6. Contenuto dell'archivio

| Cartella | Contenuto |
|---|---|
| `DECISIONI.md`, `SPEC.md` | Decisioni vincolanti e contratto tecnico tra i componenti |
| `extension/` | Estensione Chrome (entrambe le edizioni), test, server di simulazione, script di verifica dei selettori su claude.ai |
| `server/`, `deploy/` | API, stack docker-compose Enterprise, script di backup e ripristino, OpenBao |
| `tools/custodi/` | Strumento offline per i custodi |
| `collaudo/` | Documenti di prova inventati e script di valutazione della qualità |
| `docs/` | Installazione Enterprise, configurazione esterna, Personal edition, procedure dei custodi, verifica del pilota, problemi aperti |
| `governance/` | Regolamento con allegati, DPIA, checklist, verifiche della fase 0 con lettera ad Anthropic, policy light (MD e DOCX) |
| `site/` | Sito statico (caroselli e approfondimenti), privacy, guida alla pubblicazione, bozza di `publiccode.yml` |
| `manuale/` | Manuale utente completo e due guide rapide (MD, DOCX, PDF) |

## 7. Stato e prossimi passi

**Nulla è stato provato in condizioni reali**: i test automatici passano contro simulazioni di claude.ai, del server e di Rizzo-PII. Container mai avviati (registri bloccati nell'ambiente di sviluppo).

### 7.0 Pubblicazione (4/11/2026)

- **Repository pubblico**: <https://github.com/StatoCritico/pseudomania> (ramo `main`, primo commit «Prima versione pubblica di Pseudomania»). Identità git locale del repository: Paolo Bianco, eugenio@statocritico.it; `core.autocrlf false` e `.gitattributes` (LF, binari intatti). Segnalazione privata delle vulnerabilità attiva (`SECURITY.md`). Aggiunti `README.md`, `CONTRIBUTING.md`, `CHANGELOG.md`.
- **Esclusi dal repository** (`.gitignore`): `Gateway_LLM_PA_Piano_d_azione.docx` (documento interno, aggiornato al 3/11/2026 e senza firma) e `site/_screens/`.
- **Sito**: progetto Cloudflare Pages `pseudomania` collegato al repository (ogni push su `main` ripubblica), build che copia solo le pagine pubblicabili in `dist/`, intestazioni di sicurezza in `site/_headers`, dominio `pseudomania.statocritico.it` (CNAME creato da Cloudflare). Dettagli in `site/PUBBLICAZIONE.md` §3.1.
- **Segnaposto risolti**: link al repository (`StatoCritico/pseudomania`) nel sito e in `publiccode.yml.draft`; dati dell'ente tolti dalla pagina privacy; contatto di sicurezza = segnalazione privata di GitHub.
- **Da fare**: prima release (i pulsanti «Scarica» del sito puntano a `releases/latest`, ancora vuota) dopo la prova della Personal edition; pagina 404 (oggi gli indirizzi inesistenti mostrano la home); `publiccode.yml` definitivo.

### 7.1 Verifica del 3/11/2026

- **Nessuna modifica** ai contenuti dopo il 1/11/2026. La cartella non è un repository git.
- **Test dell'estensione (unit)**: 50/50 superati con Node 22. Test DOM ed e2e non eseguiti (Playwright non installato).
- **Test del server e dello strumento dei custodi**: non eseguiti (PyPI non raggiungibile dal PC di lavoro, pytest assente). Da eseguire sulla VM di prova.
- Confermato nel codice: `PUT` nei metodi CORS del server (problema n. 1 risolto).
- **Ancora aperto (Enterprise)**: l'host del server non è in `host_permissions` del `manifest.json` (solo in `optional_host_permissions`): va aggiunto prima di impacchettare l'estensione per l'ente (`extension/README.md` §2.2).
- **Problemi aperti** in `docs/PROBLEMI-RILEVATI.md`: n. 4 (pulizia tracce Langfuse v4, da provare), 5 (app desktop di Rizzo-PII e CORS), 6 (rischio residuo root, dichiarato), 12 (tag delle immagini), 13 (Podman), 14 (mapper di audience Keycloak). I n. 1-3 e 7-11 sono risolti ma restano nella tabella «Aperti» per tracciabilità: da spostare tra i risolti dopo la prova.
- **[DA VERIFICARE]**: 145 occorrenze in 26 file Markdown (docs, governance, manuale, README).
- **Segnaposto ancora presenti nel sito**: `ORG/pseudogate` (repository) e testi «segnaposto» in privacy, enterprise-edition, strumenti-e-download, scelte-di-progetto e altre pagine.
- `Gateway_LLM_PA_Piano_d_azione.docx` (30/10/2026) è **superato** in più punti (memoria attiva, dizionario cifrato sul server, errori del server che bloccano l'invio): prevale `DECISIONI.md`. Aggiornarlo o archiviarlo.

### 7.2 Prossimi passi, nell'ordine

1. **Prova della Personal edition**: installare l'app desktop di Rizzo-PII e l'estensione; verificare che il servizio locale risponda all'estensione (se no, fork di Rizzo-PII); lanciare lo script di verifica dei selettori su claude.ai (`extension/dev/verifica-sito-reale/`). Prima, `npm install` in `extension/` per i test DOM/e2e.
2. Correggere con gli agenti ciò che emerge dalla prova.
3. Prova dell'Enterprise edition su una VM di prova (`docs/installazione-ente.md`, `docs/verifica-pilota.md`), compresi i test `pytest` di `server/` e `tools/custodi/` e l'aggiunta dell'host del server a `host_permissions`.
4. Inviare la lettera ad Anthropic.
5. Verifiche dall'Italia: catalogo ACN e lista DPF.
6. Adempimenti prima del pilota: DPIA con il DPO, accordo sindacale o autorizzazione dell'Ispettorato, informativa, regolamento, generazione della chiave di custodia.
7. Link del Chrome Web Store e prima release su GitHub.

## 8. Note di metodo

- L'utente preferisce che il lavoro venga svolto da **agenti** (sub-agenti), per non saturare la conversazione principale.
- Prima di produrre documenti, discutere le scelte in chat.
- I file di riferimento per gli agenti sono `DECISIONI.md` (prevale) e `SPEC.md`.

## 9. Come ripartire con gli agenti in una nuova conversazione

La conversazione originale non sarà più accessibile: tutto ciò che serve è in questo archivio. Gli agenti della sessione precedente non esistono più, quindi vanno rilanciati da zero con le istruzioni qui sotto.

### 9.1 Avvio della nuova sessione

1. Apri una nuova conversazione con Claude (Cowork, o Claude Code) e allega `pseudomania.zip`, oppure collega la cartella in cui l'hai estratto.
2. Incolla questo messaggio iniziale:

> Stiamo sviluppando Pseudomania. Estrai l'archivio allegato in una cartella di lavoro e leggi nell'ordine: `RIEPILOGO.md`, `DECISIONI.md` (prevale su tutto), `SPEC.md`, `docs/PROBLEMI-RILEVATI.md`, `manuale/DA-AGGIORNARE.md`. Lavora sempre tramite agenti (sub-agenti), per non saturare questa conversazione: tu coordini, gli agenti producono. Prima di cambiare decisioni o produrre documenti nuovi, discuti con me in chat. Poi dimmi in poche righe lo stato del progetto e proponi il prossimo passo.

3. Per ogni nuovo lavoro, descrivi cosa vuoi; Claude lancerà gli agenti secondo i ruoli sotto.

### 9.2 Regole comuni per tutti gli agenti

Da includere (o far includere) in ogni incarico:

- Leggere prima `DECISIONI.md` (vincolante; contiene anche la sezione "Deviazioni") e `SPEC.md` (contratto tecnico).
- Lavorare **solo nella propria cartella**; segnalare, non correggere, i problemi trovati in cartelle altrui (in `docs/PROBLEMI-RILEVATI.md` o nel rapporto finale).
- Se un cambiamento tocca il contratto tra estensione e server, scriverlo in `DECISIONI.md` sotto "Deviazioni" e avvisare il coordinatore; `SPEC.md` lo aggiorna solo l'agente server.
- Testi visibili in **italiano**; nome **Pseudomania**; edizioni **Personal edition** / **Enterprise edition**; sito https://pseudomania.statocritico.it.
- Licenza AGPL-3.0-or-later per il codice nuovo; solo componenti open source con licenze compatibili.
- Eseguire i test esistenti prima di consegnare; dichiarare sempre cosa è stato verificato e cosa no; segnare `[DA VERIFICARE]` i fatti non controllati su fonti aperte.
- Mai inserire chiavi private nel repository (la chiave dell'estensione va generata dall'ente: vedi `extension/README.md`).
- Rapporto finale breve: file modificati, test eseguiti e risultati, punti non verificati, incongruenze.

### 9.3 Ruoli degli agenti

| Agente | Cartelle | Compiti tipici | File da leggere |
|---|---|---|---|
| **Estensione** | `extension/` | Selettori claude.ai, cifratura nel browser, Personal edition con Rizzo-PII desktop, pannello, test (unit, DOM, e2e con Playwright) | `extension/README.md`, `src/sites/claude.js`, `dev/` |
| **Server e stack** | `server/`, `deploy/`, `tools/custodi/`, `collaudo/`, `SPEC.md`, `THIRD_PARTY_NOTICES.md` | API, archivio chiavi, durate e pulizie, Langfuse, backup, strumento dei custodi, corpus di prova | `deploy/.env.example`, `deploy/VERSIONS.md`, `server/tests/` |
| **Documentazione tecnica** | `docs/` | Installazione Enterprise, configurazione esterna (Claude Team, IdP, Chrome, MDM, proxy), Personal edition, custodi, verifica del pilota, problemi aperti | tutto `deploy/`, `extension/README.md`, `tools/custodi/` |
| **Governance** | `governance/` | Regolamento e allegati, DPIA, checklist, verifiche della fase 0, lettera ad Anthropic, policy light; rigenerare i .docx con pandoc (`reference-a4.docx`) | `DECISIONI.md`, fonti citate nelle sezioni "Riferimenti" |
| **Sito** | `site/` | Pagine sorgente in `site/_build/` (non modificare le pagine generate), rigenerare con `python3 site/_build/genera.py`, controlli Playwright a 1280/375/360 px chiaro/scuro | `site/PUBBLICAZIONE.md` |
| **Manuale** | `manuale/` | Manuale e guide rapide, build con `manuale/build/build.sh` e `build-guide.sh` (DOCX + PDF) | `manuale/DA-AGGIORNARE.md`, `extension/src/shared/` (testi dell'interfaccia) |
| **Ricerca** (all'occorrenza) | nessuna, solo rapporto | Verifiche normative o di prodotto con fonti aperte | — |

### 9.4 Ordine consigliato dei lavori (dipendenze)

1. Estensione e server in parallelo (condividono il contratto in `DECISIONI.md`/`SPEC.md`).
2. Poi documentazione tecnica (dipende dai file reali di `deploy/` ed `extension/`).
3. Poi manuale e sito (dipendono da docs e dai testi dell'interfaccia).
4. Governance in parallelo a tutto, quando cambiano decisioni o durate.

### 9.5 Modelli di incarico pronti

**Dopo la prova della Personal edition:**
> Agente Estensione: leggi le regole in `RIEPILOGO.md` §9.2. Ecco il resoconto della prova reale con Rizzo-PII desktop e claude.ai: [incollare esito, rapporto dello script `extension/dev/verifica-sito-reale/`, errori della console]. Correggi i selettori e il collegamento a Rizzo-PII; se Rizzo-PII non risponde all'estensione, prepara il fork minimo di Rizzo-PII (solo header CORS o modifica necessaria) in una nuova cartella `rizzo-pii-fork/` e documentalo. Aggiorna i test e il README.

**Dopo la prova dell'Enterprise edition su VM:**
> Agente Server e stack: leggi le regole in `RIEPILOGO.md` §9.2. Ecco gli esiti della prova su VM: [log di `docker compose`, errori, esito di `docs/verifica-pilota.md`]. Correggi `server/`, `deploy/`, `tools/custodi/`; aggiorna `SPEC.md` e segna in `docs/PROBLEMI-RILEVATI.md` i problemi risolti.

**Allineamento a valle:**
> Agente Documentazione (poi Manuale, poi Sito): leggi le regole in `RIEPILOGO.md` §9.2 e le modifiche recenti in `DECISIONI.md` e `SPEC.md`; allinea la tua cartella al codice attuale, rigenera i formati derivati, aggiorna `DA-AGGIORNARE.md` / `PROBLEMI-RILEVATI.md`.

### 9.6 Avvertenze pratiche

- Gli agenti possono interrompersi per limiti d'uso: in tal caso basta chiedere a Claude di "riprendere" lo stesso incarico; i file già scritti restano.
- Nell'ambiente cloud di Claude alcuni registri (Docker Hub, PyPI, npm) possono essere bloccati: i container e alcune dipendenze vanno provati sulla vostra VM o sul vostro PC.
- Prima di ogni consegna chiedere a Claude di impacchettare tutto in uno zip e di aggiornare questo `RIEPILOGO.md`.
