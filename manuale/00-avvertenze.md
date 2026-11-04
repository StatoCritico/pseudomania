# 0. Avvertenze e disclaimer di responsabilità

> **Leggere prima di installare o usare Pseudomania.** Queste avvertenze valgono per entrambe le
> edizioni (Personal edition e Server edition) e sono richiamate alla fine del manuale.

## 0.1 Che cosa è Pseudomania, e che cosa non è

Pseudomania è uno **strumento di mitigazione del rischio**. Sostituisce automaticamente i dati
personali che riconosce con segnaposto (per esempio `[FULLNAME_1]`) prima che il testo arrivi a
claude.ai, e rimette i dati reali nelle risposte, solo nel tuo browser.

Pseudomania **non è**:

- una **garanzia di anonimizzazione**: i dati pseudonimizzati **restano dati personali** ai sensi
  dell'art. 4, n. 5, del GDPR per chi detiene la corrispondenza tra segnaposto e valori reali
  (cioè per te o per la tua organizzazione);
- un sistema infallibile: il **rilevamento può non riconoscere** alcuni dati (nomi insoliti, refusi,
  sigle, dati scritti in forma non standard, dati dentro immagini) e **non riconosce il contesto**
  che rende identificabile una persona anche senza il nome (un ruolo unico, una data e un luogo
  precisi, un fatto noto, un numero di pratica);
- un filtro completo delle categorie particolari di dati (artt. 9 e 10 GDPR): il blocco si basa su
  un elenco di parole, che produce sia falsi positivi sia falsi negativi;
- una protezione per ciò che non passa dall'estensione: **preferenze del profilo Claude**,
  **richieste di ricerca web** formulate da Claude, **connettori**, **app desktop e mobile** di
  Claude, altri browser e dispositivi.

## 0.2 La responsabilità resta di chi adotta e usa il sistema

**Tutta la responsabilità giuridica** connessa all'adozione e all'uso di Pseudomania e del servizio
di intelligenza artificiale resta **interamente** in capo a chi adotta e usa il sistema (il singolo
professionista, l'impresa o l'ente, e i loro utenti). In particolare, a titolo di esempio e non
esaustivo, resta a carico di chi adotta e usa il sistema:

- il rispetto del **GDPR** (Reg. UE 2016/679) e del **Codice privacy** (d.lgs. 196/2003): base
  giuridica, informative, registro dei trattamenti, misure di sicurezza, gestione delle violazioni,
  diritti degli interessati;
- la valutazione della necessità e la redazione della **DPIA** (art. 35 GDPR) e l'eventuale
  consultazione preventiva del Garante (art. 36);
- l'adozione di **policy e regolamenti** d'uso, la formazione del personale e l'alfabetizzazione
  in materia di IA (art. 4 del Reg. UE 2024/1689, AI Act);
- il rispetto del **diritto del lavoro**, in particolare dell'art. 4 della L. 300/1970 (Statuto dei
  lavoratori) e degli artt. 113-114 del Codice privacy, con l'eventuale accordo sindacale o
  autorizzazione dell'Ispettorato nazionale del lavoro;
- i **contratti con i fornitori di IA** (condizioni d'uso, accordo sul trattamento dei dati,
  trasferimenti verso Paesi terzi, sub-responsabili) e la verifica che l'uso dell'estensione sia
  compatibile con tali condizioni;
- gli **esiti dell'uso dell'IA**: correttezza, completezza e liceità dei testi prodotti e delle
  decisioni prese anche sulla base di essi, segreti professionali e d'ufficio, diritti di terzi.

I modelli di policy, informativa, DPIA e checklist citati in questo manuale (cartella
`governance/` del repository) sono **bozze da adattare**, non consulenza legale. Le indicazioni
normative marcate **[DA VERIFICARE]** non sono state controllate sul testo ufficiale.

## 0.3 Nessuna garanzia

Pseudomania è software libero distribuito con licenza **GNU Affero General Public License,
versione 3 o successiva (AGPL-3.0-or-later)**. Come previsto dalle **sezioni 15 (Disclaimer of
Warranty) e 16 (Limitation of Liability)** della licenza:

- il programma è fornito **«così com'è» (*as is*), senza garanzia di alcun tipo**, espressa o
  implicita, incluse le garanzie di commerciabilità e di idoneità a uno scopo particolare, nei
  limiti consentiti dalla legge applicabile; **l'intero rischio** quanto alla qualità e al
  funzionamento del programma è a carico di chi lo usa;
- **in nessun caso**, salvo quanto imposto dalla legge applicabile o concordato per iscritto, i
  titolari del copyright o chiunque modifichi e/o distribuisca il programma **sono responsabili**
  per danni generali, speciali, incidentali o consequenziali derivanti dall'uso o dall'impossibilità
  di usare il programma, inclusi la perdita di dati, dati resi inesatti o perdite subite da chi lo
  usa o da terzi.

Il testo vincolante è quello inglese della licenza (file `LICENSE` nel repository); la sezione 17
della licenza regola l'interpretazione delle sezioni 15 e 16 dove queste non possano avere effetto
secondo la legge locale.

## 0.4 Componenti di terzi e servizi esterni

Pseudomania usa componenti di terzi con licenze proprie (tra cui Privacy Guardrail del DFKI,
Apache-2.0, e Rizzo-PII, vedi `THIRD_PARTY_NOTICES.md`). Gli autori di Pseudomania **non hanno
alcun rapporto** con Anthropic (fornitore di Claude) né con gli autori di Rizzo-PII e non
rispondono del loro funzionamento, delle loro condizioni o delle loro modifiche. claude.ai può
cambiare in qualunque momento e rendere l'estensione temporaneamente inefficace.

## 0.5 In sintesi

> Pseudomania **riduce** il rischio di inviare dati personali a un servizio di IA; **non lo
> elimina**. Controlla sempre che cosa stai inviando, non inserire dati che non devono uscire,
> verifica le risposte. Chi adotta e usa il sistema ne resta l'unico responsabile; gli autori non
> rispondono di alcun danno.
