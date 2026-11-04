# Registro delle modifiche

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
