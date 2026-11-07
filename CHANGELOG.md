# Registro delle modifiche

## 0.9.0 – 7/11/2026 (versione di prova)

- Personal edition: **oscuramento automatico delle immagini con OCR**. Il testo delle immagini incollate, trascinate o allegate (PNG, JPG, WebP, GIF, BMP) viene letto sul PC con Tesseract.js (nulla esce dal PC), i dati personali rilevati da Rizzo-PII vengono coperti con un riquadro nero che riporta il segnaposto e l'utente conferma dopo aver visto l'anteprima oscurata. L'immagine è sempre ricodificata (metadati EXIF rimossi) con nome generico. Nuova scelta predefinita della Personal edition; «Conferma per ogni immagine» e «Bloccate» restano disponibili.
- Personal edition: **PDF scansionati** letti con OCR (fino a 30 pagine): il PDF parte come PDF, con i dati coperti sulla scansione e il segnaposto scritto sopra; un PDF da cui non si ricava testo viene bloccato invece di essere inviato vuoto.
- Personal edition: **i PDF partono come PDF**, con l'impaginazione originale, invece che come file di testo. Il PDF è elaborato nell'estensione con MuPDF.js (stesso motore di PyMuPDF usato dalla Server edition, stessa logica): i dati personali sono tolti davvero dal documento e sostituiti dai segnaposto; metadati, annotazioni, campi modulo, segnalibri e allegati incorporati ripuliti; verifica finale dei residui (se un dato resta leggibile il file non parte). PDF protetti da password bloccati; valori troppo corti lasciati in chiaro con avviso. Il .txt resta solo come ripiego.
- Personal edition: nuova impostazione **«Immagini nei PDF»** (firme, timbri, fotografie, pagine scansionate): *Leggi e copri i dati* (predefinita, OCR sul PC fino a 30 pagine), *Togli le immagini*, *Lascia le immagini* (richiede una seconda conferma in una finestra; annullando resta la scelta precedente). Chiave `pdfImagePolicy` (`ocr|remove|keep`) in `chrome.storage.local`; non esiste nella Server edition.
- Personal edition: **PDF scaricati da Claude ripristinati con l'impaginazione** direttamente nell'estensione; `/restore/pdf` dell'app Rizzo-PII non è più necessario (resta come ripiego, poi il PDF di solo testo).
- Server edition invariata: la policy `imagePolicy: "ocr"` vale ancora come «bloccate»; i PDF li tratta il server.
- Librerie incluse nell'estensione: tesseract.js 6.0.1, tesseract.js-core 6.1.2, modello italiano `ita` (tessdata_best_int), MuPDF.js 1.28.1 (© Artifex Software, AGPL-3.0-or-later; pdf.js tolto); script `extension/scripts/vendor-ocr.sh` per riscaricarle con impronte verificate.
- Nuovi test: libreria dei riquadri, OCR e motore PDF nel documento offscreen, flusso completo con immagini caricate/incollate/trascinate, JPEG, PDF di testo, PDF con immagini (tre scelte), PDF scansionati e ripristino dei PDF scaricati; impostazione «Immagini nei PDF» con la seconda conferma.
- Numerazione: dopo la 0.1.14 si passa alla 0.9.0, ultima serie prima della 1.0.

## 0.1.14 – 5/11/2026 (versione di prova)

- Personal edition: protezione disattivata di default in ogni nuova conversazione e nuova scheda, senza domande; si attiva con l'icona o Alt+Maiusc+P e resta attiva nelle conversazioni in cui è stata attivata.
- Personal edition: nuova impostazione «Attivazione nelle conversazioni» con tre modalità: disattivata di default (predefinita), attiva di default, attiva con richiesta (il comportamento del 1/11/2026).
- Immagini (screenshot, foto): il testo che contengono non viene pseudonimizzato. Nuova impostazione «Immagini»: bloccate oppure inviate dopo una conferma per ogni immagine, con anteprima e nome di file generico. Personal edition: sceglie l'utente (predefinito: conferma). Server edition: decide l'ente con la nuova chiave di policy `imagePolicy` (predefinito: bloccate), visibile in sola lettura. Oscuramento automatico con OCR in arrivo.
- Progetti: i documenti DOCX e PDF caricati nella conoscenza del progetto non vengono più bloccati (il testo estratto da claude.ai era trattato come file Word).
- Progetti: riaprendo le istruzioni del progetto il campo mostra i valori reali (con la protezione attiva); al salvataggio vengono pseudonimizzati di nuovo.
- Sito: pagina 404; «Gratuito e open source» al posto di «Freeware»; build di Cloudflare Pages in `site/_build/pubblica.sh`.
- Riepilogo e problemi rilevati aggiornati con gli esiti della prova della Personal edition.

## 0.1.13 – 4/11/2026 (versione di prova)

Prima prova della Personal edition in condizioni reali (app desktop Rizzo-PII 2.0 e claude.ai) e correzioni
emerse dalla prova.

- **Allegati**: arrivano a Claude in tutti i modi di claude.ai: pulsante + (finestra «Carica o aggiungi file»),
  trascinamento (la finestra «Trascina i file qui» si chiude da sola) e incolla.
- **PDF scaricati da Claude**: ripristinati. Server edition: impaginazione conservata, riga per riga.
  Personal edition: PDF di solo testo, oppure con impaginazione se l'app Rizzo-PII offre `/restore/pdf`
  (proposta inviata al progetto Rizzo-PII).
- **Indicatore di attesa**: orologio con i secondi trascorsi se l'elaborazione supera 1 secondo.
- **Registro delle attività** consultabile e scaricabile dalle impostazioni (Personal edition).
- Stato OFF in arancione; istruzione sui segnaposto ridotta a etichetta nella pagina; avviso di ricaricare
  la pagina dopo un aggiornamento dell'estensione; avviso visibile quando un invio viene fermato.
- Corretti i falsi blocchi sui dati tecnici di claude.ai («Invio bloccato … file «file»») e la diagnosi
  CORS errata quando Rizzo-PII è lento; «Rizzo-PII» tra i termini da non mascherare.
- «Enterprise edition» rinominata **Server edition** in tutto il progetto.
- Documenti di prova con tutti i 24 tag di Rizzo-PII (`collaudo/prova-personal/`).
- Sito: nuovi testi, voce «Installazione e download» nel menu.
- Release automatica con lo zip dell'estensione (`.github/workflows/release.yml`).

## 0.1.0 – 3/11/2026

- Prima versione pubblica del codice: estensione Chrome (Personal e Server edition), server,
  stack docker-compose, strumento dei custodi, documenti di prova, documentazione, governance, manuale e sito.
  Non ancora provata in condizioni reali.
