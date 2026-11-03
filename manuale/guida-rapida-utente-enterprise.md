---
title: "Pseudomania Enterprise edition – guida rapida"
subtitle: "Per chi usa Claude nella propria organizzazione · bozza 0.1"
lang: it-IT
---

> Pseudomania **riduce**, non elimina, il rischio di inviare dati personali a Claude: può non
> riconoscere alcuni dati e il contesto. Resta valido il **regolamento d'uso** della tua
> organizzazione e la responsabilità di verificare ciò che invii e ciò che usi.

## 1. Non devi installare nulla

L'estensione è installata e configurata dall'organizzazione sul Chrome aziendale. Il suo pulsante
nella barra di Chrome è **bloccato su acceso**: cliccandolo, la finestra spiega «Protezione sempre
attiva: Pseudomania è gestito dalla tua organizzazione e non può essere disattivato.» Se compare
«Accesso richiesto: effettua il login a Pseudomania dal pulsante dell'estensione», clic sul pulsante di Pseudomania →
**Accedi**.

## 2. Come capire che è attiva

Su claude.ai, sopra la casella di scrittura: «Pseudomania attivo: i dati personali vengono
pseudonimizzati prima dell'invio». Se la barra manca o compare «Pagina non riconosciuta da
Pseudomania», **non inviare dati personali** e avvisa l'assistenza.

## 3. Che cosa succede a messaggi, allegati, progetti

- **Messaggi**: i dati riconosciuti diventano segnaposto (`[FULLNAME_1]`, `[CF_1]`…). Nel tuo fumetto
  vedi ciò che è partito; nella risposta i valori reali tornano **in verde**, solo sul tuo schermo.
- **Allegati**: PDF, DOCX, XLSX, TXT, CSV, MD pseudonimizzati, nome del file compreso; immagini
  bloccate. I file DOCX/XLSX scaricati da Claude tornano con i valori reali.
- **Progetti**: istruzioni e file del progetto pseudonimizzati; un solo dizionario per tutte le chat
  del progetto. Ogni anno conferma i progetti ancora in uso dal pannello: **«Il progetto è ancora in
  uso: conferma»**, altrimenti il dizionario scade.
- Segnaposto **rossi** nella risposta = non presenti nel dizionario: controlla quel punto.

## 4. Pannello di ispezione e anteprima

- Clic su «N dati protetti» sotto un messaggio → pannello **Ispezione Pseudomania**: «Originale (solo
  su questo computer)», «Inviato a Claude», dati sostituiti, **Segnala dato non riconosciuto**,
  **Segnala mascheramento errato** (nella nota non scrivere dati reali).
- **Ctrl+Maiusc+Invio**: «Anteprima di ciò che verrà inviato» prima dell'invio.

## 5. Messaggi bloccati

- **Dati particolari** (salute, reati, opinioni politiche, sindacato…): banner rosso «Invio
  bloccato», non forzabile. Riformula senza quei riferimenti. Se il blocco è sbagliato usa
  **Segnala blocco errato** (nel banner o nel pannello): funziona anche se il messaggio non è partito
  e non invia il testo.
- **Server non raggiungibile**: «Il server Pseudomania non è raggiungibile: per tutelare i dati
  personali l'invio è bloccato.» Riprova più tardi.

## 6. Cambio di PC

Su un nuovo PC (o profilo Chrome) le vecchie conversazioni mostrano segnaposto **grigi**: «… non sono
ripristinabili: il dizionario è stato cifrato su un altro computer». **Chat**: nessun recupero.
**Progetti**: pannello → **Prepara il recupero** → comunica all'assistenza il codice mostrato, con
la richiesta motivata; dopo l'intervento dei custodi i valori tornano da soli (o **Verifica chiavi
recuperate**).

## 7. Che cosa non fare

- **Niente dati personali nelle preferenze del profilo Claude** né nelle richieste di ricerca web:
  non passano da Pseudomania.
- **Niente dispositivi personali** o non gestiti con l'account dell'organizzazione, niente account
  personali per dati di lavoro.
- **Niente app desktop o mobile** di Claude, altri browser o incognito.
- Niente dati sanitari o giudiziari, credenziali, atti riservati; non chiedere a Claude di modificare
  i segnaposto; non aggirare l'estensione; niente feedback (pollici).

## 8. A chi rivolgersi

- Avvisi dell'estensione, accesso, recupero dei progetti: **help desk** `[DA DEFINIRE: contatto]`.
- Dato reale partito senza mascheramento o sospetta violazione: **subito** al referente indicato
  dal regolamento `[DA DEFINIRE]`, e cancella la conversazione.
- Domande sul trattamento dei tuoi dati: **DPO** `[DA DEFINIRE]`.
