# Registro delle modifiche

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
