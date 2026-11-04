# 4. Uso quotidiano

Questo capitolo è per **chi usa claude.ai** con Pseudomania, in entrambe le edizioni. Dove il
comportamento è diverso è indicato **(Personal)** o **(Server edition)**.

> I nomi dei pulsanti di claude.ai citati qui possono cambiare con gli aggiornamenti del sito
> **[DA VERIFICARE sull'interfaccia reale]**. I testi dei messaggi di Pseudomania sono invece quelli
> dell'estensione.

## 4.1 Prima di iniziare: controlla lo stato

- Sopra la casella di scrittura deve esserci la **barra di Pseudomania** con la scritta
  «Pseudomania attivo: i dati personali vengono pseudonimizzati prima dell'invio».
- **(Server edition)** Se compare «Accesso richiesto: effettua il login a Pseudomania dal pulsante
  dell'estensione», clic sul pulsante di Pseudomania → **Accedi**. Il pulsante è sempre acceso:
  la protezione non si può spegnere.
- **(Personal)** Il badge sul pulsante deve essere **ON** verde per la conversazione aperta (§2.5).
  Se compare il banner «Vuoi attivare Pseudomania per questa conversazione?», scegli **Attiva**
  (o **Continua senza protezione** solo per conversazioni senza dati di terzi): vedi §2.6.
- Se la barra non c'è, o compare «Pagina non riconosciuta da Pseudomania», **non inviare dati
  personali** e vedi il capitolo 6.

## 4.2 Scrivere e inviare un messaggio

Scrivi come al solito e premi **Invio** (o il pulsante di invio). Per un attimo compare
«Pseudonimizzazione in corso…», poi il testo nella casella viene sostituito con la versione con i
segnaposto e parte.

- Nel fumetto del tuo messaggio vedrai i **segnaposto** (`[FULLNAME_1]`, `[CF_1]`…): è ciò che ha
  ricevuto Claude.
- Nel **primo messaggio** di ogni conversazione vedrai anche l'istruzione fissa per Claude: «I testi
  contengono segnaposto tra parentesi quadre come [FULLNAME_n] o [CF_n] (n = numero). Riportali
  esattamente come sono…». È normale.
- **Modificare un messaggio già inviato**: la casella di modifica mostra i segnaposto (è il testo
  realmente inviato). Puoi aggiungere testo nuovo: verrà pseudonimizzato al reinvio.
- **Rigenerare** una risposta: il messaggio rinviato è già pseudonimizzato.

## 4.3 Allegati

Trascina, incolla o scegli i file come sempre: l'estensione li intercetta prima del caricamento.

| Formato | (Personal) | (Server edition) |
|---|---|---|
| DOCX, XLSX | pseudonimizzati nell'estensione | pseudonimizzati dal server |
| TXT, CSV, MD | pseudonimizzati | pseudonimizzati |
| PDF | inviato come **file di testo pseudonimizzato (.txt)** con avviso (impaginazione e immagini non partono) | pseudonimizzato dal server |
| Immagini, altri formati | **bloccati** | **bloccati** |

Anche il **nome del file** può contenere dati personali: viene pseudonimizzato in entrambe le
edizioni (per esempio `Lettera_Mario_Rossi.docx` parte come `Lettera_[FULLNAME_1].docx`).
**(Personal)** Nel nome del file i trattini bassi sono letti come spazi, così «Mario_Rossi» viene
riconosciuto come nome; quando il nome viene ripristinato (per esempio al download) compare con lo
spazio: `Lettera_Mario Rossi.docx`. Un file troppo grande viene rifiutato («Il file supera la dimensione
massima consentita…»).

**Testo lungo incollato**: claude.ai può trasformarlo in un allegato; l'estensione lo controlla
comunque.

## 4.4 Progetti

Nei progetti di claude.ai vengono pseudonimizzati anche le **istruzioni del progetto** e i **file
della conoscenza** del progetto. Tutte le chat dentro lo stesso progetto condividono **lo stesso
dizionario**: lo stesso nome ha lo stesso segnaposto in tutte le chat del progetto.

- I dizionari dei progetti durano più a lungo di quelli delle chat (vedi §4.11, §2.8 e §3.11).
- **Non condividere** progetti con i colleghi: ogni dizionario appartiene a una sola persona e i
  colleghi vedrebbero solo segnaposto **(Server edition: la condivisione è spenta dall'ente)**.

## 4.5 La risposta con i dati ripristinati

Mentre Claude scrive, l'estensione sostituisce i segnaposto con i **valori reali**, solo nella tua
pagina:

| Aspetto | Significato |
|---|---|
| testo evidenziato in **verde** | valore ripristinato dal dizionario |
| segnaposto evidenziato in **rosso** + avviso «… segnaposto nella risposta non sono nel dizionario» | Claude ha scritto un segnaposto che non esiste (inventato o modificato) oppure di un'altra conversazione: **non fidarti** di quel punto |
| segnaposto in **grigio** + avviso «… non sono ripristinabili» | il dizionario era stato cifrato su un altro computer (vedi §4.10) |

- **Copiare**: selezionando e copiando il testo, o con i pulsanti «Copia» del sito, negli appunti
  arrivano i **valori reali**.
- **Scaricare** un file DOCX, XLSX o di testo generato da Claude: i valori vengono ripristinati nel
  file. Se non è possibile, il file viene scaricato con i segnaposto e un avviso. **(Personal)** I PDF
  non vengono ripristinati.
- **Artifact** mostrati in un riquadro separato: **non** vengono ripristinati. Pubblicare o condividere
  un artifact espone solo segnaposto.

**Verifica sempre la risposta** prima di usarla: l'IA può sbagliare, e un segnaposto spostato può
attribuire un dato alla persona sbagliata.

## 4.6 Anteprima prima dell'invio (Ctrl+Maiusc+Invio)

Per controllare **prima** che cosa partirà, premi **Ctrl+Maiusc+Invio** invece di Invio. Si apre la
finestra «Anteprima di ciò che verrà inviato» con due colonne, «Testo originale» e «Testo inviato a
Claude». Scegli **Invia** se va bene, **Annulla** per correggere.

Usala soprattutto con testi lunghi, elenchi di persone, testi con nomi stranieri o insoliti.

## 4.7 Il pannello di ispezione

Sotto ogni messaggio inviato compare un contrassegno, per esempio «3 dati protetti» (oppure
«nessun dato personale»). Cliccandolo si apre a lato il pannello **«Ispezione Pseudomania»** (in
alternativa: **(Personal)** clic destro sul pulsante di Pseudomania → **Apri pannello di ispezione**;
**(Server edition)** clic sul pulsante → **Apri pannello di ispezione**).

Il pannello mostra:

- **Originale (solo su questo computer)** e **Inviato a Claude**, affiancati;
- **Dati sostituiti**: l'elenco dei segnaposto e del tipo di dato;
- **Mostra le risposte con i segnaposto**: come le ha scritte davvero Claude;
- i pulsanti di **segnalazione** (§4.8) e, dopo un invio bloccato, **Segnala blocco errato** (§4.9);
- **Elimina i dati di questa conversazione / di questo progetto**: cancella il dizionario (definitivo:
  le risposte già ricevute non saranno più ripristinate);
- **(Server edition)** la **conferma annuale** del progetto (§4.11), il **recupero** da un altro computer
  (§4.10) e l'identificativo abbreviato della chiave di cifratura attiva.

Il contenuto «originale/inviato» resta solo nella memoria della sessione: chiudendo il browser si
perde e i contrassegni sui messaggi vecchi non ricompaiono.

## 4.8 Segnalazioni

Dal pannello di ispezione:

- **Segnala dato non riconosciuto**: un dato personale è partito senza essere sostituito (falso
  negativo);
- **Segnala mascheramento errato**: è stato sostituito qualcosa che non era un dato personale
  (falso positivo).

Nel campo «Nota facoltativa» **non scrivere dati reali**: usa i segnaposto o descrivi il tipo di
dato («un cognome straniero», «un numero di pratica»). La nota viene comunque ripulita dai valori
noti.

- **(Server edition)** la segnalazione va al server dell'organizzazione e serve a migliorare il
  rilevamento. Se è partito un dato reale, avvisa **anche** il referente indicato dal regolamento:
  può essere una violazione di dati da valutare.
- **(Personal)** la segnalazione resta nel registro locale («Segnalazione salvata nel registro locale»).
  Se è partito un dato di un cliente, cancella la chat e valuta se è una violazione (vedi §5.2,
  punto 7 del modello light).

## 4.9 Blocchi per categorie particolari di dati

Se il testo o un allegato sembra contenere **dati sanitari, giudiziari o altre categorie
particolari** (artt. 9-10 GDPR), compare il banner rosso **«Invio bloccato»** con un messaggio del
tipo: «Il contenuto sembra includere dati relativi alla salute (art. 9 GDPR), ad esempio
«certificato medico». […] Rimuovi o generalizza questi riferimenti e riprova. Se pensi che il blocco
sia sbagliato, segnalalo con il pulsante «Segnala blocco errato» nel pannello laterale di
Pseudomania».

- Il blocco **non si può forzare**.
- Riformula senza quei riferimenti o, se servono davvero, **non usare Claude** per quel testo.
- Se pensi che il blocco sia sbagliato (per esempio una circolare generale sulle assenze), usa il
  pulsante **«Segnala blocco errato»**: compare nel banner rosso e nel pannello di ispezione, dove la
  sezione dedicata mostra «Ultimo invio bloccato (categoria «…») alle …». Funziona **anche se il
  messaggio non è partito** e non invia il testo: registra solo la categoria del blocco
  («Segnalazione inviata. Grazie.»; **(Personal)** la segnalazione resta nel registro locale).
  **(Server edition)** Per casi urgenti puoi rivolgerti anche all'help desk.
- Il blocco non sostituisce il tuo giudizio: i dati particolari **non vanno inseriti** anche quando
  l'estensione non li riconosce.

Altri blocchi possibili: server o servizio di riconoscimento non disponibile **(Server edition)**, pagina
non riconosciuta, testo che non è stato possibile sostituire nella casella. In tutti questi casi
l'invio è fermato per sicurezza: vedi il capitolo 6.

## 4.10 Cambio PC: segnaposto non ripristinabili e recupero

Il dizionario è cifrato con una chiave che **non lascia il tuo browser**. Se cambi computer, profilo
Chrome o cancelli i dati del browser, le conversazioni precedenti mostrano segnaposto **grigi** con
l'avviso «… segnaposto non sono ripristinabili: il dizionario è stato cifrato su un altro computer».

- **Chat**: il recupero **non è previsto** (in nessuna edizione).
- **Progetti (Personal)**: nessun recupero.
- **Progetti (Server edition)**: recupero possibile **su richiesta motivata**, approvata dal dirigente:
  1. apri il progetto sul nuovo PC, poi il pannello di ispezione → sezione «Recupero da un altro
     computer (solo progetti)» → **Prepara il recupero**;
  2. il pannello mostra «Codice del dispositivo da comunicare all'assistenza: …»: apri un ticket
     all'help desk con il codice e il motivo;
  3. due custodi ricifrano offline la tua vecchia chiave per questo computer; l'amministratore la
     carica;
  4. entro un minuto l'estensione la scarica da sola (oppure **Verifica chiavi recuperate**): i valori
     tornano visibili. La chiave recuperata resta disponibile per 7 giorni: non cambiare di nuovo PC
     nel frattempo.

Le voci create negli ultimi minuti prima del cambio (non ancora caricate entro 10 minuti) possono
restare non ripristinabili.

## 4.11 Conferma annuale dei progetti (Server edition)

Ogni progetto ha una scadenza di conferma. Nel pannello di ispezione, sezione **«Conferma annuale del
progetto»**, compare: «Senza conferma il dizionario di questo progetto scade il …». Se il progetto è
ancora in uso, clic su **«Il progetto è ancora in uso: conferma»** → «Progetto confermato per un altro
anno.». Quando la scadenza si avvicina compare «La conferma annuale scade a breve.».

Senza conferma (o dopo 30 giorni senza uso) il dizionario viene cancellato e le risposte del progetto
non sono più ripristinabili. Cancella tu i progetti che non ti servono più.

**(Personal)** Non c'è conferma: i dizionari dei progetti restano finché non li elimini dal pannello.

## 4.12 Che cosa non fare

1. **Non scrivere dati personali nelle preferenze del profilo Claude** (istruzioni personalizzate,
   stile, nome con cui farti chiamare oltre al nome di battesimo): **non passano da Pseudomania**.
2. **Non chiedere ricerche web su persone** e non mettere nomi, codici o indirizzi nelle richieste di
   ricerca: le query sono elaborate da un sub-fornitore del servizio.
3. **Non usare l'app desktop o mobile di Claude**, altri browser o la navigazione in incognito per
   dati personali: lì Pseudomania non c'è.
4. **(Server edition)** Non accedere all'account dell'ente da **dispositivi personali** o non gestiti, e non
   usare account personali per dati dell'ente (nemmeno con la Personal edition).
5. **Non chiedere a Claude di modificare, spiegare, tradurre o "indovinare" i segnaposto**, e non
   fornire indizi per risalire al valore originale.
6. **Non inserire categorie particolari** (salute, reati, opinioni politiche…), dati di minori,
   credenziali, password, atti riservati o coperti da segreto.
7. **Non aggirare l'estensione** (scrivere i dati in forma alterata per evitarne il riconoscimento,
   incollare tramite strumenti esterni, usare un altro profilo).
8. **Non inviare feedback** (pollice su/giù) su chat con dati di terzi.
9. **(Personal)** Non spegnere la protezione in una conversazione con dati di terzi e non scegliere
   «Continua senza protezione» per abitudine: riattivare non ripulisce ciò che è già partito.
10. **Non fidarti ciecamente**: elimina o generalizza i dettagli che identificano senza nome (ruolo
    unico, data e luogo precisi, numero di pratica, fatto noto).

## 4.13 Domande frequenti

**Claude vede i miei dati?** Vede il testo con i segnaposto. Vede però tutto ciò che Pseudomania non
ha riconosciuto e tutto ciò che non passa dall'estensione (§1.5).

**Perché nel mio messaggio vedo `[FULLNAME_1]` invece del nome?** Perché è ciò che è stato inviato. Il
nome reale è nel dizionario sul tuo computer (o, nella Server edition, cifrato sul server).

**Lo stesso nome ha sempre lo stesso segnaposto?** Sì, all'interno della stessa conversazione o dello
stesso progetto. In un'altra conversazione la numerazione riparte.

**Claude ha scritto `[FULLNAME_3]` in rosso: che cosa significa?** Il segnaposto non esiste nel
dizionario: Claude lo ha inventato o alterato. Controlla quel punto e, se serve, chiedi di riscrivere
usando solo i segnaposto presenti.

**Posso spegnere Pseudomania?** **(Personal)** Sì, per la sola conversazione aperta: clic sul
pulsante o Alt+Maiusc+P. Si spegne solo l'uscita: i segnaposto delle risposte vengono comunque
ripristinati. La scelta resta salvata per quella conversazione. **(Server edition)** No: «Protezione
sempre attiva: Pseudomania è gestito dalla tua organizzazione e non può essere disattivato.»

**Ho spento la protezione e poi l'ho riaccesa: ciò che ho inviato nel frattempo è protetto?** No.
Quanto inviato con la protezione spenta è già arrivato a Claude in chiaro; se conteneva dati di terzi,
cancella la conversazione e valuta se si tratta di una violazione.

**Il server è irraggiungibile e non posso inviare: posso aggirare?** No **(Server edition)**: l'invio è
bloccato per tutelare i dati. Riprova più tardi o contatta l'assistenza.

**Ho cambiato PC e vedo segnaposto grigi.** Vedi §4.10.

**Il PDF è arrivato a Claude come .txt.** È previsto nella Personal edition (§2.7).

**L'amministratore può leggere le mie conversazioni?** **(Server edition)** No in via ordinaria: il server
non conserva testi (solo un registro minimo con impronte e uno pseudonimo, e tracce pseudonimizzate
per pochi giorni) e i dizionari sono cifrati con la tua chiave. I contenuti si estraggono **solo su
richiesta dell'autorità giudiziaria**, con due custodi e verbale (regolamento, art. 10).

**Cancellare la chat su claude.ai cancella anche il dizionario?** No: elimina il dizionario dal
pannello di ispezione (oppure attendi la scadenza). E viceversa: eliminare il dizionario non cancella
la chat su claude.ai.

**La dettatura vocale non funziona.** È disattivata da Pseudomania («La dettatura vocale è disattivata
da Pseudomania»): la voce non passerebbe dal riconoscimento.
