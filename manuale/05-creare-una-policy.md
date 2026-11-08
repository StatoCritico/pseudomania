# 5. Creare una policy

Pseudomania da sola non basta: servono **regole scritte** su che cosa si può e non si può fare con
l'IA, chi fa che cosa, per quanto si conservano i dati e che cosa succede quando qualcosa va storto.
Questo capitolo guida alla stesura in due versioni:

| Modello | Per chi | Base | Documenti |
|---|---|---|---|
| **Light** | professionista, studio, piccola organizzazione con la **Personal edition** | `governance/policy-light.md`, `governance/dichiarazione-impegno.md` | una pagina di regole firmata, più alcune verifiche; negli studi con più persone, una dichiarazione di impegno firmata da ciascuno |
| **Strutturato** | **ente pubblico** (o impresa) con l'**Server edition** | `governance/policy-uso-ia.md`, `governance/dpia.md`, `governance/checklist-adempimenti.md` | regolamento, informativa, DPIA, accordo sindacale, procedura dei custodi, procedura di cancellazione, durate |

> **Modelli, non consulenza legale.** I testi sono bozze da adattare con il proprio DPO o consulente.
> La responsabilità delle scelte resta interamente di chi adotta il sistema (capitolo 0). I
> riferimenti marcati **[DA VERIFICARE]** non sono stati controllati sul testo ufficiale. Nei modelli,
> le parti tra parentesi quadre `[ ]` vanno compilate.

## 5.1 Prima di scrivere: tre domande

1. **Chi è il titolare?** Il professionista per i dati dei propri clienti (o il cliente, se il
   professionista agisce come responsabile); l'ente o l'impresa per i dati trattati dai dipendenti.
2. **Quali dati entreranno in Claude?** Se sono probabili dati sanitari, giudiziari, di minori o
   altre categorie particolari, l'uso va escluso o valutato a fondo (DPIA).
3. **Quale piano di Claude?** I piani consumer (Free, Pro, Max) hanno condizioni diverse da quelli
   commerciali (Team, Enterprise): verificare uso per l'addestramento, conservazione, DPA.

---

## 5.2 Modello «light» (professionista o piccola organizzazione)

### Passi

1. **Leggi** le avvertenze (capitolo 0) e le condizioni del tuo piano Claude; conserva copia delle
   condizioni e, se disponibile, del DPA.
2. **Configura** Claude come indicato al §2.6 (addestramento, memoria, connettori, feedback).
3. **Compila** il modello qui sotto (copiato da `governance/policy-light.md`), adattandolo.
4. **Aggiorna** l'informativa privacy dello studio, se usi l'IA su dati dei clienti.
5. **Valuta** se serve una DPIA (art. 35 GDPR): di regola sì se tratti su larga scala dati delicati
   o categorie particolari (che comunque non dovrebbero entrare in Claude).
6. **Firma e data** il documento; rileggilo almeno una volta l'anno.
7. **Se nello studio lavorano altre persone** (soci, associati, dipendenti, collaboratori,
   praticanti): indica un referente, consegna a ciascuno le regole e fagli firmare la
   **dichiarazione di impegno** (`governance/dichiarazione-impegno.md`, anche in Word). La
   dichiarazione elenca strumenti e impostazioni autorizzati (es. immagini con oscuramento
   automatico, immagini nei PDF lette e coperte), cosa controllare prima di inviare, come segnalare
   un incidente e vale come autorizzazione al trattamento (art. 29 GDPR). Conserva le copie firmate e
   rinnovale quando cambiano le regole.

### Checklist light

- [ ] Piano Claude scelto e condizioni conservate (data: `[ ]`)
- [ ] Uso delle chat per l'addestramento disattivato (se il piano lo prevede)
- [ ] Memoria e connettori non necessari disattivati
- [ ] Pseudomania installata e verificata (prova del §2.5)
- [ ] Regole d'uso compilate e firmate
- [ ] Informativa ai clienti aggiornata (se pertinente)
- [ ] Valutazione sulla DPIA annotata (fatta / non necessaria, perché: `[ ]`)
- [ ] Procedura in caso di dato sfuggito conosciuta (punto 7)
- [ ] Data della prossima revisione: `[ ]`

### Modello da compilare

```text
REGOLE ESSENZIALI PER L'USO DELL'IA GENERATIVA CON PSEUDOMANIA PERSONAL EDITION
(modello – non è consulenza legale; la responsabilità resta di chi adotta e usa il sistema)

Titolare / professionista: [nome, studio o organizzazione, contatti]
Versione e data: [ ]

1. A COSA SI APPLICA
Uso di Claude (claude.ai) [piano: Pro / Max / Team] per il mio lavoro, tramite Chrome con
l'estensione Pseudomania Personal edition e l'app desktop Rizzo-PII sul mio computer.
Rilevamento, dizionario dei segnaposto e registro restano sul mio computer, cifrati.
Sono titolare dei trattamenti che ne derivano (o li svolgo per conto del cliente, se responsabile).

2. COSA FACCIO SEMPRE
2.1 Tengo Pseudomania attiva e, se Rizzo-PII non risponde, non invio finché non l'ho riavviato.
2.2 Prima di inviare documenti lunghi uso l'ispezione o l'anteprima e controllo cosa parte.
2.3 Tolgo o generalizzo i dettagli che rendono riconoscibile una persona anche senza nome
    (ruolo unico, data e luogo precisi, fatto noto, numero di pratica).
2.4 Verifico sempre le risposte prima di usarle.
2.5 Cancello le chat e i progetti che non mi servono più.

3. COSA NON FACCIO MAI
3.1 Non inserisco dati sanitari, giudiziari o altre categorie particolari (artt. 9-10 GDPR),
    né dati di minori, anche se pseudonimizzati, salvo valutazione specifica documentata.
3.2 Non scrivo dati personali nelle preferenze del profilo di Claude né nelle richieste di
    ricerca web.
3.3 Non chiedo a Claude di modificare, spiegare o ricostruire i segnaposto.
3.4 Non inserisco password, chiavi, segreti professionali non necessari o informazioni
    riservate che il cliente non ha autorizzato.
3.5 Non invio feedback (pollici) su chat con contenuti di clienti.

4. IMPOSTAZIONI DI CLAUDE
- Dati non usati per l'addestramento [verificare le condizioni del proprio piano].
- Memoria disattivata; connettori e integrazioni non necessari disattivati.
- Ricerca web solo se serve, senza dati personali nelle richieste.

5. CONSERVAZIONE
Dizionario delle chat: 30 giorni dall'ultimo uso. Dizionario dei progetti: finché non li
elimino. Registro locale: [es. 90 giorni]. Le conversazioni su claude.ai restano presso il
fornitore secondo le sue condizioni finché non le cancello.

6. CLIENTI E INTERESSATI
- Valuto se informare i clienti dell'uso di strumenti di IA (informativa dello studio
  [aggiornare]; per le professioni intellettuali v. art. 13 L. 132/2025 [DA VERIFICARE]).
- Verifico le condizioni del fornitore (DPA, trasferimenti extra-UE) e le conservo.
- Se l'uso è rilevante per i rischi degli interessati, valuto una DPIA (art. 35 GDPR).

7. SE QUALCOSA VA STORTO
Se è partito un dato personale non mascherato: cancello la chat, annoto data e contenuto
(senza ricopiare il dato), valuto se è una violazione di dati da notificare al Garante entro
72 ore (art. 33 GDPR) e, se il rischio è elevato, da comunicare agli interessati (art. 34).
Se il cliente è il titolare, lo avviso senza ritardo.

8. FORMAZIONE E REVISIONE
Leggo il manuale di Pseudomania e aggiorno le mie competenze sull'IA (art. 4 AI Act).
Rivedo queste regole almeno una volta l'anno o quando cambiano il servizio o le sue condizioni.

[Luogo, data, firma]
```

---

## 5.3 Modello «strutturato» (ente pubblico)

Il percorso è quello della `governance/checklist-adempimenti.md` (23 voci). Qui è riordinato in
passi; ogni passo indica il documento di partenza, chi lo cura e che cosa deve contenere.

### Passo 1 – Gruppo di lavoro e perimetro

- **Chi**: titolare (o dirigente delegato), DPO, RTD, ufficio personale, amministratori di sistema,
  ufficio contratti.
- **Che cosa**: atto che individua il servizio IA autorizzato (nel pilota: Claude Team, solo chat
  con progetti, allegati e ricerca web), gli utenti del pilota (`[n.]`, con atto `[ ]`), la durata,
  le fasi successive escluse finché regolamento e DPIA non sono aggiornati.

### Passo 2 – Verifiche sul fornitore

Riferimento: `governance/verifiche-fase0.md`.

- [ ] Commercial Terms e **DPA** di Anthropic vigenti; entità contraente per il SEE (Anthropic
  Ireland, Limited); notifica delle violazioni; cancellazione a fine contratto
- [ ] **Trasferimenti** extra-UE: clausole contrattuali tipo e **valutazione d'impatto del
  trasferimento (TIA)** documentata; Data Privacy Framework **[DA VERIFICARE]**
- [ ] **Sub-responsabili**: elenco ufficiale allegato alla DPIA, incluso il fornitore della ricerca web
- [ ] **Qualificazione ACN** del servizio cloud, ove richiesta **[DA VERIFICARE]**
- [ ] Conservazione delle chat sul piano Team e tempi di rimozione dopo la cancellazione
  **[DA VERIFICARE con Anthropic]**
- [ ] Dopo la prova tecnica: **lettera ad Anthropic** sulla compatibilità dell'estensione con i
  termini del servizio (modello in `verifiche-fase0.md` §5)

### Passo 3 – DPIA

Riferimento: `governance/dpia.md` (bozza completa: necessità, descrizione, flussi, durate, rischi,
misure, verifiche sul fornitore, parere del DPO, opinione degli interessati, piano d'azione).

Da completare:

- [ ] contesto dell'ente, uffici, numero di utenti, tipi di documenti
- [ ] valutazione dei rischi con i dati reali del pilota (test di rilevamento sul corpus dell'ente,
  soglia di accettazione `[ ]`)
- [ ] **parere del DPO** (art. 35, par. 2, GDPR)
- [ ] **opinione dei rappresentanti dei lavoratori** (art. 35, par. 9) — utile coordinarla con il passo 6
- [ ] se resta un rischio residuo alto: **consultazione preventiva del Garante** (art. 36)
- [ ] approvazione e data di riesame

### Passo 4 – Regolamento d'uso

Riferimento: `governance/policy-uso-ia.md` (bozza 0.3). Struttura e campi da compilare:

| Articolo | Contenuto | Da compilare |
|---|---|---|
| Premessa | quadro normativo (GDPR, Codice privacy, AI Act art. 4, L. 132/2025 art. 14, art. 4 L. 300/1970, provv. Garante, codici di comportamento) | linee guida AgID **[DA VERIFICARE stato]** |
| 1 Oggetto e ambito | servizio autorizzato, solo Chrome gestito con Pseudomania, utenti; esclusione della Personal edition dai trattamenti dell'ente | `[atto di individuazione degli utenti]` |
| 2 Definizioni | segnaposto, dizionario cifrato, copia di custodia, quasi-identificatori, registro minimo, account di custodia, custodi | — |
| 3 Principi | uso strumentale e di supporto; output da verificare; minimizzazione | — |
| 4 Usi consentiti | redazione, sintesi, traduzione, analisi di documenti pubblici, bozze di atti, fogli di calcolo con dati comuni pseudonimizzati | adattare agli uffici |
| 5 Usi vietati | categorie particolari e dati giudiziari; decisioni automatizzate; dispositivi personali e app; account personali; elusione; manipolazione dei segnaposto; preferenze del profilo; ricerche web con dati personali; credenziali e atti riservati; funzioni disattivate; pubblicazione senza revisione; feedback | casi ad alto rischio AI Act **[DA VERIFICARE]** |
| 6 Quasi-identificatori | cautele prima dell'invio, ispezione, segnalazioni | — |
| 7 Obblighi degli utenti | formazione, SSO, verifica, conferma annuale dei progetti, cambio PC, segnalazioni | `[indirizzo per le segnalazioni]` |
| 8 Ruoli | titolare, DPO, dirigente, RTD, amministratori di sistema, custodi, responsabili esterni | `[nomi o uffici]` |
| 9 Misure tecniche | estensione forzata, fail-closed, cifratura, impostazioni di Claude, blocco app, SSO, proxy, registri | — |
| 10 Accesso ai contenuti | registro e tracce solo per sicurezza e qualità, mai per valutare la prestazione; contenuti solo su richiesta dell'autorità giudiziaria con procedura dei custodi | `[estremi del regolamento di videosorveglianza usato come modello]` |
| 11 Conservazione | tabella del §5.4 | — |
| 12 Fornitori e trasferimenti | DPA, SCC, ACN, lettera dopo la prova tecnica | — |
| 13 Formazione | alfabetizzazione IA (art. 4 AI Act), moduli | `[ore]` |
| 14 Trasparenza | sintesi sul sito istituzionale | `[sezione del sito]` |
| 15 Incidenti e violazioni | che cosa è un incidente, segnalazione, artt. 33-34 GDPR, rotazione forzata, ridistribuzione quote | `[referente]`, `[procedura data breach]`, NIS2 **[DA VERIFICARE]** |
| 16 Sanzioni | disciplinare nei limiti dell'art. 4, c. 3, L. 300/1970 e dell'accordo | `[con le organizzazioni sindacali]` |
| 17 Condizioni di avvio e revisione | DPIA, accordo, registro, informativa, custodi, prove, verifiche; riesame entro 12 mesi | — |

### Passo 5 – Informativa ai dipendenti (Allegato A)

Riferimento: Allegato A di `governance/policy-uso-ia.md` (art. 13 GDPR). Checklist dei contenuti:

- [ ] titolare e DPO con contatti `[ ]`
- [ ] dati trattati: account e accesso; registro minimo (pseudonimo HMAC, impronte SHA-256, **nessun
  testo**); tracce pseudonimizzate; dizionario cifrato nel browser; conversazioni presso Anthropic
- [ ] avviso esplicito: **preferenze del profilo e richieste di ricerca web non sono filtrate**
- [ ] finalità e basi giuridiche (tabella), esclusione della valutazione della prestazione
- [ ] accesso ai contenuti solo su richiesta dell'autorità giudiziaria, con due custodi e verbale
- [ ] destinatari (incluso il sub-fornitore di ricerca web), trasferimenti extra-UE
- [ ] durate (§5.4), diritti, reclamo al Garante
- [ ] assenza di decisioni automatizzate; informazione sull'uso dell'IA nel rapporto di lavoro
  **[DA VERIFICARE: art. 11 L. 132/2025 e art. 1-bis d.lgs. 152/1997]**
- [ ] consegna documentata a ciascun utente prima dell'abilitazione

### Passo 6 – Accordo sindacale (art. 4 L. 300/1970)

Il registro minimo (90 giorni), le tracce Langfuse, l'esportazione tramite l'account Primary Owner e
la procedura dei custodi sono strumenti dai quali può derivare un **controllo a distanza** dei
lavoratori. Secondo il documento di indirizzo del Garante del 6/6/2024 (metadati della posta
elettronica, applicato per analogia) la conservazione oltre 21 giorni richiede le garanzie dell'art.
4, c. 1, L. 300/1970: **accordo con le rappresentanze sindacali** o, in mancanza, **autorizzazione
dell'Ispettorato nazionale del lavoro**. Lo Statuto si applica alle pubbliche amministrazioni
**[DA VERIFICARE: art. 51, c. 2, d.lgs. 165/2001]**.

Schema dei contenuti dell'accordo (da negoziare; non è un testo approvato):

```text
ACCORDO AI SENSI DELL'ART. 4, COMMA 1, L. 300/1970
sull'uso del servizio Claude Team tramite Pseudomania Server edition – SCHEMA

Parti: [Ente] e [RSU / organizzazioni sindacali]          Data: [ ]

1. Oggetto: strumenti e trattamenti coperti
   - registro minimo del server (pseudonimo HMAC, ufficio, azioni, conteggi, impronte SHA-256,
     nessun testo) – conservazione 90 giorni, poi solo aggregati anonimi;
   - tracce di osservabilità (testi pseudonimizzati) – 30 giorni nel pilota, poi 7;
   - esportazione dei dati di Claude Team tramite account di custodia;
   - procedura dei custodi (recupero progetti, richieste dell'autorità giudiziaria).
2. Finalità ammesse: sicurezza, verifica del funzionamento e qualità del rilevamento,
   accertamenti su richiesta dell'autorità giudiziaria.
3. Finalità escluse: valutazione della prestazione, controllo dell'attività lavorativa,
   uso disciplinare salvo [limiti concordati ex art. 4, c. 3].
4. Accessi: amministratori solo in forma aggregata o pseudonima; contenuti solo su richiesta
   scritta dell'autorità giudiziaria, due custodi, estrazione della sola parte richiesta,
   distruzione del resto, verbale.
5. Informazione ai lavoratori: informativa (Allegato A), formazione.
6. Verifiche: [incontro periodico], comunicazione di [statistiche anonime / numero di accessi
   dei custodi], riesame al termine del pilota.
7. Durata e modifiche: ogni modifica di strumenti, durate o finalità richiede un nuovo accordo.

[Firme]
```

### Passo 7 – Procedura dei custodi e designazioni (Allegato C)

Riferimento: Allegato C di `governance/policy-uso-ia.md`; istruzioni operative in `docs/custodi.md`.

- [ ] designazione di **almeno tre custodi** (soglia 2) **distinti dagli amministratori di sistema**,
  con sostituti; tipo di supporto e luogo di custodia delle quote `[ ]`
- [ ] designazione degli **amministratori di sistema** (provv. Garante 27/11/2008) e verifica annuale
- [ ] **postazione offline** dedicata `[ ]`
- [ ] **account di custodia** (Primary Owner) con password e secondo fattore divisi tra due custodi
- [ ] procedure: C.1 autorità giudiziaria; C.2 recupero dei progetti (approvazione del dirigente
  `[ ]`); C.3 rotazione forzata; C.4 verifica annuale e ridistribuzione delle quote; C.5 divieti
- [ ] **cerimonia di generazione** con verbale (`custodi.py verbale --tipo generazione`)
- [ ] prova di un recupero e di un'esportazione di prova con estrazione parziale e distruzione, con
  verbale

Campi minimi del **verbale dei custodi**: data e ora; operazione; estremi della richiesta (protocollo);
custodi e testimoni presenti; commit dello strumento; impronte dei file in ingresso e in uscita;
dati estratti (solo quelli richiesti); distruzione del resto; esito; firme; protocollazione.

### Passo 8 – Procedura di cancellazione e distruzione dei backup (Allegato B)

Riferimento: Allegato B di `governance/policy-uso-ia.md`.

- [ ] **principio**: cancellazione crittografica (si cancellano le voci e, quando una chiave non ha più
  voci, la sua copia di custodia; senza chiave i dati nei backup non sono più decifrabili)
- [ ] cancellazioni **ordinarie** automatiche (durate del §5.4) e **su richiesta** (utente dal pannello,
  esercizio dei diritti tramite DPO)
- [ ] **registro delle cancellazioni** in sola aggiunta, esportato fuori dal database
- [ ] dopo ogni **ripristino** da backup: riapplicazione del registro **prima** di rimettere in servizio
- [ ] rotazioni dei backup (DB ≤ 35 giorni con copia offline; key store 14 giorni, su supporti
  separati), backup cifrati
- [ ] **verbale di distruzione** (copia offline, supporti dismessi, esportazioni): data, operatori,
  oggetto e impronta, metodo, esito della verifica, firme, protocollo
- [ ] **verifica annuale** a campione, insieme a quella sugli amministratori di sistema
- [ ] i dati sotto **blocco dell'autorità giudiziaria** non si cancellano fino a revoca

### Passo 9 – Durate di conservazione

Approvare la tabella del §5.4 (regolamento art. 11, DPIA §2.5) e configurare gli stessi valori sul
server.

### Passo 10 – Adempimenti finali e avvio

- [ ] **registro dei trattamenti** aggiornato (art. 30 GDPR)
- [ ] **formazione** documentata di utenti e custodi (art. 4 AI Act)
- [ ] configurazione tecnica verificata (`docs/verifica-pilota.md`) e impostazioni di Claude Team (§3.6)
- [ ] procedura **data breach** aggiornata con gli scenari Pseudomania
- [ ] **AI Act**: classificazione degli usi (non ad alto rischio), trasparenza per testi pubblicati
  **[DA VERIFICARE]**
- [ ] **CAD** artt. 68-69: valutazione comparativa, pubblicazione del codice per il riuso
- [ ] regolamento adottato e pubblicato internamente; sintesi sul sito istituzionale (art. 14 L. 132/2025)
- [ ] licenze dei componenti rispettate (NOTICE del DFKI, attribuzioni di Rizzo-PII, sorgente AGPL)
- [ ] **riesame** al termine del pilota e comunque entro 12 mesi

### E se l'organizzazione è un'impresa privata?

Il percorso è lo stesso, con alcune differenze da valutare con il consulente **[DA VERIFICARE]**:
non si applicano le norme specifiche della PA (art. 14 L. 132/2025, CAD, qualificazione ACN, codici di
comportamento dei dipendenti pubblici); la base giuridica sarà di regola diversa dall'interesse
pubblico (per esempio contratto o legittimo interesse, con relativo bilanciamento); restano
pienamente applicabili GDPR, DPIA, art. 4 L. 300/1970 e art. 4 AI Act.

---

## 5.4 Tabella delle durate con le fonti (Server edition)

Fonti: DECISIONI.md (durate vincolanti), regolamento art. 11 e DPIA §2.5 (motivazioni). I link sono
nell'Appendice.

| Dato | Durata | Motivazione e fonti |
|---|---|---|
| Dizionario delle chat | 30 giorni dall'ultimo uso; nessun recupero dopo cambio PC | Minimizzazione e limitazione della conservazione (art. 5, par. 1, lett. c ed e, GDPR) |
| Dizionario dei progetti | durata del progetto + 30 giorni dall'ultimo uso; conferma annuale dell'utente (senza conferma scade); recupero via custodi solo su richiesta motivata | Come sopra; la conferma evita dizionari dimenticati |
| Scope `pending:` | 24 ore | Tecnica |
| Registro minimo (`audit_events`) | **90 giorni** in forma pseudonima, poi solo aggregati anonimi (giorno, ufficio, azione, conteggi) | Garante, documento di indirizzo 6/6/2024 (doc. web 10026277): oltre 21 giorni servono le garanzie dell'art. 4, c. 1, L. 300/1970; provv. Regione Lombardia (doc. web 10134221): ordine di limitare i log a 90 giorni e poi anonimizzarli. I 90 giorni sono **subordinati all'accordo sindacale o all'autorizzazione INL** |
| Tracce Langfuse | 30 giorni nel pilota, poi 7 | Minimizzazione; testi pseudonimizzati, servono solo a misurare il rilevamento (per analogia EDPB, Linee guida 3/2019 sui dispositivi video **[DA VERIFICARE: paragrafo]**) |
| Backup del DB applicativo | rotazione ≤ 35 giorni (7 giornalieri + 4 settimanali), una copia offline | Continuità di servizio; EDPB, azione coordinata 2025 sul diritto alla cancellazione (difficoltà di cancellare dai backup → durata breve e riapplicazione delle cancellazioni) |
| Key store e suoi backup | backup separati, rotazione 14 giorni | Separazione chiavi/dati; ACN, Linee guida banche dati (nov. 2024) |
| Copie di custodia (escrow) | stessa vita della chiave (rotazione 90 giorni), distrutte con la chiave | Cancellazione crittografica (NIST SP 800-88 Rev. 2, *cryptographic erase* come tecnica di *purge*) |
| Registri degli accessi di amministratori e custodi; registro delle cancellazioni | 24 mesi, sola aggiunta, catena di hash | Garante, provv. 27/11/2008 sugli amministratori di sistema (log inalterabili, almeno 6 mesi); ACN, Linee guida banche dati (almeno 24 mesi) |
| Verbali dei custodi e richieste dell'autorità | protocollati, secondo il massimario dell'ente | Linee guida AgID sulla formazione, gestione e conservazione dei documenti informatici **[DA VERIFICARE: determinazione vigente]** |
| Blocco per autorità giudiziaria | sospende la cancellazione dei soli dati indicati, fino a revoca, registrato | Obblighi di legge |
| Conversazioni su claude.ai (Team) | a tempo indeterminato salvo cancellazione; conservazione personalizzata solo sul piano Enterprise | Condizioni del fornitore (Privacy Center di Anthropic) **[DA VERIFICARE: tempi di rimozione dal back-end]** |
| Feedback ad Anthropic | fino a 5 anni, usabili per l'addestramento → **disattivati** | Privacy Center di Anthropic |

**Personal edition** (per il modello light): dizionario delle chat 30 giorni dall'ultimo uso; chat non
ancora salvate 24 ore; progetti finché l'utente non li elimina; registro locale 90 giorni (valore
predefinito del prodotto, non una durata fissata da norme); conversazioni su claude.ai secondo le condizioni del piano.
