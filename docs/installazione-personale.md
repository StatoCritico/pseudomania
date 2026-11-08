# Pseudomania Personal edition – installazione e uso

Per il singolo professionista che usa claude.ai e vuole pseudonimizzare i dati personali dei
propri clienti. La Personal edition è fatta di **due soli componenti sul tuo PC**:

1. l'**app desktop di Rizzo-PII**, che riconosce i dati personali in italiano e lavora in locale
   (servizio su `http://127.0.0.1:5005`);
2. l'**estensione Chrome Pseudomania**, che sostituisce i dati con segnaposto prima dell'invio
   e li ripristina nelle risposte.

Nessun server di Pseudomania, nessun Docker, nessun account aggiuntivo. Dizionario e registro
restano nel browser, cifrati.

> La Personal edition è **volontaria**: la protezione parte disattivata e la attivi tu in ogni
> conversazione che ne ha bisogno. Non protegge altri browser né le app di Claude. La
> responsabilità dei trattamenti resta interamente tua, come titolare o responsabile. Una traccia di regole d'uso è in
> [`governance/policy-light.md`](../governance/policy-light.md); negli studi con più persone, ognuno firma la
> [dichiarazione di impegno](../governance/dichiarazione-impegno.md).

## Indice

1. [Cosa serve](#1-cosa-serve)
2. [Installare l'app desktop di Rizzo-PII](#2-installare-lapp-desktop-di-rizzo-pii)
3. [Installare l'estensione](#3-installare-lestensione)
4. [Verificare il collegamento](#4-verificare-il-collegamento)
5. [Uso quotidiano](#5-uso-quotidiano)
6. [File: DOCX, XLSX, PDF, immagini](#6-file-docx-xlsx-pdf-immagini)
7. [Dove stanno i dati e per quanto](#7-dove-stanno-i-dati-e-per-quanto)
8. [Backup, cambio PC e cancellazione](#8-backup-cambio-pc-e-cancellazione)
9. [Aggiornare](#9-aggiornare)
10. [Disinstallare](#10-disinstallare)
11. [Account Pro/Max: impostazioni di Claude](#11-account-promax-impostazioni-di-claude)
12. [Problemi frequenti](#12-problemi-frequenti)
13. [Se Rizzo-PII rifiuta le chiamate (CORS)](#13-se-rizzo-pii-rifiuta-le-chiamate-cors)
14. [Fonti](#14-fonti)

## 1. Cosa serve

| Requisito | Note |
|---|---|
| PC Windows, macOS o Linux | secondo i pacchetti offerti da Rizzo-PII [DA VERIFICARE] |
| RAM | almeno 8 GB consigliati (il modello di Rizzo-PII gira su CPU) — stima |
| Google Chrome ≥ 116 | l'estensione funziona solo su Chrome desktop |
| Internet | per scaricare l'app e, al primo avvio, il modello; poi il riconoscimento è locale |

## 2. Installare l'app desktop di Rizzo-PII

Rizzo-PII è un progetto open source separato (codice MIT; i binari desktop includono PyMuPDF,
AGPL-3.0).

1. Aprire la pagina dei rilasci: https://github.com/Rizzo-AI-Academy/rizzo-pii/releases
2. Scaricare il pacchetto per il proprio sistema e installarlo seguendo le istruzioni del
   progetto (wiki: https://github.com/Rizzo-AI-Academy/rizzo-pii/wiki) [DA VERIFICARE: nomi dei
   pacchetti e procedura di installazione dell'app desktop].
3. Avviare l'app. Al primo avvio scarica il modello `rizzoaiacademy/rizzo-pii-0.3B` (circa 1–2
   GB) e lo carica: può richiedere alcuni minuti.
4. Verificare che il servizio locale risponda (deve restare **solo** su `127.0.0.1`):
   ```bash
   curl http://127.0.0.1:5005/health
   ```
   oppure aprire `http://127.0.0.1:5005/health` in Chrome. Su Windows, se il firewall chiede di
   consentire l'accesso alla rete all'app, consentire **solo** le reti private o negare: l'app
   serve solo in locale.
5. Impostare l'app in avvio automatico (se l'app lo prevede), così è pronta quando apri Chrome.

## 3. Installare l'estensione

**Dal Chrome Web Store** (quando disponibile [DA VERIFICARE]): installare «Pseudomania» dalla
pagina indicata sul sito https://pseudomania.statocritico.it.

**Dal codice (decompressa)**, finché non è sul Web Store:

1. Scaricare il codice di Pseudomania (link sul sito) e scompattarlo, ad esempio in
   `C:\pseudomania` o `~/pseudomania`.
2. Chrome → `chrome://extensions` → attivare **Modalità sviluppatore**.
3. **Carica estensione non pacchettizzata** → cartella `extension` (quella con `manifest.json`).
4. Fissare l'icona di Pseudomania nella barra (icona del puzzle → puntina).

Senza policy dell'ente l'estensione parte automaticamente in **Personal edition**.

## 4. Verificare il collegamento

1. Clic sul pulsante di Pseudomania da una scheda che non è claude.ai → si aprono le impostazioni.
   (In alternativa: clic destro sul pulsante → «Impostazioni e informazioni».)
2. **Indirizzo di Rizzo-PII desktop**: `http://127.0.0.1:5005` (predefinito; sono ammessi solo
   indirizzi locali).
3. **Verifica connessione** → «Rizzo-PII raggiungibile.» → **Salva**.

Se compare «Rizzo-PII si sta avviando», attendere il caricamento del modello e riprovare. Se
compare un messaggio sul CORS vedere il §13.

## 5. Uso quotidiano

### 5.1 Il pulsante e lo stato della conversazione

La protezione si accende e si spegne **per singola conversazione** (o pagina di progetto):

- **Pulsante di Pseudomania nella barra degli strumenti** di Chrome (nessun menu): un clic
  attiva/disattiva la protezione della conversazione aperta nella scheda. Stessa funzione con la
  scorciatoia **Alt+Maiusc+P** (modificabile da `chrome://extensions/shortcuts`). Clic destro sul
  pulsante: «Apri pannello di ispezione» e «Impostazioni e informazioni». Su una scheda che non è
  claude.ai il clic apre le impostazioni.
- Lo stato vale **per scheda**, sempre riferito alla conversazione aperta:

| Badge | Barra sopra la casella | Significato |
|---|---|---|
| **ON** verde | verde | protezione attiva in questa conversazione |
| **OFF** arancione (icona grigia) | arancione | protezione disattivata (stato di partenza): messaggi e allegati partono **in chiaro** |
| **?** arancione | banner «Attiva» / «Continua senza protezione» | solo in modalità «Attiva con richiesta» (§5.2): in attesa della tua scelta; intanto i messaggi restano protetti |
| **!** rosso | — | Rizzo-PII spento, in avvio o bloccato (CORS) |

### 5.2 Regole per le conversazioni nuove e riprese

- Lo stato si **salva per conversazione** (in un progetto: per chat; la pagina del progetto ha il
  proprio stato fino al primo invio). Una chat nuova riceve il suo id dopo il primo invio: lo stato
  la segue. Il passaggio a un'altra chat nella stessa scheda viene rilevato subito.
- **Modalità di attivazione.** Nelle impostazioni dell'estensione (clic sull'icona da una scheda
  che non è claude.ai), gruppo «Attivazione nelle conversazioni», puoi scegliere tra tre modalità.
  La scelta si salva subito.
  - **Disattivata di default** (predefinita): descritta nei punti che seguono.
  - **Attiva di default:** ogni nuova conversazione parte protetta. La spegni con il pulsante o
    Alt+Maiusc+P. Le conversazioni spente restano spente quando le riapri.
  - **Attiva con richiesta:** se l'ultima scelta era «attiva», le nuove conversazioni partono
    protette; altrimenti compare il banner «Attiva» / «Continua senza protezione» (badge **?**).
    Le conversazioni spente chiedono di nuovo quando le riapri. Finché non scegli, i messaggi
    restano protetti.
- **Disattivata di default:** ogni nuova conversazione, ogni pagina di progetto e ogni nuova scheda
  partono con la protezione **disattivata**. Non compare nessuna domanda: solo la barra arancione
  «Protezione disattivata: i messaggi partono in chiaro. Per attivarla clicca l'icona di
  Pseudomania o premi Alt+Maiusc+P» e il badge **OFF**.
- **Per attivarla** clicca il pulsante di Pseudomania o premi **Alt+Maiusc+P**, prima di scrivere
  dati di clienti.
- **Conversazione ripresa:** se l'avevi attivata si riattiva da sola (anche in un'altra scheda o
  dopo il riavvio di Chrome). Ogni altra conversazione (nuova, mai vista o spenta) parte disattivata.
- **La disattivazione riguarda solo l'uscita.** Il ripristino dei segnaposto nelle risposte, negli
  appunti e nei download resta **sempre attivo**, anche con OFF.
- Al **primo spegnimento** in una conversazione che contiene già dati protetti compare un avviso:
  ciò che invierai andrà in chiaro, e riattivare la protezione non ripulisce quanto già inviato.
- Ogni cambio di stato (da pulsante o scorciatoia) viene annotato nel registro locale
  cifrato, senza testi.

### 5.3 Prova rapida e altre funzioni

- **Prova rapida:** attiva la protezione (badge **ON**), poi scrivi «Scrivi una lettera a Mario
  Rossi, mario.rossi@example.it» e invia.
  Nel messaggio inviato compaiono `[FULLNAME_1]` e `[EMAIL_1]`; nella risposta di Claude i valori
  reali tornano visibili (evidenziati in verde). Lo stesso valore nella stessa chat riceve sempre
  lo stesso segnaposto.
- **Ispezione:** sotto ogni messaggio inviato c'è «N dati protetti» → pannello laterale con testo
  originale e testo inviato. Anteprima prima dell'invio: **Ctrl+Maiusc+Invio**.
- **Rizzo-PII spento:** l'estensione avvisa e chiede **conferma** prima di inviare il testo senza
  pseudonimizzazione, mostrando l'esito di un controllo locale di base (email, codici fiscali,
  IBAN, telefoni, partite IVA). Il controllo non maschera nulla: se vedi l'avviso con dati di
  clienti, **non inviare** e riavvia Rizzo-PII.
- **Dati particolari** (salute, reati, opinioni politiche… artt. 9-10 GDPR): l'invio viene
  bloccato con un messaggio; riformula senza quei riferimenti. Le regole sono incluse
  nell'estensione e sono una bozza: segnala i falsi positivi dal pannello.
- **Allowlist:** termini pubblici (enti, istituzioni) non vengono mascherati.

## 6. File: DOCX, XLSX, PDF, immagini

| Formato | Cosa succede |
|---|---|
| DOCX, XLSX | pseudonimizzati nell'estensione (testo, intestazioni, note, commenti, celle); il file inviato a Claude ha i segnaposto; al download dei file generati da Claude i valori vengono ripristinati |
| TXT, CSV, MD | pseudonimizzati |
| PDF | inviato a Claude **come PDF**, con l'impaginazione originale: i dati personali vengono tolti dal documento e sostituiti dai segnaposto; le immagini contenute (firme, timbri, fotografie, pagine scansionate) secondo l'impostazione «Immagini nei PDF». I PDF **scaricati** da Claude vengono ripristinati con l'impaginazione. Vedi [PDF](#pdf) qui sotto |
| Immagini (screenshot, foto: PNG, JPG, WebP, GIF, BMP) | secondo l'impostazione «Immagini»: **oscuramento automatico** (predefinito: il testo viene letto sul PC con OCR e i dati personali coperti con il segnaposto), **conferma per ogni immagine** (l'immagine parte così com'è) oppure **bloccate**. Vale per immagini incollate, trascinate o allegate. Vedi sotto |
| Altri formati | bloccati |

**Immagini.** Nelle impostazioni dell'estensione, gruppo «Immagini (screenshot, foto)», puoi
scegliere:

- **Oscuramento automatico** (predefinito): l'estensione legge il testo dell'immagine sul PC
  con il riconoscimento ottico (OCR, Tesseract incluso nell'estensione: nulla esce dal PC),
  Rizzo-PII trova i dati personali e l'estensione li copre con un riquadro nero che riporta il
  segnaposto (es. `[FULLNAME_1]`), lo stesso usato nel testo della conversazione. Prima
  dell'invio vedi l'**anteprima dell'immagine oscurata** con il numero di dati coperti e scegli
  «Annulla» o «Invia l'immagine oscurata». Se l'immagine non contiene testo leggibile o la
  lettura è incerta (foto storte, sfocate, scrittura a mano) la finestra lo segnala: controlla
  bene l'anteprima, perché l'OCR può non riconoscere tutto. L'immagine viene sempre ricodificata
  (i metadati, ad es. la posizione GPS delle foto, vengono tolti) e il nome del file diventa
  generico (es. `immagine-20261107094606.png`). Formati: PNG, JPG, WebP, GIF, BMP; HEIC e TIFF
  vengono bloccati. La prima lettura dopo l'avvio di Chrome richiede qualche secondo in più.
- **Conferma per ogni immagine:** prima dell'invio compare una finestra con l'anteprima e
  l'avviso che i dati visibili nell'immagine arriveranno a Claude così come sono. Scegli
  «Annulla» o «Invia l'immagine». Il nome del file diventa generico.
- **Bloccate:** le immagini non vengono inviate (banner rosso).

Il registro locale annota l'operazione e i conteggi dei dati coperti, mai l'immagine né il testo.
Con la protezione **disattivata** le immagini partono come qualsiasi file, senza controlli.

### PDF

Il PDF allegato viene elaborato **sul tuo PC**, dentro l'estensione (motore MuPDF incluso), e parte
verso Claude **come PDF**, con la stessa impaginazione:

- il testo viene letto e Rizzo-PII trova i dati personali; ogni dato viene **tolto davvero** dal
  documento (non solo coperto da un rettangolo: chi copia il testo dal PDF inviato non lo ritrova)
  e al suo posto viene scritto il segnaposto (es. `[FULLNAME_1]`);
- vengono ripuliti anche i metadati (autore, titolo, programma), le annotazioni, i campi dei
  moduli, i segnalibri e gli allegati incorporati;
- prima dell'invio l'estensione rilegge il PDF prodotto: se un dato personale è ancora leggibile,
  il file **non** viene inviato e compare un avviso;
- il nome del file viene pseudonimizzato come per gli altri formati.

**Immagini nei PDF.** Nelle impostazioni, gruppo «Immagini nei PDF», scegli cosa fare delle
immagini contenute nel PDF (firme, timbri, fotografie, loghi e le pagine scansionate, che per il
PDF sono immagini):

| Scelta | Cosa succede |
|---|---|
| **Leggi e copri i dati** (predefinita, consigliata) | il testo delle immagini viene letto sul PC con il riconoscimento ottico (OCR, lo stesso delle immagini) e i dati personali trovati vengono cancellati dall'immagine e coperti dal segnaposto. Vale per le prime **30 pagine** con immagini: oltre, le immagini restano come sono e un avviso lo segnala |
| **Togli le immagini** | tutte le immagini vengono tolte dal PDF inviato: Claude riceve solo il testo impaginato; le pagine scansionate arrivano vuote. Un avviso indica quante immagini sono state tolte |
| **Lascia le immagini** | le immagini arrivano a Claude così come sono, **senza alcun controllo**. Scegliendola compare una seconda finestra di conferma (il pulsante evidenziato è «Annulla»); se annulli resta la scelta precedente. Ogni PDF con immagini inviato in questo modo mostra un avviso |

**PDF scaricati da Claude.** Quando scarichi un PDF prodotto da Claude, i segnaposto vengono
sostituiti con i valori reali sul PC, conservando l'impaginazione. Se questo non riesce
l'estensione prova il servizio `/restore/pdf` dell'app Rizzo-PII, se la tua versione lo offre, e
come ultima soluzione scarica un PDF di solo testo (con un avviso).

**Limiti.**

- Le righe in cui un dato è stato sostituito (o ripristinato) vengono riscritte con il carattere
  **Helvetica**: possono risultare un po' diverse dal resto del documento e, se il segnaposto è
  più lungo del dato, il testo viene rimpicciolito per stare nello spazio.
- I valori **troppo corti** (ad esempio sigle di una o due lettere) non vengono coperti nel PDF,
  perché coprirli cancellerebbe anche altre parole uguali: restano leggibili e un avviso lo dice.
  Se sono dati da proteggere, non inviare il file.
- I PDF **protetti** da password o da restrizioni vengono bloccati: togli la protezione (ad
  esempio stampandoli come nuovo PDF) e allegali di nuovo.
- Il riconoscimento ottico può **sbagliare** (scritte a mano, timbri, immagini sfocate o storte):
  qualche dato nelle immagini può restare visibile. Per documenti delicati scansionati valuta
  «Togli le immagini».
- Si leggono con l'OCR al massimo **30 pagine** con immagini per PDF.
- Se il PDF non può essere trattato come PDF (file danneggiato o formato insolito), l'estensione
  ripiega sul vecchio metodo: il testo viene inviato come **file di testo pseudonimizzato (.txt)**,
  con un avviso (impaginazione e immagini non vengono inviate).

## 7. Dove stanno i dati e per quanto

Tutto è nel profilo Chrome, nell'archivio IndexedDB dell'estensione (database `pseudomania`):

| Dato | Protezione | Durata |
|---|---|---|
| Dizionario (segnaposto → valore reale) | valori cifrati AES-GCM con una chiave locale **non estraibile**; indice valore→segnaposto con HMAC a chiave locale | chat: 30 giorni dall'ultimo uso; chat nuove non ancora salvate: 24 ore; progetti: finché non li elimini dal pannello |
| Registro locale | cifrato; solo azioni, conteggi e hash, mai testi | 90 giorni |

Nessun dato va a server di Pseudomania. A claude.ai arriva solo il testo con i segnaposto.
Chi usa il tuo PC con il tuo profilo Chrome può vedere i valori ripristinati: proteggi il PC
(cifratura del disco, blocco schermo, profilo Chrome personale).

## 8. Backup, cambio PC e cancellazione

- **Backup:** non previsto. La chiave è non estraibile per scelta: il dizionario non si può
  copiare su un altro PC. Le conversazioni restano su claude.ai con i segnaposto.
- **Cambio PC o nuovo profilo Chrome:** il dizionario non si trasferisce; nelle vecchie chat i
  segnaposto non vengono più ripristinati. Conserva fuori da Claude (nei tuoi fascicoli) i dati
  reali che ti servono.
- **Cancellazione dei dati del browser** («Cancella dati di navigazione» con i dati dei siti e
  delle estensioni): il dizionario locale viene perso.
- **Cancellare un dizionario:** pannello laterale → cancella i dati della chat o del progetto.
  È definitivo.

## 9. Aggiornare

- Estensione dal Web Store: aggiornamento automatico.
- Estensione decompressa: scaricare la nuova versione nella **stessa cartella**, poi
  `chrome://extensions` → **Aggiorna**. Non rimuovere l'estensione (si perderebbe il dizionario):
  l'ID resta lo stesso perché il manifest contiene la chiave pubblica.
- Rizzo-PII: seguire le istruzioni del progetto per i nuovi rilasci.

## 10. Disinstallare

1. `chrome://extensions` → Pseudomania → **Rimuovi** (cancella anche dizionario e registro
   locali, in modo irreversibile).
2. Disinstallare l'app desktop di Rizzo-PII dal sistema operativo e, se serve, cancellare la cache
   del modello [DA VERIFICARE: posizione della cache del modello dell'app].

## 11. Account Pro/Max: impostazioni di Claude

I piani consumer (Free, Pro, Max) seguono i **termini per i consumatori**, diversi da quelli
commerciali dei piani Team ed Enterprise. In particolare le conversazioni possono essere usate
per migliorare i modelli **se l'impostazione è attiva**.

1. claude.ai → profilo → **Impostazioni** → **Privacy**: disattivare l'uso delle chat per
   migliorare i modelli (in inglese «Help improve Claude») [DA VERIFICARE etichetta].
2. Non usare i pulsanti di **feedback** (pollice su/giù) nelle chat con dati di clienti: il
   feedback può inviare la conversazione ad Anthropic per altri scopi.
3. Disattivare la **memoria** di Claude: riporterebbe segnaposto tra conversazioni diverse.
4. Non scrivere dati personali nelle **preferenze del profilo** né nelle **ricerche web**: non
   passano da Pseudomania.
5. Disattivare i **connettori** (Google Drive, Gmail…) se non servono: i loro contenuti non
   passano da Pseudomania.
6. Non usare voce, app desktop o app mobile per dati di clienti.
7. Cancellare le conversazioni che non servono più.

Il contesto può restare identificante anche senza nomi (ruolo unico, date e luoghi precisi):
generalizza. Per un uso professionale stabile con dati di clienti valuta un piano commerciale.

## 12. Problemi frequenti

| Sintomo | Rimedio |
|---|---|
| Badge **!** rosso, «Rizzo-PII non raggiungibile» | avviare l'app di Rizzo-PII; `curl http://127.0.0.1:5005/health` |
| «Rizzo-PII si sta avviando» a lungo | memoria insufficiente o primo download del modello: attendere, chiudere altri programmi |
| Porta 5005 occupata da altro | chiudere il programma; se l'app di Rizzo-PII permette un'altra porta, indicarla nelle impostazioni (solo `127.0.0.1`) |
| Messaggio sul CORS | §13 |
| Barra arancione e badge **OFF** in una chat nuova | comportamento previsto: la protezione parte disattivata; attivala con il pulsante o Alt+Maiusc+P (§5.2) |
| Nessuna barra colorata su claude.ai | il sito è cambiato: aggiornare l'estensione; nel frattempo non inviare dati di clienti |
| Segnaposto non ripristinati in una chat vecchia | dizionario scaduto (30 giorni), cancellato o creato su un altro PC |
| PDF arriva a Claude come .txt | il PDF non è stato trattato come PDF (file danneggiato o insolito): ripiego previsto (§6, «PDF»); prova a salvarlo di nuovo come PDF |
| «PDF protetto da password» | togliere la protezione (stampa come nuovo PDF) e allegarlo di nuovo (§6) |
| PDF bloccato perché «ancora leggibile» un dato | salvarlo di nuovo come PDF o copiare il testo nel messaggio (§6) |

## 13. Se Rizzo-PII rifiuta le chiamate (CORS)

Il servizio locale di Rizzo-PII non invia intestazioni CORS. L'estensione lo chiama dal proprio
service worker con il permesso `http://127.0.0.1/*`, e in questo caso Chrome non applica il CORS
(verificato in Chromium con un Rizzo-PII simulato; **non** ancora provato con l'app desktop reale).
Se l'estensione mostra «Rizzo-PII risponde ma rifiuta le chiamate dell'estensione (CORS)»,
servirà una versione modificata di Rizzo-PII che risponda con
`Access-Control-Allow-Origin: chrome-extension://<ID dell'estensione>`. Questa versione **non
esiste ancora**: segnalare il problema sul sito del progetto e, nel frattempo, non usare la
Personal edition con dati di clienti.

## 14. Fonti

- Repository di Pseudomania: `extension/README.md` §1, §3 e §7, `extension/src/shared/strings.js`,
  `SPEC.md` (sezione Personal edition), `DECISIONI.md` (Edizione personale).
- Rizzo-PII: https://github.com/Rizzo-AI-Academy/rizzo-pii/releases ,
  https://github.com/Rizzo-AI-Academy/rizzo-pii/wiki ,
  modello https://huggingface.co/rizzoaiacademy/rizzo-pii-0.3B
- Anthropic, termini per i consumatori: https://www.anthropic.com/legal/consumer-terms ;
  privacy: https://privacy.claude.com [DA VERIFICARE: pagine non consultate durante la stesura]
