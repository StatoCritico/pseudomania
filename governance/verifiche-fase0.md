---
title: "Verifiche di fase 0 – fornitore, trasferimenti, licenze"
subtitle: "Pseudomania – BOZZA – esiti di ricerche su fonti pubbliche, da confermare con Anthropic e con il RPD"
lang: it-IT
---

> **BOZZA 0.2 del 31/10/2026** (aggiornata alle decisioni dell'Ente del 31/10/2026: memoria spenta,
> ricerca web attiva, cifratura lato client, lettera ad Anthropic dopo la prova tecnica). Verifiche svolte su fonti pubbliche il 30-31/10/2026. Le pagine di
> Anthropic cambiano spesso (alcune riportano solo "aggiornato oggi"/"questa settimana" senza data):
> ogni esito va **ricontrollato e salvato in PDF** alla data di sottoscrizione.
>
> Legenda stato: **verificato** (fonte primaria aperta) · **parzialmente** (fonte secondaria o
> informazione incompleta) · **non verificabile da fonti pubbliche → chiedere ad Anthropic**.
>
> Pagine che non è stato possibile aprire da questo ambiente (blocco di rete o permesso non
> concesso): `catalogocloud.acn.gov.it` (catalogo ACN, accessibile solo da IT/DE/FR/CH/AT),
> `www.dataprivacyframework.gov/list`, `trust.anthropic.com/subprocessors` (pagina caricata via
> JavaScript), file *raw* di GitHub.

# Sintesi

| # | Verifica | Esito in breve | Stato |
|---|---|---|---|
| 1 | Qualificazione ACN di Claude Team | Nessuna evidenza pubblica di qualificazione; catalogo non consultabile da qui | non verificabile → **verifica diretta sul catalogo dall'Italia** + chiedere ad Anthropic |
| 2a | Certificazione DPF di Anthropic | Né il DPA né il Privacy Center di Anthropic menzionano il DPF; elenco ufficiale non aperto | non verificabile → chiedere ad Anthropic + controllo sull'elenco ufficiale |
| 2b | Entità contraente per clienti SEE | **Anthropic Ireland, Limited** (Commercial Terms) | verificato |
| 2c | Meccanismo di trasferimento | **Clausole contrattuali tipo** (moduli 2 e 3, legge irlandese) nel DPA | verificato |
| 3a | Sub-responsabili | Elenco ricavato da fonte secondaria (AWS, Google Cloud, Azure, Cloudflare, WorkOS, ElevenLabs, Brave Search, ...) | parzialmente |
| 3b | Conservazione chat Team | Conservazione **illimitata per default**; conservazione personalizzata solo Enterprise; tempi di cancellazione dal back-end non indicati | parzialmente → chiedere ad Anthropic |
| 3c | Feedback | Feedback conservati **fino a 5 anni** e utilizzabili per l'addestramento (de-associati dagli ID); disattivabili dall'organizzazione ("Rate chats") | verificato |
| 3d | Esportazione delle conversazioni dei membri | **Sì**: il *Primary Owner* dei piani Team ed Enterprise può esportare conversazioni e dati utente dell'intera organizzazione | verificato |
| 4a | DFKI Privacy Guardrail (Apache-2.0 + TERMS.md) vs AGPL | Nessun conflitto rilevato: i TERMS dichiarano che i diritti derivano solo da Apache-2.0, che prevale; non impongono vincoli ai redistributori | verificato (valutazione giuridica da confermare) |
| 4b | Rizzo-PII | Codice MIT; immagine con PyMuPDF = AGPL-3.0 se redistribuita; pesi MIT; backbone MIT; dataset con licenze eterogenee (uno senza licenza dichiarata) | verificato (fonte: documentazione del progetto) |
| 5 | Termini Anthropic e estensioni del browser | Nessuna clausola specifica sulle estensioni; divieti pertinenti: aggirare *guardrail*, *reverse engineering*, *proxy* non autorizzati | parzialmente → **lettera di conferma ad Anthropic** |

# 1. Qualificazione ACN del servizio cloud

**Domanda.** Claude Team (o Anthropic come fornitore SaaS) è presente nel Catalogo dei servizi cloud
qualificati per la PA dell'ACN? Lo sono i fornitori infrastrutturali sottostanti?

**Esito.**

- Il catalogo ufficiale è indicato su `https://catalogocloud.acn.gov.it/`, consultabile **solo da
  Italia, Germania, Francia, Svizzera e Austria**; da questo ambiente non è stato possibile aprirlo.
- Ricerche web mirate ("Anthropic"/"Claude" + "qualificazione ACN"/"QC1") non hanno restituito alcun
  annuncio o documento di qualificazione di Anthropic o Claude. Esistono invece comunicazioni di
  qualificazione di altri fornitori (es. AWS per livelli QI2/QC2, relativi a **infrastruttura**,
  non a Claude).
- La qualificazione di AWS/Google/Azure come infrastruttura **non** si estende automaticamente al
  servizio SaaS di un terzo che vi è ospitato: il SaaS va qualificato a sé
  `[DA VERIFICARE con il RTD sul Regolamento unico, d.d. ACN n. 21007/24]`.
- Una FAQ di gara di un comune (luglio 2026) conferma che, nella prassi, la "certificazione ACN" di
  un SaaS si dimostra con il riferimento alla scheda nel catalogo e che le certificazioni ISO non la
  sostituiscono.

**Stato.** Non verificabile da fonti pubbliche da questo ambiente. Probabile assenza
(nessuna evidenza), da confermare.

**Azioni.** (a) Il RTD consulta il catalogo dall'Italia e salva l'esito (ricerca "Anthropic",
"Claude"); (b) domanda ad Anthropic (sotto); (c) se il servizio non è qualificato, il RPD/RTD
valutano se l'uso è consentito per la classe di dati trattati (dati "ordinari") e con quali
condizioni, e lo documentano nella DPIA.

**Domanda per Anthropic (EN).**
> Is Claude Team (claude.ai, Claude for Work) qualified, or in the process of qualification, in the
> Italian National Cybersecurity Agency (ACN) catalogue of cloud services qualified for the Public
> Administration (Regolamento unico, Decreto Direttoriale ACN n. 21007/24)? If so, at which level
> (e.g. QC1) and under which catalogue entry? If not, is there an Italian reseller/partner offering
> a qualified service that includes Claude?

**Fonti aperte.**

- Zoom, pagina ACN (riporta il link e la limitazione geografica del catalogo):
  https://www.zoom.com/it/trust/legal-compliance/acn/
- FAQ di gara Comune di Rho (28/07/2026):
  https://www.comune.rho.mi.it/it-it/download/faq-al-28-07-2026-169286-2-1365-1ea6188b67426720908343f214a2d3f4
- QuiFinanza, Regolamento unico ACN:
  https://quifinanza.it/innovazione/regolamento-unico-infrastrutture-servizi-cloud/832868/

# 2. Data Privacy Framework, entità contraente, meccanismo di trasferimento

**Domande.** Anthropic è certificata nel quadro EU-US Data Privacy Framework? Con quale entità
contrattano i clienti UE del piano Team? Quale meccanismo di trasferimento si applica?

**Esito.**

- **Entità contraente: Anthropic Ireland, Limited** per i clienti con sede nel SEE, in Svizzera o
  nel Regno Unito (preambolo dei Commercial Terms; data di efficacia indicata: 17/06/2025). Per gli
  altri clienti, Anthropic PBC.
- I Commercial Terms (sez. C) rinviano al **Data Processing Addendum**, che prevede le **clausole
  contrattuali tipo UE** (modulo 2 titolare→responsabile e modulo 3 responsabile→responsabile, legge
  e foro irlandesi), oltre all'Addendum UK e svizzero. Il DPA (efficace dal 24/02/2025) **non
  menziona il DPF**.
- Il Privacy Center di Anthropic (articolo sul GDPR) indica come strumenti per i trasferimenti fuori
  dal SEE le **decisioni di adeguatezza** e le **SCC**, senza menzionare il DPF.
- L'elenco ufficiale `dataprivacyframework.gov/list` non è stato aperto; nessuna fonte secondaria
  consultata attesta una certificazione DPF di Anthropic.

**Stato.** Entità e meccanismo contrattuale: **verificati**. Certificazione DPF: **non
verificabile** da qui; in assenza di certificazione il trasferimento si fonda sulle **SCC**, che
richiedono una **valutazione d'impatto del trasferimento (TIA)** documentata dall'Ente.

**Domanda per Anthropic (EN).**
> Please confirm (1) that for a customer established in Italy the Claude Team subscription is
> contracted with Anthropic Ireland, Limited; (2) whether Anthropic PBC (and any other Anthropic
> entity processing Customer Personal Data) is self-certified under the EU-U.S. Data Privacy
> Framework, and for which data (HR / non-HR); (3) that transfers from Anthropic Ireland, Limited to
> Anthropic PBC and to sub-processors are covered by the EU Standard Contractual Clauses as set out
> in the DPA; (4) whether you can provide a transfer impact assessment or supporting documentation
> on government access requests (e.g. a transparency report) for our TIA.

**Fonti aperte.**

- Anthropic, Commercial Terms of Service: https://www.anthropic.com/legal/commercial-terms
- Anthropic, Data Processing Addendum: https://www.anthropic.com/legal/data-processing-addendum
- Anthropic Privacy Center, *How do you handle GDPR and similar data protection laws*:
  https://privacy.claude.com/en/articles/10458704-how-do-you-handle-gdpr-and-similar-data-protection-laws

# 3. Sub-responsabili, conservazione, feedback, esportazione

## 3a. Elenco dei sub-responsabili

**Esito.** La pagina ufficiale (`anthropic.com/subprocessors`) reindirizza al Trust Center
(`trust.anthropic.com/subprocessors`), il cui contenuto non è leggibile senza JavaScript. Da una
fonte secondaria che archivia la pagina (cattura del 15/10/2026, invariata al 21/10/2026):

| Sub-responsabile | Funzione | Localizzazione | Rilevanza per il pilota |
|---|---|---|---|
| Amazon Web Services | Infrastruttura cloud | Mondiale | Sì |
| Google Cloud Platform | Infrastruttura cloud | Mondiale | Sì |
| Microsoft Azure | Infrastruttura cloud | Mondiale | Sì |
| Cloudflare | Instradamento / CDN | Mondiale | Sì |
| WorkOS | SSO e sicurezza | n.d. | Sì (SSO Claude for Work) |
| Stripe | Fatturazione | USA | Solo dati di fatturazione |
| Intercom, Boldr (CA), Nutun (ZA) | Assistenza utenti | vari | Solo se si apre un ticket |
| Twilio | Analisi, e-mail, SMS | USA | Da chiarire |
| ElevenLabs | Sintesi vocale | n.d. | No (voce disattivata) |
| Brave Search | Ricerca web | n.d. | **Sì: la ricerca web è attiva** (decisione dell'Ente) |
| Arkose Labs | Prevenzione abusi | n.d. | Possibile |

**Ricerca web (decisione dell'Ente: ATTIVA).** Le query, generate dal modello a partire da testi
pseudonimizzati, sono elaborate da un sub-fornitore di ricerca. Misure decise: (a) verifica del
sub-fornitore di ricerca e della sua localizzazione (domanda Q10 ad Anthropic); (b) informativa ai
dipendenti; (c) regola d'uso: nessun dato personale nelle richieste di ricerca (Regolamento, art. 5,
n. 8); (d) misura, nel pilota, della frequenza di query con dati sfuggiti (DPIA, rischio R15).

**Stato.** Parzialmente verificato (fonte secondaria). Scaricare l'elenco ufficiale dal Trust Center
da un browser e allegarlo alla DPIA.

## 3b. Conservazione delle chat sul piano Team

**Esito.**

- Privacy Center, *How long do you store my organization's data?*: per i prodotti commerciali
  "per default i dati sono conservati **a tempo indeterminato**, salvo che sia impostato un periodo di
  conservazione personalizzato"; la conservazione personalizzata è **riservata al piano Enterprise**.
  I dati cancellati sono rimossi dal back-end, ma la pagina **non indica i tempi**.
- *Can you delete data that I sent via Claude for Work?*: la cancellazione di una chat la rimuove
  dalla cronologia visibile; i dati nel back-end sono conservati come descritto nell'articolo sopra.
- I contenuti segnalati per violazione della Usage Policy sono conservati secondo un articolo
  separato, non consultato; durata non indicata nelle pagine aperte.
- La documentazione di Claude Code indica 30 giorni per i dati commerciali, ma riguarda **Claude
  Code**, non le chat di claude.ai: non va usata per il piano Team.

**Stato.** Parzialmente verificato → chiedere ad Anthropic i tempi esatti.

## 3c. Feedback

**Esito.** Privacy Center, *Is our data used for model training?*: per i prodotti commerciali
Anthropic non addestra i modelli su input e output per default, **salvo che l'utente invii
esplicitamente feedback o segnalazioni**. I feedback possono essere usati anche per l'addestramento,
dopo essere stati de-associati dagli ID di utente e cliente, e sono conservati **fino a 5 anni**.
**Primary Owner e Owner possono disattivare i feedback** per l'organizzazione con l'impostazione
*Rate chats* (Organization settings > Data and Privacy). Anche i Commercial Terms (sez. A.3)
consentono ad Anthropic di usare i feedback liberamente; la sez. B vieta l'addestramento sui
contenuti del cliente.

**Stato.** Verificato. **Nuova misura:** disattivare *Rate chats* nella console Team.

## 3d. Esportazione delle conversazioni da parte degli amministratori (rischio R4b)

**Esito.** Help Center, *Export your organization's data*: l'esportazione dei dati dell'organizzazione
è disponibile **solo per il Primary Owner dei piani Team ed Enterprise** e comprende "i dati delle
conversazioni e i dati utente dell'organizzazione", quindi **le conversazioni di tutti i membri**
(esclusi i progetti cancellati e i file Office/PDF generati da Claude). Gli Owner possono inoltre
consentire ai membri di esportare i propri dati.

**Implicazioni.** Il Primary Owner può ottenere le conversazioni nominative di ogni dipendente
(pseudonimizzate, ma associate all'account). Questo aggira il modello dei custodi e ricade nell'art. 4
L. 300/1970. Misure: affidare il ruolo di Primary Owner a un account di servizio custodito con doppio
controllo (credenziali divise tra due custodi, MFA); vietare l'esportazione salvo richiesta
dell'Autorità giudiziaria con verbale; includere l'esportazione nell'accordo sindacale.

**Stato.** Verificato. Chiedere ad Anthropic se l'esportazione genera un evento registrato e
notificato, visto che sul piano Team non ci sono log di audit.

**Domande per Anthropic (EN).**
> (1) Please provide the current list of sub-processors applicable to Claude Team (claude.ai) for a
> customer in the EEA, including processing locations, and confirm how we will be notified of
> changes. (2) For Claude Team: after a member deletes a conversation (or a project), within how many
> days is it permanently removed from your back-end systems and backups? What is the retention of
> conversations that are not deleted, of Claude memory, of project knowledge files, and of content
> flagged by trust & safety classifiers? (3) Please confirm that disabling "Rate chats" prevents
> any conversation content from being submitted as feedback, and whether other paths (e.g. bug
> reports, support tickets) can transmit conversation content. (4) When the Primary Owner exports
> organization data, is the export logged and visible to other owners, and can the export function
> be disabled or restricted on the Team plan? (5) Is web search processed by a third-party
> sub-processor, and can it be disabled organization-wide on Team?

**Fonti aperte.**

- Anthropic, sub-processors (reindirizzamento al Trust Center): https://www.anthropic.com/subprocessors
- ConductAtlas, archivio dell'elenco sub-responsabili Anthropic (fonte secondaria):
  https://conductatlas.com/platform/anthropic/anthropic-sub-processors/
- Privacy Center, conservazione dei dati dell'organizzazione:
  https://privacy.claude.com/en/articles/10440198-how-long-do-you-store-my-organization-s-data
- Privacy Center, cancellazione dati Claude for Work:
  https://privacy.claude.com/en/articles/9796617-can-you-delete-data-that-i-sent-via-claude-for-work-team-enterprise-plans
- Privacy Center, uso dei dati per l'addestramento:
  https://privacy.claude.com/en/articles/7996868-is-our-data-used-for-model-training
- Help Center, esportazione dei dati dell'organizzazione:
  https://support.claude.com/en/articles/13346720-export-your-organization-s-data
- Claude Code, *Data usage* (solo per escludere che i 30 giorni valgano per claude.ai):
  https://code.claude.com/docs/en/data-usage

# 4. Compatibilità delle licenze

## 4a. DFKI Privacy Guardrail: Apache-2.0 + TERMS.md vs redistribuzione modificata in AGPL-3.0

**Domanda.** I *Nutzungsbedingungen / Terms of Use* (TERMS.md) del DFKI ostacolano la
redistribuzione di una versione modificata sotto AGPL-3.0-or-later?

**Esito della lettura di TERMS.md** (versione tedesca vincolante; consultata quella inglese):

- § 1(2): i diritti d'uso derivano **esclusivamente dalla licenza Apache 2.0**; § 1(3): in caso di
  contrasto con disposizioni inderogabili di Apache 2.0, **prevale Apache 2.0**.
- § 10(2): chi crea o redistribuisce versioni modificate lo fa sotto la propria responsabilità; il DFKI
  non risponde di tali versioni. **Non** c'è obbligo di allegare i TERMS né di farli accettare ai
  destinatari a valle.
- § 2: il software è descritto come strumento di ricerca non commerciale, in versione beta, non come
  prodotto di conformità; § 4: non deve essere l'unica misura di protezione dove una divulgazione
  accidentale ha conseguenze gravi. Sono descrizioni e avvertenze, **non divieti d'uso**. Nessuna
  autorizzazione è richiesta per l'uso pubblico o in produzione.
- § 9(2): nome, logo e segni distintivi del DFKI non sono concessi con Apache 2.0; servono consenso
  scritto del DFKI.
- § 7: limitazioni di responsabilità, esclusi espressamente i danni da dati personali non rilevati.
- § 14: legge tedesca; per enti di diritto pubblico **foro esclusivo di Kaiserslautern** (vale nel
  rapporto tra DFKI e chi usa il software DFKI).

**Valutazione.**

1. Apache-2.0 è compatibile con GPLv3 (FSF); l'AGPLv3 ha le stesse condizioni di GPLv3 più il § 13,
   quindi il codice Apache-2.0 può confluire in un'opera AGPL-3.0, purché si rispettino gli obblighi
   Apache (§ 4: copia della licenza, avvisi di modifica nei file, conservazione del NOTICE). La
   compatibilità con AGPLv3 non è dichiarata espressamente nella pagina FSF consultata: è una
   deduzione `[DA VERIFICARE con un legale]`.
2. I TERMS sono un contratto tra DFKI e utente, non una "restrizione ulteriore" che segue il codice
   (AGPL § 7, § 10): non ne impongono la trasmissione e cedono il passo ad Apache-2.0. **Nessun
   conflitto rilevato.**
3. Il NOTICE di Pseudomania (`extension/NOTICE`) già conserva il NOTICE originale, elenca i file
   derivati e le modifiche, include la licenza Apache e non usa nome e logo DFKI nell'interfaccia:
   è coerente con Apache § 4 e TERMS § 9.
4. Raccomandazioni: (a) mantenere nei file portati l'intestazione di provenienza; (b) non usare
   "Privacy Guardrail"/"DFKI" in nome, icone o materiali promozionali (la menzione di provenienza nel
   NOTICE è ammessa); (c) verificare che nessun file di THIRD_PARTY_NOTICES del DFKI sia necessario
   (modello ONNX e WASM rimossi); (d) informare il DFKI per cortesia del fork.

**Stato.** Verificato sul testo dei TERMS (valutazione giuridica da far confermare).

## 4b. Rizzo-PII

**Esito** (wiki del progetto, `THIRD_PARTY_LICENSES.md` verificato dal progetto il 09/08/2026,
model card su Hugging Face):

| Componente | Licenza | Implicazione |
|---|---|---|
| Codice sorgente | MIT | Nessun vincolo di copyleft |
| PyMuPDF (redazione PDF) | AGPL-3.0 o commerciale (Artifex) | L'immagine Docker costruita lo contiene, quindi è **AGPL-3.0 se redistribuita**; § 13 se modificata e offerta in rete |
| Pesi `rizzoaiacademy/rizzo-pii-0.3B` | MIT | Libera redistribuzione con avviso |
| Backbone `jhu-clsp/mmBERT-base` | MIT | Come sopra |
| Dataset Ai4Privacy (open-pii-masking-500k) | CC-BY-4.0 | **Attribuzione** richiesta |
| Dataset DeepMount00/pii-masking-ita | **Nessuna licenza dichiarata** | Incertezza: il progetto ridistribuisce solo i pesi, non i dati; rischio basso ma non nullo |
| Altre fonti di addestramento | Non nominate | Da chiarire con l'autore |
| Pacchetti Apache-2.0 (torch, transformers, ...) | Apache-2.0 | Conservare i NOTICE |

**Implicazioni per l'Ente.**

1. L'uso interno (immagine costruita e usata sulla VM dell'Ente) non è "distribuzione". Il § 13 AGPL
   si applica se l'Ente **modifica** Rizzo-PII o PyMuPDF e gli utenti vi interagiscono in rete:
   andrebbe offerto il sorgente ai dipendenti. L'Ente pubblica comunque il codice (art. 69 CAD,
   AGPL di Pseudomania), quindi l'obbligo è assolto pubblicando le modifiche.
2. Se l'Ente o il riuso da parte di altre PA comporta la **redistribuzione dell'immagine** Docker,
   questa è AGPL-3.0: va fornito il sorgente corrispondente (Dockerfile, versioni, eventuali patch).
3. Pseudomania include in `server/pseudogate/vendor/rizzo_pdf/` codice MIT di Rizzo-PII e usa
   direttamente PyMuPDF (AGPL), compatibile con la licenza AGPL-3.0-or-later di Pseudomania
   (cfr. `deploy/VERSIONS.md`).
4. Aggiungere a `deploy/VERSIONS.md` o a un NOTICE l'attribuzione CC-BY-4.0 di Ai4Privacy e la
   licenza MIT dei pesi (compito di chi cura `deploy/`, segnalato al coordinatore).

5. **Personal edition**: l'estensione usa l'**app desktop** di Rizzo-PII in locale
   (`127.0.0.1:5005`). I binari desktop sono distribuiti dal progetto sotto AGPL-3.0 (includono
   PyMuPDF): l'utente li installa e usa senza obblighi; gli obblighi di sorgente scattano solo se
   Pseudomania redistribuisse quei binari o un fork di Rizzo-PII (ipotesi CORS, da documentare e non
   ancora decisa). La Personal edition è fuori dai trattamenti dell'Ente.

**Stato.** Verificato sulle fonti del progetto.

**Fonti aperte.**

- DFKI, repository: https://github.com/dfki-dsa/pii-guardrail-browser-extension
- DFKI, TERMS.md: https://github.com/dfki-dsa/pii-guardrail-browser-extension/blob/main/TERMS.md
- FSF, *Various Licenses and Comments about Them*: https://www.gnu.org/l/license-list.html
- Rizzo-PII, wiki: https://github.com/Rizzo-AI-Academy/rizzo-pii/wiki
- Rizzo-PII, THIRD_PARTY_LICENSES.md:
  https://github.com/Rizzo-AI-Academy/rizzo-pii/blob/main/THIRD_PARTY_LICENSES.md
- Rizzo-PII, releases: https://github.com/Rizzo-AI-Academy/rizzo-pii/releases
- Hugging Face, model card: https://huggingface.co/rizzoaiacademy/rizzo-pii-0.3B

# 5. Termini di Anthropic ed estensioni del browser

**Domanda.** I Commercial Terms o la Usage Policy dicono qualcosa sulle estensioni del browser che
modificano l'input dell'utente su claude.ai?

**Esito.**

- **Commercial Terms** (efficaci dal 17/06/2025): nessuna clausola sulle estensioni del browser.
  Clausole pertinenti: D.4(b) vieta di "reverse engineer or duplicate the Services"; D.2 impone il
  rispetto della Usage Policy; I.3.a consente la sospensione per "risk to or attack on any of the
  Services" o per violazioni di D.1, D.2 e D.4.
- **Usage Policy** (pagina che riporta data di efficacia 12/11/2026, `[DA VERIFICARE: versione in
  vigore alla data di sottoscrizione]`): vieta di "intentionally bypass or interfere with
  capabilities, restrictions, or guardrails established within our products" (es. *jailbreaking*,
  *prompt injection*) senza autorizzazione; vieta di rivendere o fare da *proxy* a Claude con mezzi
  non autorizzati; vieta l'automazione nella creazione di account o per comportamenti di spam. Le
  estensioni non sono menzionate.

**Valutazione.** Pseudomania non aggira le protezioni del modello, non automatizza l'accesso e non
rivende il servizio. L'istruzione aggiunta ("riporta i segnaposto senza modificarli") è un'istruzione
dell'utente, non un *prompt injection*. Restano però elementi tecnici che è prudente dichiarare:
l'estensione **modifica il testo e gli allegati prima dell'invio**, **intercetta `fetch`/`XMLHttpRequest`
nella pagina** come rete di sicurezza (`extension/src/content/page-hook.js`) e **modifica il DOM** per
ripristinare i valori. Un cambiamento dell'interfaccia o dei controlli anti-abuso di claude.ai potrebbe
interpretare questi comportamenti come anomali. Il rischio è contrattuale (sospensione) e operativo,
non di protezione dei dati: si chiede una **conferma scritta** ad Anthropic.

**Stato.** Parzialmente verificato → lettera di conferma, **da inviare dopo la prova tecnica** con il servizio reale (decisione dell'Ente), così da descrivere il comportamento effettivo dell'estensione.

**Fonti aperte.**

- Anthropic, Commercial Terms of Service: https://www.anthropic.com/legal/commercial-terms
- Anthropic, Usage Policy: https://www.anthropic.com/aup

## 5.1 Lettera di richiesta di conferma (italiano)

> **Oggetto:** Richiesta di conferma sull'uso di un'estensione del browser per la pseudonimizzazione
> con Claude Team – `[Ente]`
>
> Gentili,
>
> `[Ente]`, pubblica amministrazione italiana, è titolare di un abbonamento Claude Team
> (organizzazione `[ID/nome organizzazione]`, `[N]` postazioni) contratto con Anthropic Ireland,
> Limited secondo i Commercial Terms of Service e il Data Processing Addendum.
>
> Per ridurre il rischio di comunicare dati personali al servizio, abbiamo provato con esito positivo
> `[data della prova tecnica]` e intendiamo adottare
> **Pseudomania**, software open source (AGPL-3.0) sviluppato dall'Ente, composto da:
>
> 1. un'estensione di Google Chrome installata e gestita centralmente sui browser dell'Ente, attiva
>    solo su claude.ai, che prima dell'invio sostituisce nel testo dei messaggi, negli allegati
>    (PDF, DOCX, XLSX) e nei file e istruzioni dei Progetti i dati personali con segnaposto (es.
>    `[FULLNAME_1]`) e, nelle risposte, ripristina localmente nel browser i valori originali;
> 2. un server interno all'Ente, che rileva i dati personali; la corrispondenza tra segnaposto e
>    valori è cifrata nel browser con una chiave dell'utente e il server ne conserva solo la versione
>    cifrata.
>
> Nella nostra organizzazione la memoria di Claude è disattivata e la ricerca web è attiva.
>
> L'estensione: (a) modifica il contenuto del campo di input e dei file prima che l'utente li invii
> tramite l'interfaccia ordinaria di claude.ai; (b) aggiunge una breve istruzione affinché Claude
> riporti i segnaposto senza modificarli; (c) come misura di sicurezza intercetta nella pagina le
> chiamate `fetch`/`XMLHttpRequest` dirette a claude.ai per verificare che il contenuto sia già
> pseudonimizzato, bloccandolo in caso contrario; (d) modifica la visualizzazione delle risposte nel
> DOM. Non automatizza l'accesso, non crea account, non usa API non documentate per conto di terzi,
> non aggira limiti di utilizzo né le protezioni di sicurezza del modello e non rivende il servizio.
> Ogni messaggio è scritto e inviato da un dipendente autenticato tramite SSO.
>
> Vi chiediamo di confermare per iscritto:
>
> 1. che l'uso descritto è compatibile con i Commercial Terms e la Usage Policy e non costituisce
>    motivo di sospensione dell'account;
> 2. se l'intercettazione lato client delle richieste o la modifica del DOM possono interferire con
>    i vostri sistemi anti-abuso, e se esiste un canale per ricevere preavviso di modifiche
>    dell'interfaccia di claude.ai rilevanti per estensioni di questo tipo;
> 3. le informazioni richieste in allegato su: qualificazione ACN, certificazione DPF e meccanismo di
>    trasferimento, elenco dei sub-responsabili, tempi di conservazione e cancellazione delle chat sul
>    piano Team, feedback, esportazione dei dati da parte del Primary Owner, ricerca web.
>
> Restiamo a disposizione per una descrizione tecnica dettagliata o una dimostrazione; il codice
> sorgente è disponibile su `[URL repository]`.
>
> Cordiali saluti,
>
> `[Nome, ruolo]` – `[Ente]` – `[PEC / e-mail]`
>
> In copia: Responsabile della protezione dei dati `[e-mail]`

## 5.2 Confirmation request letter (English)

> **Subject:** Request for confirmation – browser extension for pseudonymisation used with Claude
> Team – `[Public body]`
>
> Dear Anthropic team,
>
> `[Public body]`, an Italian public administration, holds a Claude Team subscription (organisation
> `[org ID/name]`, `[N]` seats) contracted with Anthropic Ireland, Limited under the Commercial
> Terms of Service and the Data Processing Addendum.
>
> To reduce the risk of disclosing personal data to the service, after a successful technical test
> on `[date]` we plan to deploy **Pseudomania**,
> open-source software (AGPL-3.0) developed by our organisation, consisting of:
>
> 1. a Google Chrome extension, force-installed and centrally managed on our browsers and active
>    only on claude.ai, which before sending replaces personal data in message text, attachments
>    (PDF, DOCX, XLSX) and Project knowledge files and instructions with placeholders (e.g.
>    `[FULLNAME_1]`), and restores the original values locally in the browser when displaying
>    responses;
> 2. an internal server that detects personal data; the placeholder mapping is encrypted in the
>    browser with a per-user key, and the server only stores the encrypted form.
>
> In our organisation Claude memory is disabled and web search is enabled.
>
> The extension: (a) modifies the content of the input field and of files before the user sends them
> through the regular claude.ai interface; (b) adds a short instruction asking Claude to keep
> placeholders unchanged; (c) as a safety net, intercepts in the page the `fetch`/`XMLHttpRequest`
> calls to claude.ai to check that content has already been pseudonymised, blocking it otherwise;
> (d) changes how responses are rendered in the DOM. It does not automate access, create accounts,
> use undocumented APIs on behalf of third parties, circumvent usage limits or model safeguards, or
> resell the service. Every message is written and sent by an employee authenticated via SSO.
>
> We kindly ask you to confirm in writing:
>
> 1. that the use described above is compatible with the Commercial Terms and the Usage Policy and
>    will not be treated as grounds for suspension;
> 2. whether client-side request interception or DOM modification may conflict with your
>    anti-abuse systems, and whether there is a channel to receive advance notice of claude.ai
>    interface changes relevant to extensions of this kind;
> 3. the information requested in the attached list on: ACN qualification, DPF certification and
>    transfer mechanism, sub-processors, retention and deletion of Team chats, feedback, Primary
>    Owner data export, and web search.
>
> We are happy to provide a detailed technical description or a demo; the source code is available at
> `[repository URL]`.
>
> Kind regards,
>
> `[Name, role]` – `[Public body]` – `[email]`
>
> Cc: Data Protection Officer `[email]`

## 5.3 Allegato alla lettera – elenco delle domande (EN)

Si allegano alla lettera le domande dei §§ 1, 2 e 3 (testo inglese riportato sopra), numerate da
Q1 a Q11 (Q11 facoltativa, perché la memoria è spenta):

- Q1: ACN qualification (§ 1)
- Q2-Q5: contracting entity, DPF, SCC, TIA support (§ 2)
- Q6-Q10: sub-processors, retention/deletion, feedback, Primary Owner export, web search (§ 3)
- Q11 (facoltativa): Please confirm that when Claude memory is disabled at organisation level no
  memory content is generated or retained from members' conversations, and that personal
  preferences in member profiles are stored only as account settings.

# Riferimenti

Tutte le fonti elencate nelle sezioni precedenti sono state aperte il 30-31/10/2026. Non aperte
(bloccate): https://catalogocloud.acn.gov.it/ , https://www.dataprivacyframework.gov/list ,
https://trust.anthropic.com/subprocessors (contenuto non leggibile).
