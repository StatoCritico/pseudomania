# Verifica dei selettori sul sito reale claude.ai

I selettori e gli endpoint interni in `src/sites/claude.js` sono marcati **«DA VERIFICARE sul sito
reale»**: sono stati ricostruiti senza poter accedere a claude.ai. Questo script li controlla sulla
pagina vera e produce un rapporto (trovato / non trovato / suggerimento). Va eseguito nel pilota da
un amministratore, a mano, e ripetuto a ogni aggiornamento visibile di claude.ai.

## Cosa fa (e cosa non fa)

- Apre Chrome **con finestra visibile** usando un profilo persistente in cui si è già fatto l'accesso
  a claude.ai. L'estensione Pseudomania **non** viene caricata: si verifica la pagina «nuda».
- Controlla ogni elenco di `SELECTORS` (casella di scrittura, pulsante di invio, microfono, messaggi,
  rigenera, collegamento al progetto, finestra delle istruzioni, modifica di un messaggio…) e le
  funzioni dell'adattatore (`findComposer`, `findSendButton`, `selfCheck`, `findInstructionsDialog`…).
- Prova a scrivere «prova» nella casella e a sostituirla con un incolla sintetico (come fa
  l'estensione), poi la **svuota**: nessun invio.
- Osserva le richieste `POST/PUT/PATCH` verso `/api/` e le confronta con `NETWORK_RULES`: per le
  richieste coperte verifica che i campi attesi (es. `prompt`) esistano; elenca le richieste **non
  coperte** da alcuna regola, che vanno valutate (potrebbero trasportare testo dell'utente).
- **Non invia messaggi** a meno che non si usi `--invia`: in tal caso invia UN solo messaggio innocuo
  («Messaggio di prova di Pseudomania: rispondi soltanto con la parola OK.») per osservare l'endpoint di
  completamento, lo streaming e i pulsanti della risposta.
- Il rapporto contiene solo selettori, attributi, percorsi (UUID e organizzazione sostituiti) e
  **nomi** dei campi JSON. Mai il contenuto dei messaggi.

## Preparazione

1. Usare un **account di prova** o comunque conversazioni e progetti **senza dati personali**.
2. Su un PC con Node ≥ 20:
   ```bash
   cd extension
   npm install          # installa Playwright
   npx playwright install chromium   # oppure usare --chrome con Google Chrome installato
   ```
3. Prima esecuzione: lo script apre la finestra; se non si è ancora autenticati, effettuare l'accesso
   a claude.ai nella finestra e premere Invio nel terminale. Il profilo (`--profilo`) conserva la sessione.
4. Preparare (facoltativo ma consigliato):
   - una conversazione di prova con almeno uno scambio → URL `https://claude.ai/chat/<uuid>`;
   - un progetto di prova → URL `https://claude.ai/project/<uuid>`.

## Esecuzione

```bash
node dev/verifica-sito-reale/verifica.js \
  --profilo ~/pseudogate-verifica-profilo \
  --chat https://claude.ai/chat/<uuid> \
  --progetto https://claude.ai/project/<uuid> \
  --json rapporto-verifica.json
```

Opzioni:

| Opzione | Significato |
|---|---|
| `--profilo <dir>` | profilo Chrome persistente (obbligatorio) |
| `--chat <url>` | conversazione di prova esistente: messaggi, intestazione, modifica |
| `--progetto <url>` | progetto di prova: istruzioni, conoscenze |
| `--invia` | invia UN messaggio di prova innocuo (senza: nessun invio) |
| `--non-interattivo` | salta i passaggi in cui si chiede di agire a mano |
| `--json <file>` | salva il rapporto anche in JSON (da allegare alla segnalazione) |
| `--chrome` | usa Google Chrome installato invece di Chromium |
| `--simula` | solo manutenzione dello script: usa la pagina finta `dev/fixture` invece di claude.ai |

Passaggi guidati (modalità interattiva): lo script chiede di aprire la **modifica** di un messaggio,
la finestra delle **istruzioni di progetto** e, facoltativamente, di caricare nel progetto un file di
prova senza dati personali. Ogni passaggio si salta rispondendo `s`. Non salvare le modifiche.

## Lettura del rapporto

```
[TROVATO    ] SELECTORS.composer – usato: div.ProseMirror[contenteditable="true"] (1), elemento: …
[PARZIALE   ] SELECTORS.sendButton – usato: button[aria-label*="Send" i] …
              suggerimento: il primo selettore non trova nulla; valutare di portare in testa "…"
[NON TROVATO] SELECTORS.retryButton – … → 0
              suggerimento: button[aria-label="Riprova"][type="button"]
[RETE] POST /api/organizations/<org>/chat_conversations/<uuid>/completion (fetch, application/json) → regola "completion"
       campo prompt: presente
```

- **TROVATO**: il primo selettore dell'elenco funziona.
- **PARZIALE**: funziona solo un'alternativa successiva: riordinare l'elenco.
- **NON TROVATO**: nessuna alternativa funziona; i *suggerimenti* elencano gli elementi candidati
  (con `data-testid`, `aria-label`, `role`…) da cui ricavare il nuovo selettore.
- **INFO**: elementi facoltativi o regole di rete non osservate in questa sessione.
- In fondo: richieste verso `/api/` non coperte da alcuna regola.

Note:
- `SELECTORS.streaming` si può verificare solo con `--invia` (serve una risposta in corso).
- I pulsanti della risposta (rigenera, copia) possono comparire solo al passaggio del mouse: lo script
  lo simula, ma se risultano non trovati, ripetere passando il mouse sull'ultima risposta.
- Le regole `retry`, `project-*`, `upload` vengono osservate solo se nella sessione si compiono le
  azioni corrispondenti (rigenerare una risposta, salvare istruzioni, caricare un file di prova).

## Dopo la verifica

1. Aggiornare `SELECTORS` e `NETWORK_RULES` in `src/sites/claude.js` secondo il rapporto.
2. Rieseguire `npm test`, `npm run test:dom`, `npm run test:e2e`.
3. Annotare data, esito e versione dell'estensione; allegare il JSON alla segnalazione interna.
4. Quando un selettore è confermato, togliere la nota «da verificare» accanto ad esso.
