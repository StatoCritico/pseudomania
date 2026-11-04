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

Non ci sono altre impostazioni obbligatorie. In fondo alla pagina, nella sezione
«Informazioni», trovi versione, licenza e sito.

## 2.5 Verifica: l'indicatore di stato

Lo stato è **sempre visibile** in due punti e si riferisce sempre alla **conversazione aperta**
nella scheda.

**Badge sul pulsante dell'estensione**

| Badge | Significato |
|---|---|
| **ON** verde | protezione attiva in questa conversazione |
| **OFF** rosso (icona grigia) | protezione **disattivata** in questa conversazione: ciò che invii parte in chiaro |
| **?** arancione | in attesa della tua scelta (§2.6); nel frattempo i messaggi vengono pseudonimizzati |
| **!** rosso | Rizzo-PII spento, in avvio o non raggiungibile (CORS) |

**Barra colorata sopra la casella di scrittura di claude.ai**: verde «Pseudomania attivo: i dati
personali vengono pseudonimizzati prima dell'invio»; rossa «Protezione disattivata per questa
conversazione: …»; arancione mentre attende la tua scelta.

**Prova rapida** (con dati inventati):

1. Apri claude.ai, nuova chat.
2. Scrivi: `Scrivi una breve lettera a Mario Rossi, mario.rossi@example.it` e invia.
3. Nel fumetto del messaggio inviato devono comparire `[FULLNAME_1]` e `[EMAIL_1]` (e, nel primo
   messaggio, l'istruzione fissa sui segnaposto).
4. Nella risposta di Claude «Mario Rossi» e l'indirizzo email devono tornare visibili,
   **evidenziati in verde**.
5. Sotto il messaggio inviato compare il contrassegno «2 dati protetti»: cliccandolo si apre il
   pannello di ispezione (§4.7).

Se la prova non riesce, vedi il capitolo 6.

## 2.6 Attivare e disattivare la protezione (per conversazione)

Nella Personal edition la protezione si sceglie **conversazione per conversazione**.

**Il pulsante di Pseudomania** nella barra degli strumenti di Chrome (non apre una finestra):

| Azione | Effetto |
|---|---|
| **clic** sul pulsante, con claude.ai aperto | attiva o disattiva la protezione della **conversazione aperta** nella scheda; compare per un attimo «Pseudomania attivato per questa conversazione» oppure «Pseudomania disattivato per questa conversazione: i messaggi partiranno in chiaro» |
| scorciatoia **Alt+Maiusc+P** | come il clic (modificabile da `chrome://extensions/shortcuts`) |
| **clic destro** sul pulsante | menu con «Apri pannello di ispezione» e «Impostazioni e informazioni» |
| clic su una scheda che non è claude.ai | apre le impostazioni |

**Lo stato si salva per conversazione** (dentro un progetto, per ogni chat). Quando cambi chat
nella stessa scheda, badge e barra si aggiornano subito.

**Nuova conversazione o conversazione ripresa**

| Situazione | Che cosa succede |
|---|---|
| nuova conversazione, l'ultima scelta era «attiva» | si attiva da sola |
| nuova conversazione, l'ultima scelta era «disattivata» | compare il banner «Protezione disattivata l'ultima volta – Vuoi attivare Pseudomania per questa conversazione?» con **Attiva** / **Continua senza protezione** |
| conversazione ripresa che era attiva | si riattiva da sola |
| conversazione ripresa che era disattivata | stesso banner |

Finché non scegli, **per prudenza i messaggi vengono comunque pseudonimizzati**: badge **?**
arancione e barra arancione «Scegli se proteggere questa conversazione: nel frattempo i messaggi
vengono pseudonimizzati».

**Che cosa cambia spegnendo.** La disattivazione riguarda **solo ciò che invii**: messaggi e allegati
partono in chiaro, così come li scrivi (barra rossa «Protezione disattivata per questa conversazione:
i messaggi partono in chiaro (i segnaposto ricevuti vengono comunque ripristinati)»). Il **ripristino**
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

## 2.7 File: PDF, DOCX, XLSX

| Formato | Che cosa succede |
|---|---|
| **DOCX, XLSX** | pseudonimizzati **dentro l'estensione** (testo, intestazioni e piè di pagina, note, commenti, proprietà del documento, celle e valori delle formule). A Claude arriva il file con i segnaposto. Quando scarichi un DOCX o XLSX generato da Claude, i valori reali vengono ripristinati. |
| **TXT, CSV, MD** | pseudonimizzati |
| **PDF** | il testo viene estratto da Rizzo-PII e inviato a Claude come **file di testo pseudonimizzato (.txt)** al posto del PDF. Compare l'avviso: «Il PDF … è stato convertito in un file di testo pseudonimizzato (.txt): impaginazione, immagini e tabelle grafiche non vengono inviate a Claude.» I PDF **scaricati** da Claude vengono ripristinati: con l'impaginazione originale se la tua versione dell'app Rizzo-PII lo consente, altrimenti come PDF di solo testo (compare un avviso). |
| Immagini e altri formati | **bloccati**: il file non viene allegato |

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
