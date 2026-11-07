# Parti del manuale da aggiornare

Sezioni che dipendono da elementi **non ancora provati** o da fonti non verificate. Aggiornarle dopo
la prova tecnica e prima della pubblicazione definitiva. Stato al 31/10/2026 (seconda revisione,
dopo le correzioni riportate in `docs/PROBLEMI-RILEVATI.md`).

## 1. App desktop reale di Rizzo-PII (Personal edition)

Finora l'estensione è stata provata solo con un Rizzo-PII **simulato** (`extension/dev/mock-rizzo`).

| Sezione | Che cosa verificare |
|---|---|
| §2.1 Requisiti | sistemi supportati e pacchetti del rilascio più recente (2.0.0: nomi dei file non letti; 1.0.0: Windows, Linux x86_64, macOS arm64); RAM reale necessaria |
| §2.2 Installazione | procedura d'installazione, primo avvio, durata del download del modello, avvio automatico; schermata di scelta host/porta (citata nelle note del rilascio 2.0.0) |
| §2.2 riquadro CORS, §6.2 | se il servizio locale accetta le chiamate dal service worker dell'estensione; se no, pubblicare la **versione modificata di Rizzo-PII** e aggiornare il testo con il collegamento |
| §2.4 Configurazione | esiti di «Verifica connessione» con l'app reale (stati `ok`, `loading`, `down`, `cors`); risposta di `/health` durante il caricamento (le note del rilascio indicano 503 finché il modello non è pronto) |
| §2.7 PDF e immagini | PDF trattati come PDF nell'estensione (MuPDF) e immagini oscurate con OCR locale: provare con l'app reale il rilevamento sul testo estratto, i PDF scansionati e il ripiego in `.txt` |
| §2.10 Disinstallazione | posizione della cache del modello |
| §6.2 | porta alternativa; comportamento con porta occupata |
| §4.3 | nome del file: pseudonimizzato (trattini bassi letti come spazi, il nome ripristinato mostra uno spazio); provarlo con nomi di file reali e con l'app desktop |

## 2. Interfaccia reale di claude.ai

I selettori e gli endpoint interni dell'estensione (`extension/src/sites/claude.js`) non sono stati
provati sul sito reale (`extension/README.md` §6; script `extension/dev/verifica-sito-reale/`).

| Sezione | Che cosa verificare |
|---|---|
| §1.5, §4.2-§4.5 | intercettazione di invio, modifica, rigenerazione, allegati, testo lungo incollato, istruzioni e file dei progetti; ripristino durante lo streaming; copia; download |
| §2.5 Prova rapida | che l'istruzione fissa compaia nel primo fumetto e i valori tornino evidenziati in verde |
| §4.7 | apertura del pannello laterale dal contrassegno «dati protetti» |
| §4.9 | pulsante «Segnala blocco errato» nel banner e nel pannello (corretto nel codice): provarne la comparsa sul sito reale |
| §2.5, §2.6, guide rapide | attivazione per conversazione, disattivata di default dal 5/11/2026 (pulsante, Alt+Maiusc+P, badge **OFF** e barra arancione senza domande nelle nuove chat, pagine di progetto e nuove schede, riattivazione automatica delle chat attivate, avviso al primo spegnimento): provarla sul sito reale, in particolare il riconoscimento del cambio di chat nella stessa scheda e lo stato delle chat di progetto |
| §2.6 | etichetta dell'impostazione di privacy dei piani consumer («Help improve Claude» o simile) |
| §4.12 | nomi dei campi delle preferenze del profilo |

## 3. Console di Claude Team

Le pagine di support.claude.com non erano consultabili durante la stesura della documentazione
tecnica; verificata solo l'esportazione dei dati (*Data and privacy › Export Data*, solo Primary Owner)
e l'impostazione *Rate chats* (da `governance/verifiche-fase0.md`).

| Sezione | Che cosa verificare |
|---|---|
| §3.6 | percorsi ed etichette di: Require SSO, memoria, ricerca web, connettori e richieste, Claude in Chrome, voce, condivisione progetti e link pubblici, esportazione da parte dei membri, Cowork/Code/desktop; disponibilità sul piano Team; procedura di trasferimento del Primary Owner |
| §3.9 | domini di claude.ai per il proxy; restrizioni per tenant sul piano Team |
| §3.10 | percorsi e identificativi di Claude Desktop (Windows, macOS) e dell'estensione «Claude in Chrome» |

## 4. Server edition: punti tecnici aperti

Da `docs/PROBLEMI-RILEVATI.md` (la cartella `docs/` è in aggiornamento: ricontrollare).

| Sezione | Punto |
|---|---|
| §3.4 punto 7 | Langfuse condiviso/esterno (`CADDY_LANGFUSE_SITE`, `EXTRA_CA_FILE`, `OUTBOUND_NO_PROXY`): corretto nel codice, da provare con un Langfuse reale; job di cancellazione delle tracce «corretto, da provare» (Langfuse v4) |
| §3.4 punto 5 | `docs/installazione-ente.md` (versione letta) cita ancora `OIDC_CA_FILE`/`OIDC_HTTPS_PROXY`: il manuale usa i nomi nuovi da `deploy/.env.example`; riallineare se i docs cambiano |
| §3.2 | dimensionamento della VM (stime da misurare nel pilota) |

## 5. Distribuzione

| Sezione | Punto |
|---|---|
| §2.3, §2.9 | pubblicazione sul **Chrome Web Store** e relativo collegamento; URL del repository (oggi segnaposto) |
| §2.2 | collegamento alla versione modificata di Rizzo-PII sul sito |
| §4.10 | pagina del sito con la procedura di recupero (`/approfondimenti/#recupero-chiavi`, citata dall'estensione) |
| §6.2 | avvisi di Chrome per le estensioni caricate in modalità sviluppatore |

## 6. Riferimenti normativi

Tutti i punti marcati **[DA VERIFICARE]** nel capitolo 5 e nell'Appendice (L. 132/2025 artt. 11 e
13, art. 1-bis d.lgs. 152/1997, art. 51 d.lgs. 165/2001, AI Act artt. 6, 26, 50 e Allegato III,
qualificazione ACN, NIS2, linee guida AgID, EDPB 3/2019, copia ufficiale delle linee guida ACN):
allinearli a `governance/` quando il DPO li avrà verificati.

## 7. Risolti nella seconda revisione

- rotazione delle chiavi e CORS (`PUT`): avvisi tolti da §3.4 e §6.3;
- segnalazione di un invio bloccato senza messaggio inviato (§4.9);
- nome del file nella Personal edition (§4.3);
- sostituzione della chiave di custodia (`escrow_key_mismatch`): gestita dal server con rotazione automatica;
- durata del registro locale della Personal edition (90 giorni) citata come valore predefinito del prodotto.

## 8. Link non verificabili durante la stesura

- <https://chromeenterprise.google/policies/> (elenco delle policy di Chrome): richiesta di consultazione
  non autorizzata in tempo; non inserito nell'Appendice. È citato in `docs/configurazione.md`.
