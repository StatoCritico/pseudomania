# 2. Personal edition

Per il **singolo professionista** (avvocato, commercialista, consulente del lavoro, ingegnere,
ecc.) o la piccola organizzazione che usa claude.ai e vuole ridurre il rischio di
inviare i dati personali dei propri clienti.

La Personal edition è fatta di **due soli componenti sul tuo PC**: l'app desktop **Rizzo-PII**
(riconosce i dati) e l'**estensione Pseudomania** per Chrome (sostituisce e ripristina). Nessun
server, nessun Docker, nessun account aggiuntivo.

> **È uno strumento volontario.** Puoi spegnerlo con un clic, conversazione per conversazione, e non protegge altri browser né le
> app di Claude. Sei tu il titolare (o il responsabile, per conto del cliente) dei trattamenti:
> rileggi le avvertenze del capitolo 0 e, prima di iniziare, prepara le tue regole d'uso con il
> modello «light» del capitolo 5.

## 2.1 Requisiti

| Requisito | Note |
|---|---|
| PC con Windows, macOS o Linux | secondo i pacchetti offerti da Rizzo-PII; il rilascio 1.0.0 riporta un installer Windows, un AppImage Linux x86_64 e un'immagine macOS per Apple Silicon (arm64) **[DA VERIFICARE per il rilascio più recente]** |
| Memoria (RAM) | almeno 8 GB consigliati: il modello di Rizzo-PII gira sul processore (stima) |
| Google Chrome desktop, versione 116 o successiva | serve il pannello laterale; non funziona su Chrome per telefono |
| Connessione a Internet | per scaricare l'app e, al primo avvio, il modello; poi il riconoscimento avviene sul PC |
| Account claude.ai | Free, Pro, Max o Team; per i piani consumer vedi §2.6 |
| Profilo Chrome personale e PC protetto | cifratura del disco, blocco dello schermo: chi usa il tuo profilo vede i valori ripristinati |

## 2.2 Installare l'app desktop di Rizzo-PII

Istruzioni tecniche di dettaglio: `docs/installazione-personale.md`.

Rizzo-PII è un progetto open source **separato** da Pseudomania (codice MIT; i pacchetti desktop
includono componenti AGPL-3.0).

1. Apri la pagina dei rilasci: <https://github.com/Rizzo-AI-Academy/rizzo-pii/releases>.
2. Scarica il pacchetto per il tuo sistema (per esempio, nel rilascio 1.0.0:
   `Rizzo-PII-1.0.0-Windows-Setup.exe`, `Rizzo-PII-1.0.0-Linux-x86_64.AppImage`,
   `Rizzo-PII-1.0.0-macOS-arm64.dmg`) e installalo come un normale programma
   **[DA VERIFICARE: nomi dei file e procedura del rilascio più recente, 2.0.0]**. Istruzioni del
   progetto: <https://github.com/Rizzo-AI-Academy/rizzo-pii/wiki>.
3. **Avvia l'app.** Al primo avvio scarica e carica il modello (circa 1–2 GB): può richiedere
   alcuni minuti. Finché il modello non è pronto il servizio risponde «non pronto».
4. **Controlla che il servizio locale risponda**: apri in Chrome l'indirizzo
   `http://127.0.0.1:5005/health`. Deve rispondere senza errori. Se compare una schermata per
   scegliere indirizzo e porta (la porta 5005 è occupata), annota la porta scelta: andrà indicata
   nelle impostazioni dell'estensione (§2.4).
5. **Firewall** (Windows): se il sistema chiede di consentire all'app l'accesso alla rete, nega o
   consenti solo le reti private. Il servizio deve restare **solo** sul tuo PC (`127.0.0.1`).
6. Se l'app lo prevede, impostala in **avvio automatico**, così è pronta quando apri Chrome.

> **Se l'estensione non riesce a dialogare con Rizzo-PII.** Il servizio locale di Rizzo-PII non è
> stato progettato per ricevere chiamate da un'estensione del browser. Nelle prove (con un
> Rizzo-PII simulato) Chrome le accetta comunque; **con l'app desktop reale non è ancora stato
> provato [DA VERIFICARE]**. Se l'estensione mostra il messaggio «Rizzo-PII risponde ma rifiuta le
> chiamate dell'estensione (CORS)», **verrà fornita una versione modificata di Rizzo-PII** adatta a
> Pseudomania, scaricabile dal sito <https://pseudomania.statocritico.it>. Fino ad allora **non usare
> la Personal edition con dati di clienti**.

## 2.3 Installare l'estensione

**Dal Chrome Web Store** (quando sarà disponibile **[DA VERIFICARE]**): apri il collegamento
indicato sul sito <https://pseudomania.statocritico.it> e scegli **Aggiungi a Chrome**.

**Dal pacchetto del codice**, finché non è sul Web Store:

1. Scarica il codice di Pseudomania (collegamento sul sito) e scompattalo in una cartella che non
   sposterai più, per esempio `C:\pseudomania` oppure `~/pseudomania`.
2. In Chrome apri l'indirizzo `chrome://extensions`.
3. Attiva **Modalità sviluppatore** (interruttore in alto a destra).
4. Scegli **Carica estensione non pacchettizzata** e seleziona la cartella `extension` (quella che
   contiene il file `manifest.json`).
5. Fissa l'icona nella barra: icona a forma di **puzzle** → puntina accanto a **Pseudomania**.

Senza alcuna policy aziendale l'estensione parte automaticamente in **Personal edition** (la pagina
«Impostazioni e informazioni» lo indica: «Personal edition»).

## 2.4 Configurazione

1. **Clic destro** sul pulsante di Pseudomania → **Impostazioni e informazioni** (pagina «Impostazioni
   di Pseudomania»).
2. Campo **Indirizzo di Rizzo-PII desktop**: lascia `http://127.0.0.1:5005` (predefinito) oppure
   la porta scelta al §2.2. Sono ammessi **solo indirizzi locali** (`127.0.0.1` o `localhost`).
3. Clic su **Verifica connessione**. Esiti possibili:

   | Messaggio | Cosa fare |
   |---|---|
   | «Rizzo-PII raggiungibile.» | tutto a posto: **Salva** |
   | «Rizzo-PII si sta avviando: riprova tra poco.» | attendi il caricamento del modello e riprova |
   | «Rizzo-PII non raggiungibile: avvia l'app desktop.» | avvia Rizzo-PII; controlla porta e indirizzo |
   | «Rizzo-PII risponde ma rifiuta le chiamate dell'estensione (CORS)…» | vedi il riquadro del §2.2 |

4. Clic su **Salva** («Impostazioni salvate.»).

Nella stessa pagina ci sono tre gruppi di scelte. Si salvano **subito**, senza premere Salva
(«Impostazione salvata.»):

- **Attivazione nelle conversazioni**: «Disattivata di default» (predefinita), «Attiva di
  default» o «Attiva con richiesta». Vedi §2.6.
- **Immagini (screenshot, foto)**: «Oscuramento automatico» (predefinita), «Conferma per ogni
  immagine» o «Bloccate». Vedi §2.7.
- **Immagini nei PDF (firme, timbri, fotografie, pagine scansionate)**: «Leggi e copri i dati»
  (predefinita, consigliata), «Togli le immagini» o «Lascia le immagini». Vedi §2.7.

Non ci sono altre impostazioni obbligatorie. In fondo alla pagina, nella sezione
«Informazioni», trovi versione, licenza e sito.

## 2.5 Verifica: l'indicatore di stato

Lo stato è **sempre visibile** in due punti e si riferisce sempre alla **conversazione aperta**
nella scheda.

**Badge sul pulsante dell'estensione**

| Badge | Significato |
|---|---|
| **ON** verde | protezione attiva in questa conversazione |
| **OFF** arancione (icona grigia) | protezione **disattivata** in questa conversazione (stato di partenza): ciò che invii parte in chiaro |
| **?** arancione | solo in modalità «Attiva con richiesta»: Pseudomania aspetta la tua scelta (intanto i messaggi restano protetti) |
| **!** rosso | Rizzo-PII spento, in avvio o non raggiungibile (CORS) |

**Barra colorata sopra la casella di scrittura di claude.ai**: verde «Pseudomania attivo: i dati
personali vengono pseudonimizzati prima dell'invio»; arancione «Protezione disattivata: i messaggi
partono in chiaro. Per attivarla clicca l'icona di Pseudomania o premi Alt+Maiusc+P».

**Prova rapida** (con dati inventati):

1. Apri claude.ai, nuova chat. La protezione parte disattivata (badge **OFF**): clicca il pulsante
   di Pseudomania o premi **Alt+Maiusc+P** finché il badge diventa **ON** verde.
2. Scrivi: `Scrivi una breve lettera a Mario Rossi, mario.rossi@example.it` e invia.
3. Nel fumetto del messaggio inviato devono comparire `[FULLNAME_1]` e `[EMAIL_1]` (e, nel primo
   messaggio, l'istruzione fissa sui segnaposto).
4. Nella risposta di Claude «Mario Rossi» e l'indirizzo email devono tornare visibili,
   **evidenziati in verde**.
5. Sotto il messaggio inviato compare il contrassegno «2 dati protetti»: cliccandolo si apre il
   pannello di ispezione (§4.7).

Se la prova non riesce, vedi il capitolo 6.

## 2.6 Attivare e disattivare la protezione (per conversazione)

Nella Personal edition la protezione si sceglie **conversazione per conversazione**. Di
partenza è **disattivata di default**: la attivi tu dove serve. Puoi cambiare questo
comportamento nelle impostazioni (§2.4), alla voce **Attivazione nelle conversazioni**:

| Modalità | Che cosa succede |
|---|---|
| **Disattivata di default** (predefinita) | ogni nuova conversazione parte senza protezione; la attivi con il pulsante o Alt+Maiusc+P. Le conversazioni attivate restano attive. È il comportamento descritto in questo paragrafo |
| **Attiva di default** | ogni nuova conversazione parte protetta; la spegni con il pulsante o Alt+Maiusc+P. Le conversazioni spente restano spente quando le riapri |
| **Attiva con richiesta** | se l'ultima scelta era «attiva», le nuove conversazioni partono protette; altrimenti compare un banner con **Attiva** / **Continua senza protezione** (badge **?**). Le conversazioni spente chiedono di nuovo quando le riapri. Finché non scegli, i messaggi restano protetti |

**Il pulsante di Pseudomania** nella barra degli strumenti di Chrome (non apre una finestra):

| Azione | Effetto |
|---|---|
| **clic** sul pulsante, con claude.ai aperto | attiva o disattiva la protezione della **conversazione aperta** nella scheda; compare per un attimo «Pseudomania attivato per questa conversazione» oppure «Pseudomania disattivato per questa conversazione: i messaggi partiranno in chiaro» |
| scorciatoia **Alt+Maiusc+P** | come il clic (modificabile da `chrome://extensions/shortcuts`) |
| **clic destro** sul pulsante | menu con «Apri pannello di ispezione» e «Impostazioni e informazioni» |
| clic su una scheda che non è claude.ai | apre le impostazioni |

**Lo stato si salva per conversazione** (dentro un progetto, per ogni chat). Quando cambi chat
nella stessa scheda, badge e barra si aggiornano subito.

**Nuova conversazione o conversazione ripresa** (modalità «Disattivata di default»)

| Situazione | Che cosa succede |
|---|---|
| nuova conversazione, pagina di progetto o nuova scheda | protezione **disattivata**, nessuna domanda |
| conversazione ripresa che avevi attivato | si riattiva da sola (anche in un'altra scheda o dopo il riavvio di Chrome) |
| conversazione ripresa che era disattivata | resta disattivata |

Con la protezione disattivata vedi solo il badge **OFF** arancione e la barra arancione
«Protezione disattivata: i messaggi partono in chiaro. Per attivarla clicca l'icona di
Pseudomania o premi Alt+Maiusc+P». Prima di scrivere dati di clienti, **attivala** con il
pulsante o con Alt+Maiusc+P.

**Che cosa cambia spegnendo.** La disattivazione riguarda **solo ciò che invii**: messaggi e allegati
partono in chiaro, così come li scrivi (barra arancione). Il **ripristino**
dei segnaposto nelle risposte, negli appunti e nei download resta **sempre attivo**.

**Primo spegnimento** in una conversazione che contiene già dati protetti: compare l'avviso
«Disattivare la protezione in questa conversazione?» — da ora ciò che invii andrà a Claude in chiaro
e **riattivare in seguito non ripulisce quanto già inviato**. Conferma con **Disattiva** o rinuncia.

Ogni cambio di stato viene annotato nel registro locale (solo l'evento, nessun testo).

**Quando Rizzo-PII non risponde** l'estensione **non invia di nascosto**: mostra la finestra
«Rizzo-PII non risponde» con l'esito di un **controllo locale di base** (email, codici fiscali,
IBAN, telefoni, partite IVA) e due pulsanti: **Annulla** e **Invia senza protezione**. Il
controllo di base **non maschera nulla** e non è una garanzia: se il messaggio contiene dati di
clienti, scegli **Annulla** e riavvia Rizzo-PII.

### Categorie particolari di dati (salute, reati, sindacato…)

Se un messaggio o un file contiene termini che indicano **categorie particolari** (artt. 9-10 GDPR:
salute, disabilità, condanne e reati, appartenenza sindacale, opinioni politiche, convinzioni
religiose, origine etnica, vita sessuale, dati genetici o biometrici) l'invio è **bloccato di
default** e compare la finestra **«Categorie particolari di dati: invio bloccato»** con la categoria
trovata.

- La scelta più prudente è **Annulla** (è il pulsante selezionato all'apertura: premere Invio non
  invia nulla) e riformulare senza quei riferimenti. Resta il messaggio di blocco con
  **Segnala blocco errato** per i falsi positivi.
- Se il **regolamento dello studio lo consente** (o il referente lo ha autorizzato) puoi spuntare
  **«Ho verificato che l'invio è consentito»** e scegliere **Invia pseudonimizzato**: nomi, codici,
  indirizzi e recapiti diventano segnaposto, ma il **contenuto** (per esempio una diagnosi o un
  reato) arriva a Claude, e il contesto può rendere riconoscibile la persona.
- La conferma vale per **quel solo invio o quel solo file** (TXT, CSV, Markdown, DOCX, XLSX, PDF,
  immagini lette con OCR): il successivo chiede di nuovo.
- La scelta resta nel **registro locale** (solo la categoria, mai il testo).

Le regole che riconoscono queste categorie sono incluse nell'estensione e sono una bozza. Nella
Server edition il blocco resta senza possibilità di inviare.

### Impostazioni di Claude consigliate (piani Free, Pro, Max)

I piani consumer seguono condizioni diverse da quelle commerciali (Team, Enterprise): in
particolare le conversazioni possono essere usate per migliorare i modelli se l'impostazione è
attiva. Consigli:

1. claude.ai → profilo → **Impostazioni** → **Privacy**: disattiva l'uso delle chat per migliorare
   i modelli **[DA VERIFICARE: etichetta esatta]**.
2. Disattiva la **memoria** di Claude: riporterebbe segnaposto tra conversazioni diverse, che non
   possono essere ripristinati.
3. Disattiva i **connettori** che non servono (i loro contenuti non passano da Pseudomania).
4. Non usare i pulsanti di **feedback** (pollice su/giù) nelle chat con dati di clienti.
5. Non scrivere dati personali nelle **preferenze del profilo** né chiedere ricerche web su persone.
6. Per un uso professionale stabile con dati di clienti valuta un **piano commerciale**.

## 2.7 File: PDF, DOCX, XLSX, immagini

| Formato | Che cosa succede |
|---|---|
| **DOCX, XLSX** | pseudonimizzati **dentro l'estensione** (testo, intestazioni e piè di pagina, note, commenti, proprietà del documento, celle e valori delle formule). A Claude arriva il file con i segnaposto. Quando scarichi un DOCX o XLSX generato da Claude, i valori reali vengono ripristinati. |
| **TXT, CSV, MD** | pseudonimizzati |
| **PDF** | inviato a Claude **come PDF**, con l'impaginazione originale: i dati personali vengono **tolti** dal documento e sostituiti dai segnaposto; le immagini contenute (firme, timbri, fotografie, pagine scansionate) secondo l'impostazione «Immagini nei PDF». I PDF **scaricati** da Claude vengono ripristinati con l'impaginazione. Vedi «PDF» qui sotto |
| **Immagini** (screenshot, foto: PNG, JPG, WebP, GIF, BMP) | secondo l'impostazione «Immagini»: **oscuramento automatico** (predefinito: il testo viene letto sul PC e i dati personali coperti con il segnaposto), **conferma per ogni immagine** (l'immagine parte così com'è) o **bloccate**. Vale per immagini incollate, trascinate o allegate. Vedi sotto |
| Altri formati | **bloccati**: il file non viene allegato |

**Immagini.** Con l'**oscuramento automatico** (predefinito) l'estensione legge il testo
dell'immagine **sul tuo PC** con il riconoscimento ottico dei caratteri (OCR, Tesseract incluso
nell'estensione: nulla esce dal PC), Rizzo-PII trova i dati personali e l'estensione li copre con
un riquadro nero che riporta il segnaposto (es. `[FULLNAME_1]`), lo stesso usato nel testo della
conversazione. Prima dell'invio compare la finestra «Inviare l'immagine oscurata?» con
l'**anteprima** e il numero di dati coperti: scegli **Annulla** (non parte nulla) o **Invia
l'immagine oscurata**. Se nell'immagine non viene riconosciuto testo, o la lettura è incerta (foto
storte, sfocate, scrittura a mano), la finestra lo segnala: guarda bene l'anteprima, perché l'OCR
può non riconoscere tutto. L'immagine viene sempre ricodificata (i metadati, ad esempio la
posizione GPS delle foto, vengono tolti). HEIC e TIFF vengono bloccati. La prima lettura dopo
l'avvio di Chrome richiede qualche secondo in più.

Con «**Conferma per ogni immagine**» compare invece la finestra «Inviare questa immagine?» con
l'anteprima e l'avviso: nomi, codici, indirizzi o altri dati visibili nell'immagine arriveranno a
Claude così come sono. Scegli **Annulla** o **Invia l'immagine**. Con «**Bloccate**» l'immagine non
viene allegata e compare un banner rosso.

In tutti i casi il nome del file viene sostituito con un nome generico (es.
`immagine-20261105183000.png`) e il registro locale annota l'operazione e i conteggi, mai
l'immagine né il testo.

> Con la protezione **disattivata** le immagini partono come qualsiasi file, senza controlli.

**PDF.** Il PDF allegato viene elaborato **sul tuo PC**, dentro l'estensione (motore MuPDF
incluso), e parte verso Claude **come PDF**, con la stessa impaginazione:

- Rizzo-PII trova i dati personali nel testo; ogni dato viene **tolto davvero** dal documento
  (non solo coperto da un rettangolo: chi copia il testo dal PDF inviato non lo ritrova) e al suo
  posto viene scritto il segnaposto;
- vengono ripuliti anche i metadati (autore, titolo, programma), le annotazioni e i commenti, i
  campi dei moduli, i segnalibri e gli allegati incorporati;
- prima dell'invio l'estensione rilegge il PDF prodotto: se un dato personale è ancora leggibile
  il file **non** parte e compare un avviso;
- il nome del file viene pseudonimizzato come per gli altri formati.

Per le **immagini nei PDF** (firme, timbri, fotografie, loghi e le pagine scansionate, che per il
PDF sono immagini) vale l'impostazione «Immagini nei PDF»:

| Scelta | Che cosa succede |
|---|---|
| **Leggi e copri i dati** (predefinita, consigliata) | il testo delle immagini viene letto sul PC con l'OCR e i dati personali trovati vengono cancellati dall'immagine e coperti dal segnaposto. Così anche i **PDF scansionati** vengono letti. Vale per le prime **30 pagine** con immagini: oltre, le immagini restano come sono e un avviso lo segnala |
| **Togli le immagini** | tutte le immagini vengono tolte dal PDF inviato: Claude riceve solo il testo impaginato; le pagine scansionate arrivano vuote. Un avviso indica quante immagini sono state tolte |
| **Lascia le immagini** | le immagini arrivano a Claude così come sono, **senza alcun controllo**. Scegliendola compare una seconda finestra di conferma (il pulsante evidenziato è «Annulla»); se annulli resta la scelta precedente. Ogni PDF con immagini inviato così mostra un avviso |

**PDF scaricati da Claude.** Quando scarichi un PDF prodotto da Claude i segnaposto vengono
sostituiti con i valori reali **sul tuo PC**, dall'estensione, conservando l'impaginazione: non
serve una funzione particolare dell'app Rizzo-PII. Solo se questo non riesce l'estensione ripiega
su un PDF di solo testo (compare un avviso).

**Limiti dei PDF.**

- Le righe in cui un dato è stato sostituito (o ripristinato) vengono riscritte con il carattere
  **Helvetica**: possono apparire un po' diverse dal resto del documento e, se il segnaposto è più
  lungo del dato, il testo viene rimpicciolito per stare nello spazio.
- I valori **troppo corti** (ad esempio sigle di una o due lettere) non vengono coperti nel PDF,
  perché coprirli cancellerebbe anche altre parole uguali: restano leggibili e un avviso lo dice.
  Se sono dati da proteggere, non inviare il file.
- I PDF **protetti** da password o da restrizioni vengono bloccati: togli la protezione (ad
  esempio stampandoli come nuovo PDF) e allegali di nuovo.
- I PDF **firmati digitalmente** (firma qualificata PAdES o CAdES, firma grafica): la firma viene
  **tolta** prima dell'invio, perché contiene il certificato del firmatario con nome e codice
  fiscale, e spesso un riquadro visibile con il nome. Il PDF inviato a Claude non è firmato (la
  firma non sarebbe comunque più valida dopo la pseudonimizzazione); l'originale firmato resta sul
  tuo computer. Un avviso lo segnala.
- L'OCR può **sbagliare** (scritte a mano, timbri, immagini sfocate o storte): qualche dato nelle
  immagini può restare visibile. Per documenti delicati scansionati valuta «Togli le immagini».
- Se il PDF non può essere trattato come PDF (file danneggiato o formato insolito), l'estensione
  ripiega sul vecchio metodo: il testo parte come **file di testo pseudonimizzato (.txt)**, con un
  avviso (impaginazione e immagini non vengono inviate).

Consiglio: per documenti lunghi apri l'**anteprima** (Ctrl+Maiusc+Invio, §4.6) o il pannello di
ispezione e controlla che cosa parte davvero.

## 2.8 Dati locali cifrati

Tutto resta nel tuo profilo Chrome, nell'archivio dell'estensione (IndexedDB, database
`pseudomania`). **Nessun dato va a server di Pseudomania**; a claude.ai arriva solo il testo con i
segnaposto.

| Dato | Protezione | Durata |
|---|---|---|
| Dizionario delle **chat** | valori cifrati (AES-GCM) con una chiave locale **non estraibile**; indice valore → segnaposto con HMAC a chiave locale | 30 giorni dall'ultimo uso |
| Dizionario delle **chat nuove non ancora salvate** da claude.ai | come sopra | 24 ore |
| Dizionario dei **progetti** | come sopra | finché non lo elimini tu dal pannello |
| Registro locale | cifrato; solo azioni, conteggi e impronte, **mai testi** | 90 giorni (valore predefinito del prodotto) |
| Dati del pannello di ispezione (originale e inviato) | solo in memoria della sessione | fino alla chiusura del browser |

Conseguenze da conoscere:

- **Nessun backup**: la chiave non si può esportare, per scelta. Il dizionario non si trasferisce
  su un altro PC o un altro profilo Chrome.
- **Cambio PC, nuovo profilo, cancellazione dei dati del browser** (con i dati dei siti e delle
  estensioni): i dizionari sono persi e nelle vecchie conversazioni i segnaposto restano tali.
  Nella Personal edition **non esiste recupero**. Conserva i dati reali che ti servono nei tuoi
  fascicoli, fuori da Claude.
- **Cancellare un dizionario**: pannello di ispezione → «Elimina i dati di questa conversazione» o
  «Elimina i dati di questo progetto». È definitivo («Dati eliminati da questo computer.»).
- Le conversazioni restano su claude.ai (con i segnaposto) secondo le condizioni di Anthropic,
  finché non le cancelli.

## 2.9 Aggiornare

- Estensione dal Web Store: si aggiorna da sola.
- Estensione dal pacchetto: sostituisci i file **nella stessa cartella**, poi `chrome://extensions`
  → **Aggiorna**. **Non rimuovere** l'estensione per aggiornarla: perderesti dizionario e registro.
- Rizzo-PII: segui le istruzioni del progetto per i nuovi rilasci.

## 2.10 Disinstallare

1. `chrome://extensions` → Pseudomania → **Rimuovi**. Vengono cancellati in modo irreversibile
   anche dizionario e registro locali.
2. Disinstalla l'app Rizzo-PII dal sistema operativo e, se vuoi liberare spazio, cancella la cache
   del modello **[DA VERIFICARE: posizione della cache dell'app desktop]**.
3. Cancella da claude.ai le conversazioni che non ti servono più.
