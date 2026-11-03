> **ATTENZIONE - RISULTATI DI PROVA, NON INDICATIVI DEL MODELLO REALE.**
> Prodotto il 31/10/2026 contro l'API di Pseudomania (Enterprise edition) avviata in locale con
> PostgreSQL reale (DB applicativo + key store), un OpenBao simulato (solo HMAC), OIDC di prova e il
> **vero codice server di Rizzo-PII con il modello neurale sostituito da uno stub** che non rileva nulla:
> restano attive solo le regex/checksum di Rizzo (CF, IBAN, P.IVA, email, telefono, targa, importi,
> date numeriche, protocolli). Nomi, indirizzi, città, età ecc. risultano quindi non mascherati (0%);
> i PDF non sono valutabili (PyMuPDF non installato nell'ambiente di prova). Il ripristino è eseguito
> come nell'estensione: chiave utente, escrow, voci cifrate lato client e decifrate localmente.
> Ripetere con l'immagine Docker reale di Rizzo-PII per misurare le prestazioni effettive.

# Rapporto di collaudo Pseudomania — ESEMPIO CON RILEVATORE SIMULATO (stub), NON prestazioni del modello

- Data: 31/10/2026 08:16
- Server: `http://127.0.0.1:8788 (locale)` — versione 0.1.0, modalità ente, rilevatore ok
- Corpus: `collaudo/corpus` (documenti sintetici, dati inventati)

## Sintesi

| Indicatore | Valore |
|---|---|
| Dati personali mascherati (testi per span + file per valore) | 32% (48/152) |
| Precisione (testi, entità non neutre) | 100% (22/22) |
| Allowlist rispettata | 100% (41/41) |
| Blocchi corretti (artt. 9-10) | 100% (4/4) bloccati, 0 falsi blocchi su 16 documenti ammessi |
| Ripristino fedele (pseudonimizza → reidentifica) | 100% (16/16) |
| Valori reali rimasti nell'output | 95 |
| Documenti non valutabili (formato non supportato dal server) | pdf1_comunicazione, pdf2_liquidazione |

## Recall e precisione per tipo

Testi: un'entità è *mascherata* se un segnaposto la copre almeno in parte; *tipo giusto* se il tipo coincide; *copertura completa* se nessun carattere resta in chiaro. File: un valore è mascherato se non compare più nel documento restituito.

| Tipo | Testi: mascherate | Testi: tipo giusto | Testi: copertura completa | Precisione (testi) | File: valori mascherati |
|---|---|---|---|---|---|
| AGE | 0% (0/3) | 0% (0/3) | 0% (0/3) | – | – |
| AMOUNT | 100% (2/2) | 100% (2/2) | 100% (2/2) | 100% (2/2) | – |
| BUILDINGNUM | 0% (0/7) | 0% (0/7) | 0% (0/7) | – | – |
| CATASTO | 0% (0/2) | 0% (0/2) | 0% (0/2) | – | – |
| CF | 100% (4/4) | 100% (4/4) | 100% (4/4) | 100% (4/4) | 100% (8/8) |
| CITY | 0% (0/8) | 0% (0/8) | 0% (0/8) | – | 0% (0/1) |
| DATE | 67% (2/3) | 67% (2/3) | 67% (2/3) | 100% (2/2) | – |
| EMAIL | 100% (5/5) | 100% (5/5) | 100% (5/5) | 100% (5/5) | 100% (3/3) |
| FULLNAME | 0% (0/31) | 0% (0/31) | 0% (0/31) | – | 0% (0/22) |
| GENDER | 0% (0/1) | 0% (0/1) | 0% (0/1) | – | – |
| IBAN | 100% (3/3) | 100% (3/3) | 100% (3/3) | 100% (3/3) | 100% (9/9) |
| ID_DOC | 0% (0/3) | 0% (0/3) | 0% (0/3) | – | – |
| ORG | 0% (0/2) | 0% (0/2) | 0% (0/2) | – | – |
| PIVA | 100% (1/1) | 100% (1/1) | 100% (1/1) | 100% (1/1) | 100% (3/3) |
| PROVINCE | 0% (0/2) | 0% (0/2) | 0% (0/2) | – | – |
| STREET | 0% (0/9) | 0% (0/9) | 0% (0/9) | – | 0% (0/7) |
| TARGA | 100% (2/2) | 100% (2/2) | 100% (2/2) | 100% (2/2) | – |
| TELEPHONENUM | 100% (3/3) | 100% (3/3) | 100% (3/3) | 100% (3/3) | 100% (3/3) |
| ZIPCODE | 0% (0/4) | 0% (0/4) | 0% (0/4) | – | 0% (0/1) |

## Blocchi per categorie particolari

Matrice: veri blocchi 4, blocchi mancati 0, falsi blocchi 0, ammessi correttamente 16.

| Documento | Atteso blocco | Bloccato | Categoria attesa | Articolo citato |
|---|---|---|---|---|
| 11_blocco_salute | sì | sì | salute | sì |
| 12_blocco_giudiziario | sì | sì | giudiziari | sì |
| 13_blocco_sindacale | sì | sì | sindacale | sì |
| 14_blocco_disabilita | sì | sì | disabilita | sì |

## Ripristino (round-trip)

| Documento | Formato | Esito | Note |
|---|---|---|---|
| 01_delibera_giunta | testo | OK |  |
| 02_determina_dirigenziale | testo | OK |  |
| 03_lettera_tari | testo | OK |  |
| 04_risposta_accesso_atti | testo | OK |  |
| 05_verbale_commissione | testo | OK |  |
| 06_email_ufficio | testo | OK |  |
| 07_segnalazione_cittadino | testo | OK |  |
| 08_avviso_pubblico | testo | OK |  |
| 09_contratto_locazione | testo | OK |  |
| 10_verbale_polizia_locale | testo | OK |  |
| docx1_lettera_tributi | docx | OK |  |
| docx2_relazione_istruttoria | docx | OK |  |
| docx3_verbale_riunione | docx | OK |  |
| xlsx1_elenco_beneficiari | xlsx | OK |  |
| xlsx2_registro_protocollo | xlsx | OK |  |
| xlsx3_anagrafe_fornitori | xlsx | OK |  |

## Latenza (ms)

| Endpoint | Richieste | Mediana | p95 | Max |
|---|---|---|---|---|
| DELETE /v1/scopes | 22 | 7 | 9 | 10 |
| GET /v1/config | 1 | 5 | 5 | 5 |
| GET /v1/dictionary | 16 | 7 | 8 | 8 |
| GET /v1/health | 1 | 15 | 15 | 15 |
| POST /v1/dictionary/entries | 15 | 11 | 15 | 15 |
| POST /v1/keys/escrow | 1 | 8 | 8 | 8 |
| POST /v1/pseudonymize | 14 | 17 | 24 | 27 |
| POST /v1/pseudonymize/file (docx) | 3 | 28 | 50 | 50 |
| POST /v1/pseudonymize/file (pdf) | 2 | 5 | 5 | 5 |
| POST /v1/pseudonymize/file (xlsx) | 3 | 19 | 21 | 21 |
| POST /v1/reidentify/file (docx) | 3 | 12 | 13 | 13 |
| POST /v1/reidentify/file (xlsx) | 3 | 8 | 8 | 8 |

## Dettagli

### Valori non mascherati

- 01_delibera_giunta: ORG «Amici del Borgo APS»
- 01_delibera_giunta: FULLNAME «Carlo Ferretti»
- 01_delibera_giunta: FULLNAME «Paolo Cavallini»
- 01_delibera_giunta: FULLNAME «Elena Rinaldi»
- 01_delibera_giunta: STREET «via Roma»
- 01_delibera_giunta: BUILDINGNUM «18»
- 01_delibera_giunta: ZIPCODE «00185»
- 01_delibera_giunta: CITY «Roma»
- 01_delibera_giunta: FULLNAME «Lucia Montanari»
- 02_determina_dirigenziale: ORG «Edilverde S.r.l.»
- 02_determina_dirigenziale: FULLNAME «Giovanna Marchetti»
- 02_determina_dirigenziale: FULLNAME «Giuseppe Lombardo»
- 02_determina_dirigenziale: STREET «via delle Industrie»
- 02_determina_dirigenziale: BUILDINGNUM «7»
- 02_determina_dirigenziale: ZIPCODE «20121»
- 02_determina_dirigenziale: CITY «Milano»
- 02_determina_dirigenziale: PROVINCE «MI»
- 02_determina_dirigenziale: FULLNAME «Stefano Orlandini»
- 03_lettera_tari: FULLNAME «Antonio Esposito»
- 03_lettera_tari: STREET «Via dei Mille»
- 03_lettera_tari: BUILDINGNUM «12»
- 03_lettera_tari: ZIPCODE «80121»
- 03_lettera_tari: CITY «Napoli»
- 03_lettera_tari: PROVINCE «NA»
- 03_lettera_tari: STREET «via dei Mille»
- 03_lettera_tari: DATE «3 marzo 2019»
- 03_lettera_tari: FULLNAME «Chiara Benedetti»
- 04_risposta_accesso_atti: FULLNAME «Marina Serra»
- 04_risposta_accesso_atti: CATASTO «foglio 12, particella 345, sub. 6»
- 04_risposta_accesso_atti: FULLNAME «Leone Fortunato»
- 04_risposta_accesso_atti: FULLNAME «Paolo Cavallini»
- 05_verbale_commissione: FULLNAME «Stefano Orlandini»
- 05_verbale_commissione: FULLNAME «Elena Rinaldi»
- 05_verbale_commissione: FULLNAME «Marco De Santis»
- 05_verbale_commissione: FULLNAME «Davide Galli»
- 05_verbale_commissione: FULLNAME «Alessio Ruggeri»
- 05_verbale_commissione: CITY «Roma»
- 05_verbale_commissione: AGE «42 anni»
- 05_verbale_commissione: FULLNAME «Rosa Bianco»
- 05_verbale_commissione: FULLNAME «Ruggeri»
- 05_verbale_commissione: FULLNAME «Bianco»
- 06_email_ufficio: FULLNAME «Chiara Benedetti»
- 06_email_ufficio: FULLNAME «Davide Galli»
- 06_email_ufficio: FULLNAME «Bianco»
- 06_email_ufficio: FULLNAME «Davide»
- 06_email_ufficio: FULLNAME «Rosa Bianco»
- 06_email_ufficio: STREET «corso Vittorio Emanuele II»
- 06_email_ufficio: BUILDINGNUM «45»
- 06_email_ufficio: FULLNAME «Leone Fortunato»
- 06_email_ufficio: ID_DOC «CA12345AB»
- 06_email_ufficio: FULLNAME «Chiara»
- 07_segnalazione_cittadino: FULLNAME «Giuseppe Lombardo»
- 07_segnalazione_cittadino: STREET «via Garibaldi»
- 07_segnalazione_cittadino: BUILDINGNUM «3»
- 07_segnalazione_cittadino: CITY «Torino»
- 07_segnalazione_cittadino: AGE «77 anni»
- 09_contratto_locazione: FULLNAME «Roberto Villa»
- 09_contratto_locazione: CITY «Milano»
- 09_contratto_locazione: STREET «piazza Duomo»
- 09_contratto_locazione: BUILDINGNUM «2»
- 09_contratto_locazione: FULLNAME «Francesca Testa»
- 09_contratto_locazione: ID_DOC «CA98765ZX»
- 09_contratto_locazione: STREET «via Mazzini»
- 09_contratto_locazione: BUILDINGNUM «21»
- 09_contratto_locazione: ZIPCODE «60121»
- 09_contratto_locazione: CITY «Ancona»
- 09_contratto_locazione: CATASTO «foglio 7, particella 112, sub. 3»
- 10_verbale_polizia_locale: STREET «viale della Repubblica»
- 10_verbale_polizia_locale: FULLNAME «Marina Serra»
- 10_verbale_polizia_locale: GENDER «femmina»
- 10_verbale_polizia_locale: AGE «39 anni»
- 10_verbale_polizia_locale: CITY «Pisa»
- 10_verbale_polizia_locale: ID_DOC «PI1234567K»
- docx1_lettera_tributi: FULLNAME «Antonio Esposito»
- docx1_lettera_tributi: CITY «Napoli»
- docx1_lettera_tributi: ZIPCODE «80121»
- docx1_lettera_tributi: STREET «via dei Mille»
- docx1_lettera_tributi: FULLNAME «Chiara Benedetti»
- docx2_relazione_istruttoria: FULLNAME «Giovanna Marchetti»
- docx2_relazione_istruttoria: FULLNAME «Rosa Bianco»
- docx2_relazione_istruttoria: FULLNAME «Leone Fortunato»
- docx2_relazione_istruttoria: FULLNAME «Francesca Testa»
- docx2_relazione_istruttoria: STREET «via Po»
- docx2_relazione_istruttoria: STREET «vico Lungo»
- docx2_relazione_istruttoria: STREET «via Mazzini»
- docx3_verbale_riunione: FULLNAME «Carlo Ferretti»
- docx3_verbale_riunione: FULLNAME «Lucia Montanari»
- docx3_verbale_riunione: FULLNAME «Paolo Cavallini»
- docx3_verbale_riunione: FULLNAME «Giuseppe Lombardo»
- docx3_verbale_riunione: FULLNAME «Davide Galli»
- xlsx1_elenco_beneficiari: FULLNAME «Rosa Bianco»
- xlsx1_elenco_beneficiari: FULLNAME «Leone Fortunato»
- xlsx1_elenco_beneficiari: FULLNAME «Francesca Testa»
- xlsx1_elenco_beneficiari: STREET «via Po»
- xlsx1_elenco_beneficiari: STREET «vico Lungo»
- xlsx1_elenco_beneficiari: STREET «via Mazzini»
- xlsx1_elenco_beneficiari: FULLNAME «Giovanna Marchetti»
- xlsx2_registro_protocollo: FULLNAME «Marina Serra»
- xlsx2_registro_protocollo: FULLNAME «Giuseppe Lombardo»
- xlsx2_registro_protocollo: FULLNAME «Antonio Esposito»
- xlsx2_registro_protocollo: FULLNAME «Leone Fortunato»
- xlsx2_registro_protocollo: FULLNAME «Chiara Benedetti»
- xlsx3_anagrafe_fornitori: FULLNAME «Giuseppe Lombardo»
- xlsx3_anagrafe_fornitori: FULLNAME «Marco De Santis»

### Violazioni dell'allowlist

- nessuna

### Falsi positivi (testi)

- nessuno

### Documenti

| Documento | Formato | Esito |
|---|---|---|
| 01_delibera_giunta | txt | 4 entità |
| 02_determina_dirigenziale | txt | 5 entità |
| 03_lettera_tari | txt | 3 entità |
| 04_risposta_accesso_atti | txt | 3 entità |
| 05_verbale_commissione | txt | 1 entità |
| 06_email_ufficio | txt | 3 entità |
| 07_segnalazione_cittadino | txt | 3 entità |
| 08_avviso_pubblico | txt | 0 entità |
| 09_contratto_locazione | txt | 5 entità |
| 10_verbale_polizia_locale | txt | 3 entità |
| 11_blocco_salute | txt | bloccato |
| 12_blocco_giudiziario | txt | bloccato |
| 13_blocco_sindacale | txt | bloccato |
| 14_blocco_disabilita | txt | bloccato |
| docx1_lettera_tributi | docx | 6 segnaposto distinti |
| docx2_relazione_istruttoria | docx | 6 segnaposto distinti |
| docx3_verbale_riunione | docx | 3 segnaposto distinti |
| xlsx1_elenco_beneficiari | xlsx | 6 segnaposto distinti |
| xlsx2_registro_protocollo | xlsx | 4 segnaposto distinti |
| xlsx3_anagrafe_fornitori | xlsx | 8 segnaposto distinti |
| pdf1_comunicazione | pdf | non valutato: Il supporto PDF non è installato su questo server. |
| pdf2_liquidazione | pdf | non valutato: Il supporto PDF non è installato su questo server. |

---
Nota: corpus sintetico con dati inventati; i risultati misurano il comportamento del sistema su questi esempi e non sostituiscono la valutazione su documenti reali (da svolgere in ambiente controllato con il DPO).
