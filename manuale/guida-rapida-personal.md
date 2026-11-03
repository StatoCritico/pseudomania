---
title: "Pseudomania Personal edition – guida rapida"
subtitle: "Per il professionista · bozza 0.1"
lang: it-IT
---

> **Avvertenza.** Pseudomania **riduce** il rischio di inviare dati personali a claude.ai, **non lo
> elimina**: il riconoscimento può non individuare alcuni dati e non riconosce il contesto. I dati
> pseudonimizzati restano dati personali. La responsabilità legale (GDPR, clienti, contratti, esiti
> dell'uso dell'IA) resta **interamente tua**; il software è fornito senza garanzia (AGPL-3.0, sez.
> 15-16). Dettagli: manuale, capitolo 0.

## 1. Installa Rizzo-PII desktop

1. Scarica il pacchetto per il tuo sistema da <https://github.com/Rizzo-AI-Academy/rizzo-pii/releases>
   e installalo **[DA VERIFICARE: procedura dell'ultimo rilascio]**.
2. Avvialo: al primo avvio scarica il modello (alcuni minuti).
3. Controlla in Chrome `http://127.0.0.1:5005/health`: deve rispondere senza errori.

## 2. Installa l'estensione

1. Dal Chrome Web Store (quando disponibile) oppure: `chrome://extensions` → **Modalità
   sviluppatore** → **Carica estensione non pacchettizzata** → cartella `extension`.
2. Fissa l'icona di Pseudomania (puzzle → puntina).
3. **Clic destro** sul pulsante → **Impostazioni e informazioni** → **Verifica connessione** → «Rizzo-PII raggiungibile.» → **Salva**.

## 3. Controlla l'indicatore

| Badge sul pulsante | Significato (per la conversazione aperta) |
|---|---|
| **ON** verde | protezione attiva |
| **OFF** rosso | protezione disattivata: ciò che invii parte in chiaro |
| **?** arancione | in attesa della tua scelta: intanto i messaggi sono pseudonimizzati |
| **!** rosso | Rizzo-PII spento, in avvio o non raggiungibile |

Su claude.ai, sopra la casella: «Pseudomania attivo: i dati personali vengono pseudonimizzati prima
dell'invio».

**Prova**: invia `Scrivi una breve lettera a Mario Rossi, mario.rossi@example.it`. Nel tuo messaggio
vedi `[FULLNAME_1]` e `[EMAIL_1]`; nella risposta i valori reali tornano, **in verde**.

## 4. Usa

- Scrivi e invia come sempre. A Claude parte solo il testo con i segnaposto.
- **Anteprima**: **Ctrl+Maiusc+Invio** → «Anteprima di ciò che verrà inviato».
- **Ispezione**: clic su «N dati protetti» sotto il messaggio → originale e testo inviato.
- **File**: DOCX, XLSX, TXT, CSV, MD pseudonimizzati (anche il nome del file); i **PDF** partono come
  file di testo pseudonimizzato (.txt); immagini bloccate.
- **Dati particolari** (salute, reati…): «Invio bloccato»; se è un errore, **Segnala blocco errato**.
- Segnaposto **rossi** nella risposta = inventati da Claude: controlla quel punto.
- Cambio PC o cancellazione dei dati del browser: il dizionario è perso, nessun recupero.

## 5. Attiva / disattiva (per conversazione)

- **Clic** sul pulsante o **Alt+Maiusc+P**: attiva/disattiva la conversazione aperta. Clic destro:
  «Apri pannello di ispezione», «Impostazioni e informazioni».
- La scelta resta salvata per quella conversazione. Nuova chat: si attiva da sola se l'ultima volta
  era attiva; altrimenti banner **Attiva** / **Continua senza protezione** (stesso banner quando
  riprendi una chat disattivata).
- Spegnere riguarda **solo ciò che invii**: le risposte vengono comunque ripristinate.
- Primo spegnimento in una chat con dati protetti: avviso; **riattivare non ripulisce quanto già
  inviato**.

Se Rizzo-PII non
risponde compare «Rizzo-PII non risponde»: scegli **Annulla**, non **Invia senza protezione**, se ci
sono dati di clienti.

## 6. Da evitare

- Dati personali nelle **preferenze del profilo** Claude o nelle **ricerche web**.
- **App desktop o mobile** di Claude, altri browser, incognito per dati di clienti.
- Dati sanitari, giudiziari, di minori, password, segreti non autorizzati.
- Chiedere a Claude di modificare o «indovinare» i segnaposto.
- Feedback (pollici) su chat con dati di clienti; memoria e connettori attivi.
- Spegnere la protezione (o «Continua senza protezione») in chat con dati di clienti.

Se è partito un dato non mascherato: cancella la chat e valuta se è una violazione da notificare
(art. 33 GDPR). Sito: <https://pseudomania.statocritico.it>
