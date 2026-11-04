# Documenti di prova della Personal edition

Tutti i dati sono **inventati e casuali** (generati da `collaudo/genera_prova_personal.py`, seme 20261104).
Codici fiscali, IBAN, partite IVA e carte superano i controlli di checksum ma non appartengono a nessuno;
domini `example.it`, indirizzi IP delle reti di documentazione.

I documenti coprono tutti i 24 tag di Rizzo-PII: FULLNAME, AGE, GENDER, DATE, TIME, STREET, BUILDINGNUM,
ZIPCODE, CITY, PROVINCE, EMAIL, TELEPHONENUM, CF, PIVA, ID_DOC, IBAN, CREDITCARDNUMBER, AMOUNT, TARGA, ORG,
DOCID, CATASTO, URL, IPADDR. I valori attesi per ogni file sono in `valori_attesi.json`.

| File | Come usarlo | Esito atteso |
|---|---|---|
| `01_lettera_tutti_i_tag.txt` | incolla il testo nella chat | tutti i 24 tipi sostituiti; «Tribunale di Bologna» resta |
| `02_scheda_cliente.md` | allega il file | tabella Markdown pseudonimizzata |
| `03_anagrafica_clienti.csv` | allega il file | 12 righe, CF e IBAN tutti sostituiti, separatore `;` intatto |
| `04_atto_citazione.docx` | allega il file | sostituiti anche intestazione, piè di pagina, elenco, tabella e nome in grassetto |
| `05_prospetto_pagamenti.xlsx` | allega il file | tre fogli; la formula del totale resta una formula |
| `06_verbale_sinistro.pdf` | allega il file | arriva a Claude come testo pseudonimizzato (Personal edition) |
| `07_blocco_dati_sanitari.txt` | incolla il testo | **invio bloccato** (art. 9 GDPR) |
| `07b_blocco_dati_giudiziari.txt` | incolla il testo | **invio bloccato** (art. 10 GDPR) |
| `08_trappole.txt` | incolla il testo | Claude, Anthropic, Pseudomania, Rizzo-PII, GDPR, AI Act, Tribunale e norme restano; il cognome «Rizzo» del cliente sparisce; lo stesso nome riceve sempre lo stesso segnaposto; CF e IBAN con spazi riconosciuti |
| `09_richiesta_risposta_lunga.txt` | incolla il testo | nella risposta tutti i valori tornano reali, anche in tabella e nel blocco di codice |

Cosa annotare per ogni prova: dati sfuggiti (in chiaro verso Claude), dati mascherati senza motivo,
segnaposto non ripristinati o inventati, tempi di attesa. Per vedere cosa è stato inviato usa il pannello
laterale di Pseudomania o l'anteprima (Ctrl+Maiusc+Invio).
