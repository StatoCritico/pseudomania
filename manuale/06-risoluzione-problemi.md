# 6. Risoluzione dei problemi

Regola generale: **se Pseudomania non funziona come previsto, non inviare dati personali** finché il
problema non è risolto. Per la Server edition i problemi del server sono trattati in
`docs/installazione-ente.md` §25.

## 6.1 Per tutti gli utenti

| Sintomo / messaggio | Causa probabile | Che cosa fare |
|---|---|---|
| Nessuna barra di Pseudomania sopra la casella di claude.ai | estensione disattivata o rimossa, pagina non ancora caricata, sito cambiato | ricarica la pagina; controlla in `chrome://extensions` che Pseudomania sia attiva; se persiste, non inviare dati e aggiorna l'estensione / avvisa l'assistenza |
| «Pagina non riconosciuta da Pseudomania» / «Pseudomania non riconosce la struttura di questa pagina…» | claude.ai è stato aggiornato e i selettori non corrispondono più | non inviare dati personali; attendi l'aggiornamento dell'estensione; (Server edition) contatta l'assistenza |
| «Non è stato possibile sostituire il testo nella casella di scrittura: l'invio è bloccato per sicurezza.» | la casella non ha accettato il testo pseudonimizzato | ricarica la pagina e riprova; se si ripete, segnalalo |
| Segnaposto in **rosso** nella risposta | Claude ha inventato o alterato un segnaposto | controlla quel punto; chiedi a Claude di usare solo i segnaposto presenti |
| Segnaposto in **grigio**, «… non sono ripristinabili» | dizionario cifrato su un altro computer o profilo | chat: nessun recupero; progetti Server edition: §4.10 |
| Segnaposto non ripristinati in una chat vecchia, senza avviso | dizionario scaduto (30 giorni dall'ultimo uso) o eliminato | comportamento previsto; recupera i dati dai tuoi documenti |
| «Invio bloccato» con riferimento all'art. 9 o 10 GDPR | filtro delle categorie particolari | riformula senza quei riferimenti; se è un errore usa **Segnala blocco errato** (§4.9) |
| «Il file «…» non è stato allegato: …» | formato non gestito o file troppo grande | converti in DOCX/PDF/TXT o riduci il file |
| **Immagine bloccata**: «Il file «…» non è stato allegato: le immagini sono bloccate…» (banner rosso) | (Personal) hai scelto «Bloccate» nelle impostazioni; (Server edition) il testo nelle immagini non viene pseudonimizzato e l'ente blocca le immagini (impostazione predefinita) | (Personal) scegli «Oscuramento automatico» nelle impostazioni (§2.7); (Server edition) non si può cambiare: trascrivi il testo che serve senza dati personali o chiedi all'ente |
| Finestra «Inviare questa immagine?» | le immagini sono consentite con conferma | controlla l'anteprima: se mostra dati personali scegli **Annulla** |
| File scaricato con i segnaposto e un avviso | formato non ripristinabile o errore del servizio | sostituisci a mano i valori o rigenera in DOCX/XLSX |
| Il contrassegno «dati protetti» apre nulla | Chrome ha rifiutato l'apertura del pannello laterale | (Personal) clic destro sul pulsante → **Apri pannello di ispezione**; (Server edition) clic sul pulsante → **Apri pannello di ispezione** |
| Contrassegni spariti sui messaggi vecchi | i dati di ispezione restano solo nella sessione | comportamento previsto dopo la chiusura del browser |
| Microfono/dettatura non funzionano su claude.ai | dettatura disattivata da Pseudomania | comportamento previsto |
| Avviso arancione «non è stato possibile associare i segnaposto a questa conversazione (conflitto sul server)» | conflitto nel passaggio dal dizionario provvisorio a quello della chat | la protezione resta attiva; continua pure; segnala se si ripete (Server edition) |

## 6.2 Personal edition

| Sintomo / messaggio | Causa probabile | Che cosa fare |
|---|---|---|
| Badge **!** rosso, «Rizzo-PII non raggiungibile: avvia l'app desktop di Rizzo-PII» | app Rizzo-PII chiusa o bloccata | avvia l'app; apri `http://127.0.0.1:5005/health` in Chrome |
| «Rizzo-PII si sta avviando (caricamento del modello)» a lungo | primo download del modello o memoria insufficiente | attendi; chiudi altri programmi; controlla lo spazio su disco |
| Porta 5005 occupata | un altro programma usa la porta | chiudi il programma oppure scegli un'altra porta in Rizzo-PII e indicala in **Impostazioni** (solo `127.0.0.1`) **[DA VERIFICARE con l'app reale]** |
| «Rizzo-PII risponde ma rifiuta le chiamate dell'estensione (CORS)» | il servizio locale non accetta l'estensione | **non usare la Personal edition con dati di clienti**; scarica la versione modificata di Rizzo-PII quando sarà fornita sul sito (§2.2) |
| Finestra «Rizzo-PII non risponde» con **Invia senza protezione** | Rizzo-PII spento durante l'uso | scegli **Annulla**, riavvia Rizzo-PII, riprova |
| Badge **OFF** arancione, barra arancione «Protezione disattivata: i messaggi partono in chiaro…» | protezione disattivata **in questa conversazione**: è lo stato di partenza di ogni nuova conversazione, pagina di progetto o nuova scheda | clic sul pulsante o Alt+Maiusc+P (§2.6) |
| Alt+Maiusc+P non fa nulla | scorciatoia occupata da un altro programma o modificata | `chrome://extensions/shortcuts` |
| La protezione si è riaccesa (o spenta) da sola cambiando chat | lo stato è salvato per conversazione: le chat che avevi attivato si riattivano, le altre partono secondo la modalità scelta (predefinita: disattivate) | comportamento previsto: controlla il badge a ogni chat |
| Badge **?** e banner «Attiva» / «Continua senza protezione» | hai scelto la modalità «Attiva con richiesta» | scegli una delle due voci; per non vedere più la domanda cambia modalità nelle impostazioni (§2.6) |
| «Sono ammessi solo indirizzi locali» nelle impostazioni | indirizzo non locale | usa `http://127.0.0.1:<porta>` o `http://localhost:<porta>` |
| Dizionario perso dopo un aggiornamento | l'estensione è stata rimossa e reinstallata | aggiorna sempre nella stessa cartella con **Aggiorna** (§2.9); i dati persi non si recuperano |
| Finestra «Inviare l'immagine oscurata?» | oscuramento automatico delle immagini (predefinito) | controlla l'anteprima: se un dato è ancora visibile scegli **Annulla** |
| Nella finestra: «non è stato riconosciuto alcun testo» o «testo letto con difficoltà» | immagine senza scritte, sfocata, storta, piccola o scritta a mano | guarda bene l'anteprima: i dati non riconosciuti **non** sono coperti; se ne vedi, **Annulla** |
| «Lettura del testo… e oscuramento dei dati personali…» a lungo | prima lettura dopo l'avvio di Chrome | attendi: la prima volta può richiedere fino a un minuto |
| Immagine HEIC o TIFF non allegata | formato non supportato dall'oscuramento | salvala come PNG o JPG e riprova |
| PDF arrivato a Claude come `.txt` | il PDF non è stato trattato come PDF (file danneggiato o insolito): ripiego previsto | salvalo di nuovo come PDF e riallegalo (§2.7) |
| PDF bloccato: «il PDF è protetto da password o da restrizioni…» | PDF protetto | togli la protezione (ad esempio stampandolo come nuovo PDF) e allegalo di nuovo |
| PDF bloccato: «…nel PDF era ancora leggibile 1 dato personale…» | la verifica finale ha trovato un dato non tolto | salvalo di nuovo come PDF oppure copia il testo nel messaggio |
| Avviso: «dato molto breve … non è stato coperto nel PDF» | valori troppo corti (sigle di una o due lettere) non si possono coprire senza cancellare altre parole | se sono dati da proteggere, non inviare il file |
| Avviso sulle immagini del PDF (lette, tolte o lasciate) | effetto dell'impostazione «Immagini nei PDF»; oltre le 30 pagine con immagini l'OCR non legge | controlla l'impostazione (§2.4, §2.7); per scansioni delicate valuta «Togli le immagini» |
| Nel PDF inviato o scaricato alcune righe hanno un carattere diverso | le righe con un dato sostituito o ripristinato vengono riscritte in Helvetica | comportamento previsto |
| PDF scaricato da Claude «come testo semplice» | il ripristino con l'impaginazione non è riuscito | chiedi a Claude un file Word |
| L'estensione dal pacchetto si disattiva all'avvio di Chrome | alcune versioni di Chrome avvisano per le estensioni in modalità sviluppatore **[DA VERIFICARE]** | riattivala in `chrome://extensions`; usa la versione del Web Store quando disponibile |

## 6.3 Server edition (utente e help desk)

| Sintomo / messaggio | Causa probabile | Che cosa fare |
|---|---|---|
| «Accesso richiesto: effettua il login a Pseudomania dal pulsante dell'estensione» | token scaduto o browser riavviato | clic sul pulsante di Pseudomania → **Accedi** |
| «Non è stato possibile autenticarsi presso il server Pseudomania…» | IdP non raggiungibile, client OIDC o audience errati | utente: riprova **Accedi**; IT: verificare redirect URI, `OIDC_AUDIENCE`, mapper *Audience* (Keycloak), CORS dell'IdP (`docs/configurazione.md` §B.1) |
| «Il server Pseudomania non è raggiungibile: … l'invio è bloccato» | server spento, rete, certificato non attendibile | utente: riprova più tardi; IT: `curl https://pseudogate.ente.local/v1/health`, certificato della CA interna distribuito ai PC |
| «Il servizio di riconoscimento dei dati personali non è disponibile» | `rizzo-pii` in avvio o guasto (`detector: down`) | IT: `docker compose ps`, log di `rizzo-pii` |
| «Servizio chiavi del server non disponibile» | OpenBao sigillato (`keys: sealed`) o irraggiungibile | IT: sblocco di OpenBao con i custodi (`docs/installazione-ente.md` §22) |
| Pseudomania in Personal edition su un PC dell'ente | policy di Chrome non applicata a quel profilo | IT: `chrome://policy` → **Ricarica criteri**; applicare la policy a tutti i profili |
| L'estensione non compare o non è «Installata dall'amministratore» | `ExtensionInstallForcelist`/`update.xml` errati, ID diverso, PC non gestito | IT: verificare ID, URL di `update.xml`, versione coerente tra manifest e `update.xml` |
| «Prepara il recupero» non porta a nulla | chiave non ancora caricata dai custodi o scaduta (7 giorni) | help desk: verificare lo stato del ticket; utente: **Verifica chiavi recuperate** |
| «La conferma annuale scade a breve» | scadenza del progetto | utente: confermare dal pannello (§4.11) |
| Accesso a claude.ai rifiutato da un PC o dalla rete | accesso condizionato dell'SSO | comportamento previsto fuori dai dispositivi gestiti |
