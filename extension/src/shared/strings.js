// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 gli autori di Pseudomania
//
// Tutti i testi visibili all'utente, in italiano. Un solo punto per la revisione linguistica.

(function (root) {
  'use strict';
  const PG = (root.PG = root.PG || {});

  const S = {
    nome: 'Pseudomania',
    sito: 'https://pseudomania.statocritico.it',
    // Pagina della procedura di recupero dei dizionari di progetto (Server edition)
    urlRecupero: 'https://pseudomania.statocritico.it/approfondimenti/#recupero-chiavi',
    edizioneServer: 'Server edition',
    edizionePersonal: 'Personal edition',
    // Indicatore di stato sopra la casella di scrittura
    statoAttivo: 'Pseudomania attivo: i dati personali vengono pseudonimizzati prima dell\'invio',
    statoDisattivato: 'Pseudomania disattivato: i messaggi partono SENZA pseudonimizzazione',
    statoDisattivatoConv:
      'Protezione disattivata: i messaggi partono in chiaro. Per attivarla clicca l\'icona di Pseudomania o premi Alt+Maiusc+P',
    statoInAttesa: 'Scegli se proteggere questa conversazione: nel frattempo i messaggi vengono pseudonimizzati',
    chiediTitolo: 'Protezione disattivata l\'ultima volta',
    chiediTesto: 'Vuoi attivare Pseudomania per questa conversazione?',
    chiediAttiva: 'Attiva',
    chiediContinua: 'Continua senza protezione',
    toastAttivata: 'Pseudomania attivato per questa conversazione',
    toastDisattivata: 'Pseudomania disattivato per questa conversazione: i messaggi partiranno in chiaro',
    gestitaDallEnte: 'Pseudomania è gestito dalla tua organizzazione: la protezione è sempre attiva e non può essere disattivata.',
    offTitolo: 'Disattivare la protezione in questa conversazione?',
    offTesto:
      'Questa conversazione contiene già dati protetti. Da ora ciò che invii (messaggi e allegati) andrà a Claude ' +
      'in chiaro, così come lo scrivi. Riattivare la protezione in seguito non ripulisce quanto già inviato.',
    offConferma: 'Disattiva',
    menuPannello: 'Apri pannello di ispezione',
    menuImpostazioni: 'Impostazioni e informazioni',
    badgeTitolo_on: 'protezione attiva in questa conversazione (clic o Alt+Maiusc+P per disattivare)',
    badgeTitolo_off: 'protezione disattivata in questa conversazione (clic o Alt+Maiusc+P per attivare)',
    badgeTitolo_ask: 'in attesa di scelta per questa conversazione',
    statoServerGiu: 'Server Pseudomania non raggiungibile',
    // Stato del servizio di rilevamento (Personal: Rizzo-PII locale; Server edition: server)
    statoServizio: (mode, h) => {
      const d = h ? h.detector : 'down';
      if (mode !== 'ente') {
        if (d === 'cors') return 'Rizzo-PII risponde ma rifiuta le chiamate dell\'estensione (CORS): serve la versione di Rizzo-PII per Pseudomania, vedi la guida';
        if (d === 'loading') return 'Rizzo-PII si sta avviando (caricamento del modello)';
        return 'Rizzo-PII non raggiungibile: avvia l\'app desktop di Rizzo-PII';
      }
      if (h && h.keys && h.keys !== 'ok' && h.keys !== 'local') return 'Servizio chiavi del server non disponibile';
      if (d === 'down' && h && h.version) return 'Servizio di riconoscimento non disponibile';
      return 'Server Pseudomania non raggiungibile';
    },
    statoNonRiconosciuto: 'Pagina non riconosciuta da Pseudomania',
    statoAccesso: 'Accesso richiesto: effettua il login a Pseudomania dal pulsante dell\'estensione',
    inElaborazione: 'Pseudonimizzazione in corso…',
    fileInElaborazione: (n, i, tot) => `Pseudonimizzazione di «${n}»${tot > 1 ? ` (${i} di ${tot})` : ''}… attendi`,
    ripristinoInCorso: 'Ripristino dei dati reali nel file…',

    // Banner di blocco
    bloccatoTitolo: 'Invio bloccato',
    immaginiBloccatePersonal: 'Le immagini sono bloccate nelle impostazioni di Pseudomania. Se vuoi inviarle, nelle impostazioni puoi scegliere l\'oscuramento automatico (i dati personali visibili vengono coperti prima dell\'invio) oppure una conferma per ogni immagine.',
    immaginiBloccateEnte: 'Le immagini sono bloccate dalla policy dell\'ente: il testo che contengono non può essere pseudonimizzato.',
    immagineTitolo: 'Inviare questa immagine?',
    immagineTesto: 'Questa immagine NON verrà oscurata: nomi, codici, indirizzi o altri dati visibili nell\'immagine arriveranno a Claude così come sono. Invia solo se l\'immagine non contiene dati personali.',
    immagineAlt: 'Anteprima dell\'immagine da inviare',
    immagineNome: 'Il nome del file viene sostituito con un nome generico (es. immagine-20261105183000.png).',
    immagineInvia: 'Invia l\'immagine',
    // Oscuramento automatico delle immagini (OCR locale, Personal edition)
    ocrInCorso: (nome) => `Lettura del testo di «${nome}» e oscuramento dei dati personali… la prima volta può richiedere fino a un minuto`,
    immagineOcrTitolo: 'Inviare l\'immagine oscurata?',
    immagineOcrTesto: (n) =>
      (n === 0
        ? 'Nell\'immagine non sono stati trovati dati personali da coprire.'
        : n === 1
          ? 'Nell\'immagine è stato coperto 1 dato personale con un riquadro nero.'
          : `Nell'immagine sono stati coperti ${n} dati personali con riquadri neri.`) +
      ' Il testo è stato letto qui sul tuo computer: nulla è uscito dal PC. Controlla l\'anteprima: a Claude arriva esattamente questa immagine.',
    immagineOcrNessunTesto:
      'Attenzione: nell\'immagine non è stato riconosciuto alcun testo. Se contiene scritte (ad esempio scritte a mano, ' +
      'molto piccole o inclinate), eventuali dati personali NON sono stati coperti.',
    immagineOcrBassaQualita:
      'Attenzione: il testo dell\'immagine è stato letto con difficoltà (immagine sfocata, piccola o poco contrastata). ' +
      'Alcuni dati personali potrebbero non essere stati coperti: guarda bene l\'anteprima prima di inviare.',
    immagineOcrAlt: 'Anteprima dell\'immagine con i dati personali oscurati',
    immagineOcrInvia: 'Invia l\'immagine oscurata',
    immagineNonLeggibile: 'non è stato possibile aprire l\'immagine (formato non supportato o file danneggiato). Salvala come PNG o JPG e riprova.',
    immagineOcrNonDisponibile: 'l\'oscuramento automatico delle immagini non è disponibile in questo momento.',
    impAttivazioneTitolo: 'Attivazione nelle conversazioni',
    impAttivazione: {
      off: ['Disattivata di default', 'Ogni nuova conversazione parte senza protezione; la attivi con l\'icona o Alt+Maiusc+P. Le conversazioni attivate restano attive.'],
      on: ['Attiva di default', 'Ogni nuova conversazione parte protetta; la spegni con l\'icona o Alt+Maiusc+P. Le conversazioni spente restano spente.'],
      ask: ['Attiva con richiesta', 'Se l\'ultima scelta era «attiva» le nuove conversazioni partono protette, altrimenti ti viene chiesto; le conversazioni spente chiedono quando le riapri.'],
    },
    impImmaginiTitolo: 'Immagini (screenshot, foto)',
    impImmagini: {
      block: ['Bloccate', 'Le immagini non vengono inviate.'],
      ocr: ['Oscuramento automatico', 'Il testo dell\'immagine viene letto qui sul tuo computer e i dati personali vengono coperti con riquadri neri; prima dell\'invio vedi l\'anteprima oscurata e confermi. La lettura automatica può sbagliare: controlla sempre l\'anteprima.'],
      confirm: ['Conferma per ogni immagine', 'L\'immagine viene inviata così com\'è, dopo che hai visto l\'anteprima e confermato: i dati visibili NON vengono coperti.'],
    },
    impImmaginiEnte: (p) => `Immagini: ${({ block: 'bloccate', confirm: 'conferma per ogni immagine', ocr: 'bloccate (l\'oscuramento automatico è disponibile solo nella Personal edition)' })[p] || p} (impostato dall'ente).`,
    impSalvatoBreve: 'Impostazione salvata.',
    // Immagini nei PDF (solo Personal edition)
    impPdfImmaginiTitolo: 'Immagini nei PDF (firme, timbri, fotografie, pagine scansionate)',
    impPdfImmaginiAiuto:
      'I PDF vengono inviati a Claude come PDF, con la loro impaginazione: i dati personali nel testo vengono tolti ' +
      'e sostituiti dai segnaposto. Qui scegli cosa fare delle immagini contenute nel PDF.',
    impPdfImmagini: {
      ocr: ['Leggi e copri i dati (consigliato)', 'Il testo delle immagini e delle pagine scansionate viene letto qui sul tuo computer e i dati personali trovati vengono coperti. La lettura automatica può sbagliare (scritte a mano, timbri, immagini sfocate) e vale per le prime 30 pagine con immagini.'],
      remove: ['Togli le immagini', 'Tutte le immagini vengono tolte dal PDF prima dell\'invio: Claude riceve solo il testo impaginato. Le pagine scansionate arrivano vuote.'],
      keep: ['Lascia le immagini', 'Le immagini arrivano a Claude così come sono, senza alcun controllo. Sconsigliato: usalo solo se sei sicuro che le immagini non contengano dati personali.'],
    },
    impPdfKeepConfermaTitolo: 'Lasciare le immagini dei PDF senza controlli?',
    impPdfKeepConfermaTesto:
      'Con questa scelta le immagini contenute nei PDF arriveranno a Claude senza alcun controllo, compresi firme, ' +
      'timbri, fotografie e pagine scansionate (che spesso contengono nomi, indirizzi e codici fiscali). Pseudomania ' +
      'proteggerà solo il testo del PDF. Vale per tutti i PDF che allegherai da ora in poi.',
    impPdfKeepConfermaOk: 'Sì, lascia le immagini',
    allegatoNonConsegnato: 'Il file è stato pseudonimizzato ma claude.ai non lo ha ricevuto: allegalo di nuovo trascinandolo nella casella di scrittura.',
    // Ultimo ripiego del ripristino dei PDF scaricati (se il ripristino con impaginazione non riesce)
    pdfRipristinatoTesto: 'PDF scaricato con i dati reali, ma come testo semplice: l\'impaginazione originale non si conserva. Per un documento impaginato chiedi a Claude un file Word.',
    bloccatoRete: (r) => `Pseudomania ha fermato un invio a claude.ai: ${r}. Se un allegato non compare, rimuovilo e allegalo di nuovo; se il problema resta, scarica il registro dalle impostazioni.`,
    registroTitolo: 'Registro delle attività',
    registroVuoto: 'Nessuna attività registrata.',
    registroScarica: 'Scarica il registro (JSON)',
    registroAiuto: 'Solo azioni, conteggi e impronte: nessun testo. Conservato cifrato nel browser per 90 giorni.',
    estensioneAggiornataTitolo: 'Pseudomania è stato aggiornato',
    estensioneAggiornataTesto: 'Ricarica questa pagina (F5) per riprendere la protezione. Fino ad allora gli invii restano bloccati.',
    bloccatoServerGiu:
      'Il server Pseudomania non è raggiungibile: per tutelare i dati personali l\'invio è bloccato. ' +
      'Riprova tra poco o contatta l\'assistenza informatica.',
    bloccatoDetectorGiu:
      'Il servizio di riconoscimento dei dati personali non è disponibile: l\'invio è bloccato. Riprova tra poco.',
    bloccatoNonRiconosciuto:
      'Pseudomania non riconosce la struttura di questa pagina di Claude (probabile aggiornamento del sito): ' +
      'per sicurezza l\'invio è bloccato. Contatta l\'assistenza informatica.',
    bloccatoAuth:
      'Non è stato possibile autenticarsi presso il server Pseudomania. Effettua di nuovo l\'accesso dal pulsante dell\'estensione.',
    bloccatoFileGrande: (mb) => `Il file supera la dimensione massima consentita (${mb} MB).`,
    bloccatoGenerico: 'Il contenuto non può essere inviato.',
    bloccatoVerifica:
      'Non è stato possibile sostituire il testo nella casella di scrittura: l\'invio è bloccato per sicurezza.',
    fileBloccato: (nome, motivo) => `Il file «${nome}» non è stato allegato: ${motivo}`,
    rebindConflitto:
      'Pseudomania: non è stato possibile associare i segnaposto a questa conversazione (conflitto sul server). ' +
      'La protezione resta attiva con il dizionario provvisorio della conversazione.',
    dettaturaBloccata: 'La dettatura vocale è disattivata da Pseudomania.',
    chiudi: 'Chiudi',
    segnalaBloccoErrato: 'Segnala blocco errato',
    bloccoSegnalato: 'Segnalazione inviata. Grazie.',
    pannelloUltimoBlocco: (cat, quando) => `Ultimo invio bloccato${cat ? ` (categoria «${cat}»)` : ''} alle ${quando}.`,

    // Conferma quando il servizio non risponde (failClosed=false, es. Personal edition)
    confermaTitolo: 'Server Pseudomania non raggiungibile',
    confermaTitoloRizzo: 'Rizzo-PII non risponde',
    confermaCors:
      'Rizzo-PII risponde ma non accetta le chiamate dell\'estensione (CORS): serve la versione di Rizzo-PII ' +
      'adattata per Pseudomania (vedi la guida).',
    confermaTesto:
      'Il messaggio verrebbe inviato a Claude SENZA pseudonimizzazione, così come lo hai scritto.',
    confermaRilevati: 'Un controllo locale di base ha trovato possibili dati personali:',
    confermaNessuno: 'Il controllo locale di base non ha trovato dati evidenti (non è una garanzia).',
    confermaInvia: 'Invia senza protezione',
    annulla: 'Annulla',

    // Anteprima (Ctrl+Maiusc+Invio)
    anteprimaTitolo: 'Anteprima di ciò che verrà inviato',
    anteprimaOriginale: 'Testo originale',
    anteprimaInviato: 'Testo inviato a Claude',
    anteprimaInvia: 'Invia',

    // PDF (Personal edition). Il PDF parte come PDF, con la sua impaginazione: i dati personali vengono tolti
    // davvero dal documento (non solo coperti) e sostituiti dai segnaposto. Il .txt resta solo come ripiego.
    pdfProtetto:
      'il PDF è protetto da password o da restrizioni e Pseudomania non può leggerlo. Togli la protezione ' +
      '(ad esempio stampandolo come nuovo PDF) e allegalo di nuovo.',
    pdfResidui: (n) =>
      (n === 1
        ? 'dopo la pseudonimizzazione nel PDF era ancora leggibile 1 dato personale'
        : `dopo la pseudonimizzazione nel PDF erano ancora leggibili ${n} dati personali`) +
      ': per sicurezza il file non è stato inviato. Prova a salvarlo di nuovo come PDF oppure copia il testo nel messaggio.',
    pdfValoriNonCoperti: (n) =>
      (n === 1
        ? 'Attenzione: 1 dato molto breve (ad esempio una sigla di due lettere) non è stato coperto nel PDF e resta leggibile'
        : `Attenzione: ${n} dati molto brevi (ad esempio sigle di due lettere) non sono stati coperti nel PDF e restano leggibili`) +
      ': coprire valori così brevi rischierebbe di cancellare anche altre parole uguali. Se si tratta di dati da proteggere, non inviare il file.',
    pdfImmaginiLasciate: (n) =>
      (n === 1 ? 'Il PDF contiene 1 immagine che è stata lasciata' : `Il PDF contiene ${n} immagini che sono state lasciate`) +
      ' così com\'è, senza controlli (come indicato nelle impostazioni): firme, timbri, fotografie e pagine scansionate arrivano a Claude in chiaro.',
    pdfImmaginiTolte: (n) =>
      (n === 1 ? '1 immagine è stata tolta' : `${n} immagini sono state tolte`) +
      ' dal PDF prima dell\'invio (come indicato nelle impostazioni): Claude non vedrà firme, timbri, fotografie né il contenuto delle pagine scansionate.',
    pdfImmaginiOcr: (pagine, troncato) =>
      (pagine === 1 ? 'Le immagini di 1 pagina sono state lette' : `Le immagini di ${pagine} pagine sono state lette`) +
      ' qui sul tuo computer con il riconoscimento automatico del testo e i dati personali trovati sono stati coperti. ' +
      'La lettura automatica può sbagliare (scritte a mano, timbri, immagini sfocate): qualche dato potrebbe essere rimasto visibile.' +
      (troncato ? ' Il documento è lungo: sono state lette solo le immagini delle prime 30 pagine; nelle altre le immagini sono state lasciate così come sono.' : ''),
    pdfRipiegoTesto: (nome) =>
      `Non è stato possibile pseudonimizzare il PDF «${nome}» mantenendo l'impaginazione: è stato inviato a Claude ` +
      'come file di testo pseudonimizzato (.txt). Impaginazione, immagini e tabelle grafiche non vengono inviate.',
    // Ripiego in .txt (vecchio percorso, usato solo se il PDF non può essere trattato come PDF)
    pdfScansionatoOcr: (nome, pagine, troncato) =>
      `Il PDF «${nome}» era scansionato e non è stato possibile conservarlo come PDF: ` +
      (pagine === 1 ? '1 pagina è stata letta' : `${pagine} pagine sono state lette`) +
      ' qui sul tuo computer con il riconoscimento automatico del testo e inviate a Claude come testo pseudonimizzato (.txt). ' +
      'La lettura automatica può contenere errori (lettere scambiate, parole mancanti): alcuni dati personali potrebbero non essere stati riconosciuti.' +
      (troncato ? ' Il documento è lungo: sono state lette solo le prime 30 pagine, le altre non sono state inviate.' : ''),
    pdfSenzaTesto: 'nel PDF non è stato trovato testo da inviare (potrebbe essere una scansione illeggibile o un documento vuoto).',
    pdfConvertito: (nome) =>
      `Il PDF «${nome}» non ha potuto essere trattato come PDF ed è stato inviato come file di testo pseudonimizzato (.txt): ` +
      'impaginazione, immagini e tabelle grafiche non vengono inviate a Claude.',
    nonRipristinabile: 'Segnaposto non ripristinabile (chiave di un altro computer)',
    nonRipristinabiliAvviso: (n, progetto) =>
      (n === 1 ? '1 segnaposto non è ripristinabile' : `${n} segnaposto non sono ripristinabili`) +
      ': il dizionario è stato cifrato su un altro computer (o con una chiave non più disponibile).' +
      (progetto ? ' Per i progetti è possibile chiedere il recupero.' : ' Per le chat il recupero non è previsto.'),
    procedura: 'Procedura di recupero',

    // Badge e ispezione
    datiProtetti: (n) => (n === 1 ? '1 dato protetto' : `${n} dati protetti`),
    nessunDato: 'nessun dato personale',
    badgeTitolo: 'Apri il pannello di ispezione di Pseudomania',
    segnapostoSconosciuto: 'Segnaposto non presente nel dizionario',
    segnapostoSconosciutiAvviso: (n) =>
      n === 1
        ? 'Pseudomania: 1 segnaposto nella risposta non è nel dizionario (evidenziato in rosso).'
        : `Pseudomania: ${n} segnaposto nella risposta non sono nel dizionario (evidenziati in rosso).`,

    // Pannello laterale
    pannelloTitolo: 'Ispezione Pseudomania',
    pannelloVuoto: 'Fai clic sul contrassegno «dati protetti» sotto un messaggio inviato per vederne i dettagli.',
    pannelloOriginale: 'Originale (solo su questo computer)',
    pannelloInviato: 'Inviato a Claude',
    pannelloEntita: 'Dati sostituiti',
    pannelloRisposte: 'Mostra le risposte con i segnaposto',
    pannelloRisposteVuoto: 'Nessuna risposta trovata nella scheda corrente.',
    pannelloSegnalaFN: 'Segnala dato non riconosciuto',
    pannelloSegnalaFP: 'Segnala mascheramento errato',
    pannelloNota: 'Nota facoltativa (non scrivere dati personali reali: usa i segnaposto o descrivi il tipo di dato)',
    pannelloInviaSegnalazione: 'Invia segnalazione',
    pannelloSegnalazioneOk: 'Segnalazione inviata. Grazie.',
    pannelloElimina: (tipo) =>
      tipo === 'project' ? 'Elimina i dati di questo progetto' : 'Elimina i dati di questa conversazione',
    pannelloEliminaConferma: (tipo) =>
      'Il dizionario dei segnaposto di ' +
      (tipo === 'project' ? 'questo progetto' : 'questa conversazione') +
      ' verrà cancellato. Le risposte già ricevute non potranno più essere ripristinate. Continuare?',
    pannelloEliminaOk: 'Dati eliminati dal server.',
    pannelloErrore: 'Operazione non riuscita: ',
    pannelloScope: (s) =>
      s ? (s.type === 'project' ? 'Progetto ' : 'Conversazione ') + abbreviaId(s.id) : 'Nessuna conversazione',
    pannelloTraccia: 'Traccia',
    pannelloSegnalazioneLocale: 'Segnalazione salvata nel registro locale (Personal edition: nessun server).',
    pannelloEliminaOkLocale: 'Dati eliminati da questo computer.',
    pannelloConfermaTitolo: 'Conferma annuale del progetto',
    pannelloConfermaTesto: (data) =>
      `Senza conferma il dizionario di questo progetto scade il ${data}: dopo quella data le risposte non ` +
      'potranno più essere ripristinate. Conferma se il progetto è ancora in uso.',
    pannelloConfermaInScadenza: 'La conferma annuale scade a breve.',
    pannelloConfermaBtn: 'Il progetto è ancora in uso: conferma',
    pannelloConfermaOk: 'Progetto confermato per un altro anno.',
    pannelloNonRipristinabili: (n) => `${n} segnaposto non ripristinabili in questo ambito.`,
    pannelloRecuperoTitolo: 'Recupero da un altro computer (solo progetti)',
    pannelloRecuperoTesto:
      'Se hai cambiato computer, i dizionari dei progetti possono essere recuperati dai custodi su richiesta ' +
      'motivata. Prepara questo computer e comunica il codice all\'assistenza.',
    pannelloRecuperoBtn: 'Prepara il recupero',
    pannelloRecuperoCodice: (c) => `Codice del dispositivo da comunicare all'assistenza: ${c}`,
    pannelloRecuperoVerifica: 'Verifica chiavi recuperate',
    pannelloRecuperoImportate: (n) => (n ? `${n} chiavi recuperate importate.` : 'Nessuna chiave recuperata disponibile per ora.'),
    pannelloChiave: (id, data) => `Chiave di cifratura attiva: ${id ? id.slice(0, 8) + '…' : 'nessuna'}${data ? ' del ' + data : ''}`,

    // Popup / impostazioni
    modalitaEnte: 'Server edition (gestita dall\'ente)',
    modalitaPersonale: 'Personal edition',
    attiva: 'Protezione attiva',
    disattiva: 'Protezione disattivata',
    nonDisattivabile: 'Protezione sempre attiva: Pseudomania è gestito dalla tua organizzazione e non può essere disattivato.',
    rizzoOk: 'Rizzo-PII raggiungibile',
    popupPersonal: 'Personal edition: fai clic sul pulsante di Pseudomania (o Alt+Maiusc+P) per attivare o disattivare la protezione nella conversazione aperta.',
    serverOk: 'Server raggiungibile',
    serverKo: 'Server non raggiungibile',
    detectorKo: 'Servizio di riconoscimento non disponibile',
    accedi: 'Accedi',
    esci: 'Esci',
    accessoEseguito: 'Accesso eseguito',
    accessoNecessario: 'Accesso non eseguito',
    impostazioni: 'Impostazioni',
    apriPannello: 'Apri pannello di ispezione',
    impostazioniTitolo: 'Impostazioni di Pseudomania',
    impServerUrl: 'Indirizzo del server Pseudomania',
    impRizzoUrl: 'Indirizzo di Rizzo-PII desktop',
    impRizzoAiuto: 'Servizio locale dell\'app desktop di Rizzo-PII (predefinito http://127.0.0.1:5005). Solo indirizzi locali.',
    impRizzoSoloLocale: 'Sono ammessi solo indirizzi locali (127.0.0.1 o localhost).',
    impRizzoStato: (st) =>
      ({ ok: 'Rizzo-PII raggiungibile.', loading: 'Rizzo-PII si sta avviando: riprova tra poco.',
        cors: 'Rizzo-PII risponde ma rifiuta le chiamate dell\'estensione (CORS): serve la versione di Rizzo-PII per Pseudomania.',
        down: 'Rizzo-PII non raggiungibile: avvia l\'app desktop.' })[st] || st,
    impServerGestito: 'Server dell\'ente:',
    infoSito: 'Sito di Pseudomania:',
    impSalva: 'Salva',
    impVerifica: 'Verifica connessione',
    impSalvato: 'Impostazioni salvate.',
    impGestite: 'Queste impostazioni sono gestite dall\'ente e non possono essere modificate.',
    impPermesso: 'Chrome chiederà il permesso di contattare questo indirizzo.',
    impPermessoNegato: 'Permesso negato: l\'estensione non potrà contattare il server.',
    impVersione: (v) => `Server raggiungibile, versione ${v}`,
    infoTitolo: 'Informazioni',
    infoServer: (lic, ver) => `Server: licenza ${lic || '?'}, versione ${ver || '?'}.`,
    infoVersione: (v) => `Estensione Pseudomania, versione ${v}.`,
    infoSorgente: 'Codice sorgente del servizio:',
    infoSorgenteAssente: 'non indicato dal server (variabile SOURCE_URL)',
    infoSorgenteNonRaggiungibile: 'server non raggiungibile',
    infoLicenza:
      'Pseudomania è software libero distribuito con licenza GNU AGPL-3.0 o successiva; include codice di ' +
      'Privacy Guardrail (DFKI) con licenza Apache-2.0.',
    impostazioniInfo: 'Impostazioni e informazioni',
  };

  function abbreviaId(id) {
    if (!id) return '';
    if (id.startsWith('pending:')) return '(nuova, non ancora salvata)';
    return id.length > 12 ? id.slice(0, 8) + '…' : id;
  }

  PG.strings = S;
  if (typeof module === 'object' && module.exports) module.exports = S;
})(typeof globalThis !== 'undefined' ? globalThis : this);
