---
title: "Regolamento per l'uso degli strumenti di intelligenza artificiale generativa in cloud"
subtitle: "BOZZA da sottoporre al Responsabile della protezione dei dati (RPD/DPO) – Pseudomania Server edition"
lang: it-IT
---

> **BOZZA – versione 0.3 del 31/10/2026 – documento non approvato.**
> Le parti tra parentesi quadre (`[DA DEFINIRE]`, `[DA VERIFICARE]`) devono essere completate o
> verificate prima dell'adozione. I riferimenti normativi segnati `[DA VERIFICARE]` non sono stati
> controllati sul testo ufficiale.
>
> Il presente Regolamento riguarda la **Pseudomania Server edition** (estensione + server interno
> dell'Ente). La **Personal edition** è uno strumento a uso individuale fuori dai trattamenti dell'Ente
> (art. 1, c. 5); per i piccoli enti e i professionisti è disponibile un modello separato
> (`policy-light.md`).

# Premessa

Il personale dell'Ente utilizza già oggi account Claude Team (abbonamento business di Anthropic per
claude.ai) senza strumenti di controllo specifici. Il presente Regolamento, insieme al servizio
**Pseudomania** (sito: https://pseudomania.statocritico.it), è una **misura di mitigazione del
rischio**: riduce, ma **non elimina**, la probabilità che dati personali vengano comunicati al
fornitore del servizio di IA. Non costituisce una garanzia di anonimizzazione e non solleva l'utente
dalle proprie responsabilità.

Il Regolamento si inserisce nel quadro di:

- Regolamento (UE) 2016/679 (GDPR) e d.lgs. 196/2003 (Codice privacy);
- Regolamento (UE) 2024/1689 (AI Act), in particolare l'art. 4 (alfabetizzazione in materia di IA);
- Legge 23 settembre 2025, n. 132, in particolare l'art. 14 sull'uso dell'IA nella pubblica
  amministrazione;
- art. 4 della L. 300/1970 (Statuto dei lavoratori) e artt. 113-114 del Codice privacy;
- provvedimento del Garante del 27/11/2008 sugli amministratori di sistema e documento di indirizzo
  del Garante del 6/6/2024 (doc. web n. 10026277) sui metadati della posta elettronica, applicato per
  analogia ai registri tecnici;
- Linee guida AgID per l'adozione dell'IA nella pubblica amministrazione `[DA VERIFICARE: stato
  dell'iter di adozione definitiva]`;
- Codice di comportamento dei dipendenti pubblici (d.P.R. 62/2013 e successive modifiche) e Codice
  di comportamento dell'Ente.

# Art. 1 – Oggetto e ambito di applicazione

1. Il Regolamento disciplina l'uso, da parte del personale dell'Ente, di servizi di intelligenza
   artificiale generativa erogati in cloud da fornitori esterni ("Servizi IA"), per finalità
   connesse all'attività lavorativa.
2. Nella **fase pilota** l'unico Servizio IA autorizzato è **Claude** (claude.ai, piano Team), usato
   esclusivamente **in modalità chat** (incluse le funzioni "Progetti", caricamento di allegati e
   ricerca web), tramite il browser Chrome gestito dall'Ente con l'estensione Pseudomania attiva. La
   fase pilota coinvolge **6 utenti** individuati con atto `[DA DEFINIRE]`.
3. Le fasi successive (agenti locali come Goose e OpenCode tramite proxy API; eventuale estensione ad
   altri servizi come ChatGPT) richiedono l'aggiornamento del presente Regolamento e della DPIA prima
   dell'attivazione.
4. Il Regolamento si applica a dipendenti, collaboratori, tirocinanti e a chiunque operi per conto
   dell'Ente con un account Servizi IA fornito dall'Ente ("Utenti").
5. La **Pseudomania Personal edition** (estensione con il solo servizio locale di rilevamento sulla
   postazione dell'interessato, senza server dell'Ente) è uno strumento che il singolo professionista o
   il piccolo ente adotta sotto la propria responsabilità, come titolare dei propri trattamenti. **Non
   rientra nei trattamenti dell'Ente** né nel presente Regolamento, non può essere usata con account o
   dati dell'Ente e non autorizza in alcun modo l'uso di dati dell'Ente fuori dal perimetro qui
   descritto.

# Art. 2 – Definizioni

- **Servizio IA**: servizio di IA generativa in cloud autorizzato dall'Ente (nella fase pilota:
  Claude Team).
- **Pseudomania (Server edition)**: sistema composto dall'estensione Chrome installata in modo
  forzato e non disattivabile sui browser gestiti e dal server interno che rileva i dati personali e li
  sostituisce con segnaposto prima dell'invio al Servizio IA; i valori reali sono ripristinati solo nel
  browser dell'Utente.
- **Segnaposto (tag)**: stringa nella forma `[TIPO_N]` (es. `[FULLNAME_1]`, `[CF_2]`) che sostituisce
  un dato personale; la numerazione vale solo all'interno della singola conversazione o del singolo
  progetto.
- **Dizionario**: corrispondenza tra segnaposto e valori reali, **cifrata nel browser** dell'Utente
  con una chiave personale generata automaticamente e non esportabile (chiave utente); il server
  conserva solo i valori cifrati, che non è in grado di decifrare.
- **Copia di custodia (escrow)**: copia della chiave utente cifrata con la chiave pubblica di custodia
  dell'Ente, conservata in un archivio separato (key store); può essere aperta solo con la chiave
  privata di custodia, divisa tra i Custodi.
- **Pseudonimizzazione**: trattamento ai sensi dell'art. 4, n. 5, GDPR. I dati pseudonimizzati
  **restano dati personali** per l'Ente.
- **Quasi-identificatori**: informazioni che, pur non identificando direttamente una persona, ne
  consentono l'identificazione se combinate tra loro o con informazioni pubbliche (es. ruolo e
  ufficio, evento specifico, data e luogo di un fatto, patologia rara, numero di protocollo,
  riferimenti a un procedimento noto).
- **Categorie particolari di dati** (art. 9 GDPR) e **dati giudiziari** (art. 10 GDPR).
- **Registro minimo**: registro tecnico del server che contiene, per ogni invio, data e ora,
  identificativo pseudonimo dell'Utente (HMAC), ufficio, tipo di azione, conteggi dei dati mascherati,
  blocchi e l'**impronta SHA-256** del testo pseudonimizzato; **non contiene testi**.
- **Tracce di osservabilità**: testi pseudonimizzati inviati e ricevuti, conservati per pochi giorni in
  un progetto Langfuse dedicato, per la verifica del funzionamento del rilevamento.
- **Account di custodia**: account di servizio con ruolo di *Primary Owner* dell'organizzazione Claude
  Team, le cui credenziali e il cui secondo fattore di autenticazione sono divisi tra due Custodi.
- **Custodi**: persone designate che detengono, separatamente, le quote della chiave privata di custodia
  (schema 2 di 3) e le credenziali dell'account di custodia; operano solo secondo l'Allegato C.

# Art. 3 – Principi

1. L'IA è usata **in funzione strumentale e di supporto** all'attività amministrativa; la persona
   resta l'unica responsabile dei provvedimenti e dei procedimenti (art. 14, c. 2, L. 132/2025).
2. Gli output del Servizio IA sono **proposte da verificare**: l'Utente ne controlla correttezza,
   fonti, riferimenti normativi e completezza prima di qualsiasi uso.
3. Si applicano i principi di minimizzazione, limitazione della finalità e della conservazione,
   integrità e riservatezza (art. 5 GDPR) e di protezione dei dati fin dalla progettazione (art. 25).
4. L'uso del Servizio IA non deve compromettere il segreto d'ufficio, la riservatezza di atti non
   ancora pubblici e la tutela di informazioni classificate o coperte da segreto.

# Art. 4 – Usi consentiti

Sono consentiti, nel rispetto degli artt. 5 e 6:

a) redazione, revisione, sintesi e traduzione di testi di lavoro (bozze di note, lettere, relazioni,
   verbali, comunicazioni);
b) analisi e sintesi di documenti normativi, tecnici o di dominio pubblico, anche con la **ricerca
   web** di Claude;
c) supporto alla stesura di bozze di atti amministrativi, fermo restando il controllo integrale
   dell'Utente e del responsabile del procedimento;
d) supporto a elaborazioni su fogli di calcolo e documenti (PDF, DOCX, XLSX) che contengano dati
   personali comuni, purché pseudonimizzati da Pseudomania;
e) formazione, approfondimento e supporto alla scrittura di codice non contenente credenziali o dati
   di produzione.

# Art. 5 – Usi vietati

È vietato:

1. inserire, caricare o far elaborare **dati appartenenti alle categorie particolari (art. 9 GDPR)**
   o **dati giudiziari (art. 10 GDPR)**, anche se pseudonimizzati. Pseudomania blocca gli invii in cui
   rileva tali dati, **senza possibilità di forzatura**; il blocco non sostituisce la valutazione
   dell'Utente, che resta tenuto a non inserirli anche quando non vengono rilevati;
2. usare il Servizio IA per **decisioni che producono effetti giuridici** sulle persone senza
   un'istruttoria e una decisione umana autonome, o per valutare, classificare o profilare persone
   fisiche (es. dipendenti, candidati, cittadini richiedenti prestazioni) `[DA VERIFICARE: eventuali
   casi ad alto rischio ex Allegato III AI Act]`;
3. accedere al Servizio IA con l'account dell'Ente **da dispositivi personali o non gestiti**, da app
   desktop o mobili, da browser diversi da Chrome gestito, o al di fuori delle condizioni di accesso
   stabilite dall'Ente;
4. usare **account personali** o servizi di IA non autorizzati per trattare dati o documenti
   dell'Ente, inclusa la Pseudomania Personal edition;
5. **eludere, disattivare o manomettere** Pseudomania (es. incollando testo tramite strumenti che
   aggirano l'estensione, trascrivendo i dati in forma alterata per evitarne il rilevamento, usando
   altri profili o browser), o tentare di ricostruire il contenuto del dizionario;
6. chiedere a Claude di **modificare, creare, interpretare o ricostruire** i segnaposto, o fornire nel
   testo elementi che consentano di risalire al valore originale di un segnaposto;
7. inserire **dati personali nelle preferenze personali del profilo Claude** (istruzioni
   personalizzate, stile, nome con cui farsi chiamare oltre al nome di battesimo, ecc.): questi campi
   **non passano da Pseudomania** e sono inviati al fornitore in chiaro;
8. formulare **richieste di ricerca web contenenti dati personali** (nomi, codici, indirizzi di
   persone fisiche) o chiedere a Claude di cercare sul web informazioni su persone citate nei documenti:
   le richieste di ricerca sono elaborate da un sub-fornitore del Servizio IA;
9. inserire credenziali, chiavi, password, informazioni classificate, atti coperti da segreto
   istruttorio o d'ufficio, o informazioni la cui divulgazione possa arrecare pregiudizio alla
   sicurezza dell'Ente;
10. attivare o richiedere connettori, integrazioni, estensioni del Servizio IA, condivisione di
    progetti, memoria o altre funzioni disattivate dall'Ente;
11. pubblicare o diffondere output del Servizio IA senza revisione umana e, ove richiesto dalla
    normativa, senza indicarne la natura generata `[DA VERIFICARE: art. 50 AI Act per testi pubblicati
    a fini di informazione del pubblico]`;
12. inviare **feedback** o segnalazioni al fornitore tramite claude.ai: i feedback sono conservati dal
    fornitore fino a 5 anni e possono essere usati per l'addestramento; la funzione è disattivata
    dall'Ente.

# Art. 6 – Cautele sui quasi-identificatori

1. Pseudomania sostituisce i dati identificativi diretti (nomi, codici fiscali, recapiti, indirizzi,
   IBAN, targhe, ecc.), ma **non può riconoscere tutti i contesti** che rendono una persona
   identificabile.
2. Prima di ogni invio l'Utente:
   a) elimina o generalizza i dettagli non necessari (date esatte, luoghi specifici, ruoli unici,
      numeri di protocollo, riferimenti a fatti di cronaca o a procedimenti noti);
   b) evita di descrivere situazioni di persone facilmente riconoscibili nel contesto dell'Ente o
      del territorio (es. "il sindaco", "il dirigente del settore X", "l'unico dipendente con...");
   c) usa la funzione di **ispezione** di Pseudomania per controllare il testo effettivamente inviato,
      soprattutto per allegati e documenti lunghi;
   d) segnala con la funzione dedicata i **falsi negativi** (dati non mascherati) e i **falsi
      positivi**, senza riportare nel testo della segnalazione i dati reali.

# Art. 7 – Obblighi degli Utenti

L'Utente:

a) partecipa alla formazione obbligatoria (art. 13) prima del rilascio dell'account;
b) accede solo tramite autenticazione unica (SSO) dell'Ente e dispositivi gestiti;
c) non condivide le proprie credenziali né il proprio account;
d) verifica sempre gli output (art. 3, c. 2) e ne assume la responsabilità nell'uso;
e) conferma ogni anno, dal pannello di Pseudomania, i progetti ancora in uso (senza conferma il
   dizionario del progetto scade) e cancella quelli non più necessari;
f) sa che, se cambia postazione o profilo del browser, i dizionari delle **chat** precedenti non sono
   più ripristinabili; per i **progetti** può chiedere il recupero con richiesta motivata (Allegato C);
g) segnala senza ritardo all'indirizzo `[DA DEFINIRE]` ogni anomalia: dati non mascherati, ripristini
   errati, segnaposto alterati, malfunzionamento o avvisi dell'estensione, sospetta violazione di dati
   (art. 15);
h) rispetta le istruzioni impartite in qualità di persona autorizzata al trattamento (art. 29 GDPR e
   art. 2-quaterdecies Codice privacy).

# Art. 8 – Ruoli e responsabilità

| Ruolo | Soggetto | Compiti principali |
|---|---|---|
| Titolare del trattamento | Ente, in persona del legale rappresentante `[DA DEFINIRE]` | Adotta il Regolamento e la DPIA, designa i ruoli, stipula gli accordi con i fornitori |
| Responsabile della protezione dei dati (RPD/DPO) | `[DA DEFINIRE]` | Parere sulla DPIA (art. 35, par. 2, GDPR), sorveglianza, punto di contatto con il Garante e con gli interessati |
| Dirigente/referente del servizio | `[DA DEFINIRE]` | Individua gli Utenti, autorizza gli usi, cura la formazione |
| Responsabile della transizione al digitale (RTD) | `[DA DEFINIRE]` | Coordinamento con la strategia digitale dell'Ente, artt. 68-69 CAD |
| Amministratori di sistema | `[DA DEFINIRE]` – designati secondo il provvedimento del Garante del 27/11/2008 | Gestione VM, Chrome Enterprise, SSO, proxy, Langfuse, console Claude Team (ruoli diversi dal Primary Owner); **nessun accesso** alla chiave privata di custodia né all'account di custodia |
| Custodi (almeno 3, di cui 2 necessari) | `[DA DEFINIRE]` – distinti dagli amministratori di sistema | Detengono le quote della chiave privata di custodia e, divise tra due di essi, le credenziali e il secondo fattore dell'account di custodia; operano solo secondo l'Allegato C |
| Responsabile del trattamento (art. 28 GDPR) | Anthropic Ireland, Limited (entità contraente per il SEE secondo i Commercial Terms) | Erogazione del Servizio IA secondo il DPA |
| Responsabile del trattamento (art. 28 GDPR) | Fornitore per sviluppo/manutenzione di Pseudomania `[DA DEFINIRE]` | Secondo contratto e nomina specifica |

# Art. 9 – Misure tecniche (sintesi)

Le misure sono descritte nella DPIA e nella documentazione tecnica. In sintesi:

1. estensione installata in modo forzato e non disattivabile; in caso di server non raggiungibile
   l'invio è bloccato (*fail-closed*);
2. rilevamento dei dati personali con Rizzo-PII sul server interno, senza accesso a reti esterne;
   pseudonimizzazione anche di allegati (PDF, DOCX, XLSX) e dei file e delle istruzioni dei Progetti;
3. **dizionario cifrato nel browser** con chiave utente automatica e non esportabile; copia di
   custodia cifrata con la chiave pubblica dell'Ente e conservata in un key store separato; rotazione
   automatica della chiave ogni 90 giorni; l'amministratore del server **non può decifrare in blocco**
   i dizionari;
4. su claude.ai: disattivati **memoria**, connettori, richieste di connettori da parte dei membri,
   Claude in Chrome, modalità vocale, condivisione dei progetti, feedback (*Rate chats*);
   **ricerca web attiva** con le cautele dell'art. 5, n. 8;
5. app desktop bloccata sui PC, app Claude bloccata sui telefoni Android aziendali tramite MDM;
   accesso solo tramite SSO dell'Ente con accesso condizionato; il proxy dell'Ente consente claude.ai
   solo dal Chrome gestito;
6. registro minimo senza testi, con impronte SHA-256; tracce di osservabilità brevi (art. 11);
   registri degli accessi di amministratori e Custodi in sola aggiunta, con catena di hash.

# Art. 10 – Accesso ai contenuti delle conversazioni e al registro

1. Il registro minimo e le tracce di osservabilità sono istituiti per finalità di **sicurezza,
   verifica del corretto funzionamento di Pseudomania e miglioramento della qualità del
   rilevamento**. Non sono utilizzati per valutare la prestazione lavorativa né per finalità
   disciplinari.
2. Gli amministratori accedono al registro minimo e alle tracce **solo in forma aggregata o pseudonima**
   (statistiche, falsi negativi segnalati, errori), senza ricollegare lo pseudonimo a un Utente.
3. **I contenuti delle conversazioni di un Utente** possono essere recuperati **esclusivamente su
   richiesta scritta dell'Autorità giudiziaria** (o della polizia giudiziaria su delega), secondo il
   modello già adottato dall'Ente per la videosorveglianza `[DA DEFINIRE: estremi del
   regolamento/disciplinare videosorveglianza]`, con la **procedura dei Custodi (Allegato C)**:
   a) esportazione dei dati dell'organizzazione Claude Team tramite l'**account di custodia**, che
      richiede la presenza di **due Custodi** (uno con la password, l'altro con il secondo fattore);
   b) estrazione della **sola parte richiesta** (Utente, periodo, conversazioni) e **distruzione
      verbalizzata del resto** dell'esportazione;
   c) verifica di autenticità dei contenuti estratti con le impronte SHA-256 del registro minimo;
   d) ove richiesto, ripristino dei valori reali dei soli segnaposto pertinenti tramite la copia di
      custodia della chiave dell'Utente, aperta offline da due Custodi;
   e) **verbale** di ogni operazione.
4. È esclusa ogni altra forma di accesso ai contenuti o alle tracce di singoli Utenti, inclusa la
   richiesta del dirigente o dell'ufficio procedimenti disciplinari. L'account di custodia non è usato
   per l'amministrazione ordinaria della console Claude Team.
5. Il recupero di dizionari di **progetto** dopo un cambio di postazione, su richiesta motivata
   dell'Utente, segue l'Allegato C, parte 2.

# Art. 11 – Conservazione

| Dato | Conservazione | Motivazione / riferimento |
|---|---|---|
| Dizionario delle chat | 30 giorni dall'ultimo uso; non recuperabile dopo cambio di postazione | Minimizzazione (art. 5, par. 1, lett. c ed e, GDPR) |
| Dizionario dei progetti | Durata del progetto + 30 giorni dall'ultimo uso; scade senza conferma annuale dell'Utente; recupero via Custodi solo su richiesta motivata | Minimizzazione; conferma periodica |
| Voci in attesa (`pending:`) | 24 ore | Tecnica |
| Registro minimo (pseudonimo) | **90 giorni**, poi solo aggregati anonimi (conteggi per giorno e ufficio, senza utente) | Garante, documento di indirizzo 6/6/2024 (doc. web 10026277) e provv. Regione Lombardia (doc. web 10134221): oltre 21 giorni servono le garanzie dell'art. 4, c. 1, L. 300/1970 (accordo o autorizzazione); 90 giorni seguiti da anonimizzazione |
| Tracce di osservabilità (Langfuse) | **30 giorni** durante il pilota, poi **7 giorni** | Minimizzazione; testi pseudonimizzati |
| Backup del database applicativo | Rotazione ≤ 35 giorni (7 giornalieri + 4 settimanali), una copia offline | Ripristino; distruzione secondo Allegato B |
| Key store e suoi backup | Backup separati, rotazione 14 giorni | Separazione delle chiavi dai dati |
| Copie di custodia (escrow) | Stessa vita della chiave utente (rotazione ogni 90 giorni); distrutte con la chiave | Cancellazione crittografica (Allegato B) |
| Registri degli accessi di amministratori e Custodi, registro delle cancellazioni | **24 mesi**, in sola aggiunta, con catena di hash | Garante 27/11/2008 (almeno 6 mesi, inalterabili); ACN, LG banche dati, nov. 2024 (almeno 24 mesi) |
| Verbali dei Custodi e richieste dell'Autorità | Protocollati, secondo il massimario di scarto dell'Ente | Linee guida AgID sui documenti informatici |
| Conversazioni su claude.ai | Piano Team: a tempo indeterminato salvo cancellazione; l'Utente cancella le conversazioni non più necessarie `[DA VERIFICARE: tempi di rimozione dal back-end]` | Condizioni del fornitore |
| Blocco per l'Autorità giudiziaria | Sospende la cancellazione **solo** dei dati indicati, fino a revoca; registrato | Obbligo di legge |

Le motivazioni e le fonti sono dettagliate nella DPIA, § 2.5.

# Art. 12 – Fornitori e trasferimenti

1. Il fornitore del Servizio IA è designato responsabile del trattamento mediante l'accettazione del
   *Data Processing Addendum* (DPA) incorporato nei Commercial Terms, previa verifica della sua
   conformità all'art. 28 GDPR.
2. I trasferimenti verso gli Stati Uniti si fondano sulle clausole contrattuali tipo previste dal DPA,
   accompagnate da una valutazione d'impatto del trasferimento `[DA VERIFICARE: eventuale
   certificazione EU-US Data Privacy Framework]`.
3. L'uso del Servizio IA è subordinato alla verifica della **qualificazione ACN** del servizio cloud,
   ove richiesta dal Regolamento unico per le infrastrutture e i servizi cloud per la PA
   `[DA VERIFICARE]`.
4. Dopo la prova tecnica, l'Ente chiede al fornitore conferma scritta della compatibilità
   dell'estensione con i termini del servizio (`verifiche-fase0.md`, § 5).

# Art. 13 – Formazione e alfabetizzazione in materia di IA

1. Ai sensi dell'art. 4 AI Act, l'Ente adotta misure per sviluppare un livello adeguato di
   alfabetizzazione in materia di IA del personale che usa i Servizi IA.
2. Prima dell'abilitazione ogni Utente segue un modulo formativo di almeno `[DA DEFINIRE]` ore su:
   funzionamento e limiti dei modelli linguistici (errori, "allucinazioni", bias); protezione dei
   dati, quasi-identificatori, ricerca web e preferenze del profilo; uso di Pseudomania (ispezione,
   segnalazioni, blocchi, conferma dei progetti); contenuto del presente Regolamento; responsabilità
   nella redazione degli atti.
3. La formazione è aggiornata almeno annualmente e documentata.

# Art. 14 – Pubblicità e trasparenza verso i cittadini

L'Ente rende conoscibile l'uso dell'IA e ne assicura la tracciabilità (art. 14, c. 1, L. 132/2025),
pubblicando una sintesi del presente Regolamento sul sito istituzionale `[DA DEFINIRE: sezione]`.

# Art. 15 – Gestione degli incidenti e violazioni di dati personali

1. Costituiscono incidente, tra l'altro: invio di dati personali non pseudonimizzati (anche nelle
   richieste di ricerca web o nelle preferenze del profilo); invio di dati di cui agli artt. 9-10;
   ripristino errato che porti a inserire in un atto dati di una persona diversa; accesso non
   autorizzato al server, al key store, alle quote di custodia o all'account di custodia;
   compromissione di un account; uso del Servizio IA da dispositivo non gestito.
2. L'Utente segnala immediatamente l'evento al referente `[DA DEFINIRE]` e, se possibile, cancella
   la conversazione interessata su claude.ai.
3. L'Ente valuta l'evento secondo la propria procedura di gestione delle violazioni
   `[DA DEFINIRE: estremi]`: se si tratta di violazione di dati personali, notifica al Garante entro
   72 ore dalla conoscenza, salvo che sia improbabile un rischio per i diritti e le libertà (art. 33
   GDPR), e comunica la violazione agli interessati quando il rischio è elevato (art. 34 GDPR). Ogni
   violazione è documentata nel registro interno (art. 33, par. 5, GDPR).
4. In caso di sospetta esposizione di una chiave utente l'amministratore forza la rotazione della
   chiave; in caso di compromissione di una quota di custodia i Custodi ridistribuiscono le quote
   (Allegato C, parte 4).
5. Il DPA del fornitore prevede la notifica all'Ente delle violazioni lato fornitore entro 48 ore
   `[DA VERIFICARE nel DPA vigente al momento della sottoscrizione]`.
6. Gli incidenti di sicurezza informatica sono gestiti anche secondo gli obblighi di notifica verso
   l'ACN eventualmente applicabili all'Ente `[DA VERIFICARE: soggezione a NIS2/d.lgs. 138/2024 o
   L. 90/2024]`.

# Art. 16 – Sanzioni

La violazione del presente Regolamento può costituire illecito disciplinare ai sensi del d.lgs.
165/2001, del CCNL applicabile, del Codice di comportamento dei dipendenti pubblici e del Codice
di comportamento dell'Ente, ferme restando le eventuali responsabilità civili, penali e
amministrative. Il registro minimo, le tracce e le esportazioni non sono utilizzabili a fini
disciplinari se non nei limiti previsti dall'art. 4, c. 3, L. 300/1970 e dall'accordo sindacale o
autorizzazione di cui all'art. 17 `[DA DEFINIRE con le organizzazioni sindacali]`.

# Art. 17 – Condizioni per l'avvio e revisione

1. L'avvio della fase pilota è subordinato a: DPIA con parere del RPD; accordo con le rappresentanze
   sindacali o autorizzazione dell'Ispettorato nazionale del lavoro (art. 4, c. 1, L. 300/1970);
   aggiornamento del registro dei trattamenti; informativa agli Utenti; designazione e formazione dei
   Custodi e prova delle procedure degli Allegati B e C; verifiche su fornitore, trasferimenti e
   qualificazione ACN (v. *Checklist adempimenti*).
2. Il Regolamento è riesaminato al termine della fase pilota, comunque entro 12 mesi, e ogni volta
   che cambiano il Servizio IA, le sue condizioni contrattuali o funzioni, l'architettura di
   Pseudomania o il quadro normativo.

---

# Allegato A – Informativa ai dipendenti (art. 13 GDPR) – BOZZA

**Informativa sul trattamento dei dati personali nell'ambito dell'uso del servizio Claude tramite
Pseudomania**

**1. Titolare del trattamento.** `[DA DEFINIRE: denominazione, sede, PEC]`.

**2. Responsabile della protezione dei dati.** `[DA DEFINIRE: nominativo o ufficio, e-mail, PEC]`.

**3. Quali dati trattiamo.**

a) *Dati di account e accesso*: identificativo SSO, nome, indirizzo e-mail istituzionale (usati
   dall'identity provider dell'Ente, dal proxy e dalla console di Claude Team; il fornitore Anthropic
   riceve nome ed e-mail per la gestione dell'account);
b) *Registro minimo di Pseudomania*: identificativo pseudonimo calcolato con funzione HMAC (non il
   nome), ufficio, data e ora, tipo di azione, conteggio e tipo dei dati mascherati, eventuali blocchi,
   **impronte SHA-256** dei testi pseudonimizzati, tempi di risposta. **Nessun testo.**
c) *Tracce di osservabilità*: testi inviati e risposte **solo in forma pseudonimizzata**, associati
   all'identificativo pseudonimo, in un progetto dedicato della piattaforma Langfuse dell'Ente;
d) *Dizionario*: corrispondenza tra segnaposto e dati reali presenti nei testi inviati, **cifrata nel
   Suo browser** con una chiave generata automaticamente; il server conserva solo i dati cifrati e una
   copia di custodia della chiave, apribile solo da due Custodi;
e) *Contenuti delle conversazioni sul servizio Claude*: conservati da Anthropic in forma
   pseudonimizzata e associati al Suo account; le **preferenze personali del profilo** e le
   **richieste di ricerca web** sono inviate così come sono scritte (per questo il Regolamento vieta di
   inserirvi dati personali).

**4. Finalità e base giuridica.**

| Finalità | Base giuridica |
|---|---|
| Fornire lo strumento di lavoro e proteggere i dati di terzi nei testi inviati | Art. 6, par. 1, lett. e), GDPR e art. 2-ter Codice privacy (compiti di interesse pubblico); art. 32 GDPR |
| Sicurezza del sistema, verifica e miglioramento del rilevamento | Art. 6, par. 1, lett. c) ed e), GDPR; art. 32 GDPR |
| Accertamenti su richiesta dell'Autorità giudiziaria | Art. 6, par. 1, lett. c), GDPR; obblighi di legge |
| Gestione del rapporto di lavoro, nei limiti dell'art. 4 L. 300/1970 | Art. 6, par. 1, lett. c), art. 88 GDPR; art. 4 L. 300/1970; art. 114 Codice privacy; accordo sindacale/autorizzazione INL `[DA DEFINIRE]` |

I dati **non sono usati per valutare la Sua prestazione lavorativa**. I contenuti delle Sue
conversazioni possono essere estratti solo su richiesta dell'Autorità giudiziaria, con l'intervento
congiunto di due Custodi e redazione di verbale; il resto dell'esportazione viene distrutto.

**5. Destinatari.** Personale autorizzato e amministratori di sistema dell'Ente (senza accesso al
contenuto in chiaro dei dizionari né alla Sua identità nel registro); Anthropic Ireland, Limited quale
responsabile del trattamento e i suoi sub-responsabili, incluso il fornitore del servizio di ricerca
web; fornitore incaricato della manutenzione di Pseudomania `[DA DEFINIRE]`; Autorità giudiziaria su
richiesta.

**6. Trasferimenti verso Paesi terzi.** I dati trattati dal servizio Claude possono essere trasferiti
negli Stati Uniti sulla base delle clausole contrattuali tipo della Commissione europea previste dal
contratto con il fornitore `[DA VERIFICARE: eventuale certificazione EU-US Data Privacy Framework]`.

**7. Conservazione.** Dizionari: 30 giorni dall'ultimo uso (chat); durata del progetto + 30 giorni,
con conferma annuale (progetti). Registro minimo: 90 giorni, poi solo statistiche anonime. Tracce di
osservabilità: 30 giorni nel pilota, poi 7. Backup: al massimo 35 giorni. Conversazioni su claude.ai:
fino alla cancellazione da parte Sua o alla chiusura dell'account `[DA VERIFICARE: tempi di rimozione
dal back-end del fornitore]`. Dettagli all'art. 11 del Regolamento.

**8. Obbligatorietà.** L'uso del servizio non è obbligatorio `[DA DEFINIRE]`; se lo usa, i
trattamenti descritti sono necessari e non può disattivare Pseudomania.

**9. Diritti.** Può esercitare i diritti di cui agli artt. 15-22 GDPR (accesso, rettifica,
cancellazione, limitazione, opposizione nei casi previsti) scrivendo a `[DA DEFINIRE]`. Ha diritto di
proporre reclamo al Garante per la protezione dei dati personali (www.garanteprivacy.it).

**10. Processi decisionali automatizzati.** Non sono adottate decisioni basate unicamente su
trattamenti automatizzati nei Suoi confronti. Il blocco degli invii contenenti categorie particolari
di dati è una misura tecnica di sicurezza e non produce effetti sul rapporto di lavoro.

**11. Informazione sull'uso dell'IA.** La presente informativa assolve anche all'obbligo di
informazione sull'uso di sistemi di IA nel rapporto di lavoro `[DA VERIFICARE: art. 11 L. 132/2025 e
art. 1-bis d.lgs. 152/1997, ove applicabili]`.

---

# Allegato B – Procedura di cancellazione e distruzione dei backup – BOZZA

**Scopo.** Assicurare che i dati scaduti o di cui è richiesta la cancellazione siano resi
irrecuperabili, anche nelle copie di backup, e che ogni operazione sia documentata. La procedura
risponde alla difficoltà, rilevata dall'EDPB nell'azione coordinata 2025 sul diritto alla
cancellazione, di cancellare i dati presenti nei backup.

**B.1 Principio: cancellazione crittografica.** I valori dei dizionari sono cifrati con chiavi
utente che il server non possiede in chiaro. Rendere irrecuperabile un dato significa cancellare il
dato cifrato e, quando una chiave non ha più voci, distruggere la sua copia di custodia: senza
chiave i valori cifrati eventualmente rimasti in un backup **non sono più decifrabili**
(*cryptographic erase*, classificata come tecnica di *purge* da NIST SP 800-88 Rev. 2; le Linee guida
ACN sulle banche dati, nov. 2024, indicano la cancellazione delle chiavi di cifratura tra le misure di
dismissione sicura).

**B.2 Cancellazioni ordinarie (automatiche).**

1. Il job di conservazione elimina le voci scadute (chat: 30 giorni dall'ultimo uso; progetti: 30
   giorni dall'ultimo uso o mancata conferma annuale; `pending:` dopo 24 ore), il registro minimo
   oltre 90 giorni (dopo l'aggregazione anonima) e le tracce Langfuse oltre il termine.
2. Alla rotazione (ogni 90 giorni) l'estensione ricifra le voci con la nuova chiave e il server
   distrugge la copia di custodia della chiave precedente quando non ha più voci.
3. Ogni cancellazione è scritta nel **registro delle cancellazioni** (sola aggiunta, catena di hash)
   ed esportata periodicamente fuori dal database.
4. Le cancellazioni non si applicano ai dati soggetti a **blocco dell'Autorità giudiziaria** (solo
   quelli indicati), fino a revoca registrata.

**B.3 Cancellazione su richiesta** (Utente dal pannello, o esercizio dei diritti tramite RPD).

1. Cancellazione dello scope (`DELETE` dal pannello o comando dell'amministratore): eliminazione delle
   voci e, se la chiave non ha più voci, della copia di custodia.
2. Registrazione nel registro delle cancellazioni e risposta all'interessato (tramite RPD).

**B.4 Ripristino da backup.** Dopo ogni ripristino del database applicativo o del key store,
l'amministratore **riapplica il registro delle cancellazioni** esportato (comando `cancellazioni
riapplica`) **prima** di rimettere in servizio il sistema, e verifica la catena di hash dei registri.
L'operazione è annotata nel registro degli accessi degli amministratori.

**B.5 Rotazione e distruzione dei backup.**

| Backup | Rotazione | Distruzione |
|---|---|---|
| Database applicativo | 7 giornalieri + 4 settimanali (≤ 35 giorni); una copia offline | Eliminazione automatica a scadenza; copia offline sovrascritta o distrutta a ogni ciclo |
| Key store (copie di custodia) | Separato, 14 giorni | Eliminazione automatica; mai nello stesso supporto del database applicativo |
| Supporti dismessi | — | Cancellazione crittografica (distruzione delle chiavi di cifratura del volume) o distruzione fisica; verbale |

I backup sono cifrati e accessibili solo agli amministratori designati.

**B.6 Verbale di distruzione** (per la copia offline, i supporti dismessi e le esportazioni di
cui all'Allegato C): data e ora; operatori; oggetto (supporto, periodo coperto, impronta del file);
metodo (cancellazione crittografica, sovrascrittura, distruzione fisica); esito della verifica;
firme. Il verbale è protocollato.

**B.7 Verifica annuale.** Una volta l'anno, insieme alla verifica sull'operato degli amministratori
di sistema (provv. Garante 27/11/2008), si controllano a campione: rispetto delle rotazioni,
riapplicazione del registro dopo i ripristini di prova, integrità delle catene di hash.

---

# Allegato C – Procedura dei Custodi – BOZZA

**C.0 Custodi e strumenti.**

- Almeno **tre Custodi** designati dal Titolare, distinti dagli amministratori di sistema; ciascuno
  detiene una **quota** della chiave privata di custodia (schema di Shamir **2 di 3**,
  configurabile), su supporto personale cifrato `[DA DEFINIRE: tipo di supporto, luogo di custodia]`.
- La chiave privata di custodia è generata **offline** con lo strumento del repository
  (`tools/custodi/`) e non è mai presente sul server. La chiave pubblica è pubblicata dal server.
- **Account di custodia** di Claude Team (Primary Owner): password conservata da un Custode, secondo
  fattore (MFA) da un altro; nessun altro account ha il ruolo di Primary Owner.
- Postazione offline dedicata `[DA DEFINIRE]` per le operazioni di cui sotto.
- Ogni operazione richiede **almeno due Custodi presenti** e si conclude con un **verbale**.

**C.1 Richiesta dell'Autorità giudiziaria.**

1. La richiesta è protocollata e trasmessa al Titolare e al RPD, che ne verificano la provenienza e
   l'oggetto (Utente, periodo, tipo di dati).
2. Se necessario l'amministratore registra un **blocco** sui soli dati indicati (sospende le
   cancellazioni automatiche) e lo annota.
3. **Contenuti delle conversazioni:** due Custodi accedono all'account di custodia, avviano
   l'esportazione dei dati dell'organizzazione Claude Team e la scaricano sulla postazione offline;
   ne calcolano l'impronta; estraggono **solo** le conversazioni dell'Utente e del periodo richiesti;
   verificano l'autenticità dei messaggi confrontandone le impronte SHA-256 con il registro minimo
   (se ancora entro i 90 giorni); **distruggono** il resto dell'esportazione (Allegato B, B.6) e
   chiudono la sessione dell'account di custodia.
4. **Valori reali dei segnaposto (se richiesti):** l'amministratore esporta le copie di custodia e le
   voci cifrate dell'Utente e degli scope indicati; due Custodi, sulla postazione offline,
   ricompongono la chiave privata di custodia con le proprie quote, decifrano la copia di custodia e le
   **sole voci richieste**, poi cancellano la chiave ricomposta dalla memoria della postazione.
5. Consegna all'Autorità del materiale estratto, con impronte, secondo le modalità indicate.
6. **Verbale** (lo strumento `tools/custodi/` ne genera la traccia): estremi della richiesta, Custodi
   presenti, dati estratti, impronte dei file consegnati, distruzione del resto, durata
   dell'operazione. Protocollazione.
7. Revoca del blocco quando l'Autorità lo comunica; annotazione.
8. L'Utente è informato quando ciò non pregiudica le indagini e secondo le indicazioni dell'Autorità.

**C.2 Recupero del dizionario di un progetto dopo cambio di postazione** (solo progetti, su
richiesta motivata dell'Utente approvata dal dirigente `[DA DEFINIRE]`).

1. La nuova estensione genera una coppia di chiavi di dispositivo e ne pubblica la chiave pubblica.
2. L'amministratore esporta la copia di custodia della vecchia chiave dell'Utente.
3. Due Custodi, offline, decifrano la copia di custodia e la **ricifrano per la chiave pubblica del
   dispositivo** (la chiave utente non compare mai in chiaro fuori dalla postazione offline).
4. L'amministratore carica il risultato; l'estensione lo scarica (disponibile 7 giorni) e lo importa
   come chiave non esportabile.
5. Verbale.

Il recupero delle **chat** non è previsto.

**C.3 Rotazione forzata della chiave di un Utente.** In caso di sospetta esposizione, l'amministratore
attiva la rotazione forzata; l'operazione è registrata. Non richiede i Custodi.

**C.4 Gestione delle quote.** Verifica annuale che le quote siano integre e ricompongano la chiave
(comando `verifica`, senza esporre la chiave); in caso di uscita di un Custode o di compromissione
di una quota, **ridistribuzione** delle quote (comando `ridistribuisci`) o generazione di una nuova
coppia di custodia, con rotazione di tutte le chiavi utente; verbale.

**C.5 Cosa i Custodi non fanno.** Non accedono ai contenuti per richieste diverse da quelle dei punti
C.1 e C.2; non usano l'account di custodia per l'amministrazione ordinaria; non conservano copie dei
dati estratti dopo la consegna.

---

# Riferimenti

Fonti consultate per la redazione (aperte il 30-31/10/2026):

- Agenda Digitale, *Legge 132/2025 e uso dell'IA nella PA: la guida* (testo art. 14, c. 1-2):
  https://www.agendadigitale.eu/cittadinanza-digitale/legge-132-2025-e-uso-dellai-nella-nella-pubblica-amministrazione-la-guida/
- Normattiva, L. 23 settembre 2025, n. 132: https://www.normattiva.it/eli/id/2025/09/25/25G00143/CONSOLIDATED
- AgID, pagina *Intelligenza artificiale*: https://www.agid.gov.it/it/ambiti-intervento/intelligenza-artificiale
- Anthropic, *Data Processing Addendum*: https://www.anthropic.com/legal/data-processing-addendum
- Anthropic, Commercial Terms: https://www.anthropic.com/legal/commercial-terms
- Assolombarda, testo art. 4 L. 300/1970:
  https://new.assolombarda.it/servizi/diritto-di-impresa/documenti/art-4-legge-300-del-1970
- Garante, documento di indirizzo 6/6/2024 sui metadati della posta elettronica (doc. web 10026277):
  https://dirittobancario.it/wp-content/uploads/2024/06/Provvedimento-Garante-Privacy-6-giugno-2024.pdf
- Provv. Garante Regione Lombardia (doc. web 10134221), sintesi:
  https://www.cybersecurity360.it/news/sanzione-privacy-a-regione-lombardia-50mila-euro-per-controllo-illecito-di-email-e-internet/
  e https://privacymatters.dlapiper.com/2025/06/italy-the-garante-issues-first-gdpr-fine-over-employees-email-metadata-privacy-breach/
- Garante, provv. 27/11/2008 amministratori di sistema (sintesi):
  https://www.filodiritto.com/le-nuove-prescrizioni-privacy-i-titolari-del-trattamento-relativamente-alle-attribuzioni-delle-funzioni-di-amministratore-di-sistema
- ACN, *Linee guida per il rafforzamento della protezione delle banche dati rispetto al rischio di
  utilizzo improprio*, nov. 2024: https://cybersecitalia.it/wp-content/uploads/2024/11/Linee-guida-banche-dati.pdf
- NIST SP 800-88 Rev. 2 (sett. 2025): https://csrc.nist.gov/pubs/sp/800/88/r2/final e FAQ:
  https://csrc.nist.gov/files/pubs/sp/800/88/r2/final/docs/sp800-88r2-faq.pdf
- EDPB, CEF 2025 sul diritto alla cancellazione (18/02/2026):
  https://www.edpb.europa.eu/news/edpb-identifies-challenges-hindering-the-full-implementation-of-the-right-to-erasure_en
- artificialintelligenceact.eu, art. 4 AI Act: https://artificialintelligenceact.eu/article/4b/
