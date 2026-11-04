---
title: "Valutazione d'impatto sulla protezione dei dati (DPIA) – Pseudomania Server edition e uso di Claude Team"
subtitle: "BOZZA ai sensi dell'art. 35 del Regolamento (UE) 2016/679"
lang: it-IT
---

> **BOZZA – versione 0.3 del 31/10/2026 – documento non approvato, da sottoporre al RPD/DPO.**
> I campi `[DA DEFINIRE]` vanno completati dall'Ente; i riferimenti `[DA VERIFICARE]` non sono stati
> controllati sul testo ufficiale o dipendono da documentazione del fornitore da acquisire.

# 0. Scheda del documento

| Voce | Contenuto |
|---|---|
| Titolare | `[DA DEFINIRE]` |
| RPD/DPO | `[DA DEFINIRE]` |
| Redattori | `[DA DEFINIRE]` |
| Trattamento | Uso di Claude Team (claude.ai) da parte del personale, con pseudonimizzazione automatica tramite **Pseudomania Server edition** (https://pseudomania.statocritico.it) |
| Fase | Pilota: 6 utenti, solo Claude, solo chat (inclusi Progetti, allegati e ricerca web) |
| Stato | BOZZA 0.3 (31/10/2026): recepisce le decisioni dell'Ente del 31/10/2026 (memoria spenta, ricerca web attiva, cifratura lato client con custodia delle chiavi, osservabilità ibrida, durate di conservazione) |
| Documenti collegati | Regolamento d'uso (bozza, con Allegati A informativa, B cancellazione e backup, C Custodi); Checklist adempimenti; Verifiche di fase 0; SPEC.md e DECISIONI.md del progetto; registro dei trattamenti `[DA DEFINIRE]` |
| Fuori ambito | **Pseudomania Personal edition** (solo estensione + servizio locale di rilevamento sulla postazione del singolo): non è un trattamento dell'Ente; chi la adotta è titolare dei propri trattamenti (modello `policy-light.md`) |

# 1. Necessità della DPIA

## 1.1 Criteri WP248 rev.01 (Linee guida del Gruppo Art. 29, fatte proprie dall'EDPB)

| Criterio | Ricorre? | Motivazione |
|---|---|---|
| 1. Valutazione o assegnazione di un punteggio | No | Nessuna profilazione degli utenti; uso per tali fini vietato dal Regolamento |
| 2. Decisioni automatizzate con effetti giuridici | No (escluso per regolamento) | L'IA è di supporto; decisione umana (art. 14 L. 132/2025) |
| 3. Monitoraggio sistematico | **Sì, potenziale** | Registro minimo pseudonimo e possibilità di esportare le conversazioni |
| 4. Dati sensibili o di natura estremamente personale | **Possibile** | Documenti di lavoro riservati; artt. 9-10 esclusi ma non rilevabili con certezza |
| 5. Trattamento su larga scala | Da valutare | Pilota limitato; a regime ~150 utenti e volumi documentali significativi |
| 6. Combinazione di insiemi di dati | Parziale | Dizionario + testi pseudonimizzati + esportazione Claude Team |
| 7. Interessati vulnerabili | **Sì** | Dipendenti (squilibrio di potere col datore); cittadini in rapporto con la PA |
| 8. Uso innovativo / nuove soluzioni tecnologiche | **Sì** | Modelli linguistici generativi; pseudonimizzazione automatica; cifratura lato client con custodia delle chiavi |
| 9. Trattamento che impedisce l'esercizio di diritti | No | — |

Ricorrono **almeno due criteri**: la DPIA è necessaria.

## 1.2 Elenco del Garante (provv. n. 467 dell'11 ottobre 2018, Allegato 1)

Il trattamento ricade almeno nelle tipologie **n. 5** (trattamenti nel rapporto di lavoro mediante
sistemi tecnologici da cui derivi la possibilità di controllo a distanza) e **n. 7** (tecnologie
innovative, tra cui l'IA, con almeno un altro criterio WP248).

# 2. Descrizione sistematica del trattamento (art. 35, par. 7, lett. a)

## 2.1 Contesto

Una parte del personale usa già account **Claude Team** senza controlli specifici. L'Ente ha deciso di
non vietare lo strumento ma di **ridurre il rischio** introducendo: (i) un Regolamento d'uso;
(ii) Pseudomania, che sostituisce i dati personali con segnaposto prima dell'invio a claude.ai e li
ripristina solo nel browser; (iii) restrizioni sulle funzioni del servizio e sui canali di accesso.
L'abbonamento Claude Team è un **presupposto** (nel pilota non si usa l'API). Pseudomania è una misura
di mitigazione, **non una garanzia** di anonimizzazione.

**Impostazioni della console Claude Team decise dall'Ente:** memoria **spenta**; connettori, richieste
di connettori dei membri, Claude in Chrome, voce, condivisione dei progetti e feedback (*Rate chats*)
**disattivati**; ricerca web **attiva**; ruolo di *Primary Owner* solo sull'**account di custodia**.

## 2.2 Finalità

| # | Finalità | Base giuridica |
|---|---|---|
| F1 | Supporto dell'IA generativa all'attività amministrativa (redazione, sintesi, analisi di testi e documenti, ricerca web) | Art. 6, par. 1, lett. e), GDPR; art. 2-ter d.lgs. 196/2003; art. 14 L. 132/2025 |
| F2 | Protezione dei dati di terzi presenti nei testi (pseudonimizzazione, cifratura del dizionario) | Artt. 25 e 32 GDPR |
| F3 | Sicurezza, verifica del funzionamento e miglioramento del rilevamento (registro minimo, tracce brevi) | Art. 32 GDPR; art. 6, par. 1, lett. c) ed e) |
| F4 | Accertamenti su richiesta dell'Autorità giudiziaria; recupero dei dizionari di progetto su richiesta dell'utente | Art. 6, par. 1, lett. c) ed e), GDPR |

Esclusa la finalità di valutazione della prestazione o di controllo dell'attività lavorativa. I
trattamenti di dati di dipendenti avvengono nel rispetto dell'art. 88 GDPR, dell'art. 4 L. 300/1970 e
degli artt. 113-114 del Codice privacy; lo Statuto dei lavoratori si applica alle pubbliche
amministrazioni `[DA VERIFICARE: art. 51, c. 2, d.lgs. 165/2001]`.

## 2.3 Categorie di interessati e di dati

| Interessati | Dati | Fonte |
|---|---|---|
| Dipendenti utenti del servizio | Identità SSO, e-mail, nome (account Claude Team presso Anthropic); pseudonimo HMAC, ufficio, metadati d'uso e impronte SHA-256 (registro minimo); testi pseudonimizzati (tracce brevi); preferenze del profilo Claude (non intercettate) | IdP dell'Ente, Pseudomania, Anthropic |
| Terzi citati nei testi e documenti: cittadini, imprese (persone fisiche), altri dipendenti, professionisti | Dati comuni: anagrafici, recapiti, indirizzi, codici fiscali, IBAN, importi, targhe, date, numeri di documento, riferimenti a pratiche | Atti e documenti dell'Ente |
| Come sopra | **Esclusi per regolamento**: dati di cui agli artt. 9 e 10 GDPR (bloccati se rilevati) | — |

**Natura dei dati inviati ad Anthropic.** Secondo l'art. 4, n. 5, GDPR e le Linee guida EDPB 01/2025
i dati pseudonimizzati restano dati personali per il titolare che detiene le informazioni aggiuntive.
La sentenza CGUE 4 settembre 2025, C-413/23 P (*EDPS c. SRB*) ha precisato che, per un destinatario
privo di mezzi ragionevoli di re-identificazione, i dati pseudonimizzati possono non essere personali,
ma che l'obbligo di informare sui destinatari va valutato dal punto di vista del titolare al momento
della raccolta. In via prudenziale i contenuti inviati ad Anthropic sono trattati **come dati
personali**: la pseudonimizzazione automatica non è completa; i contenuti sono associati all'account
nominativo; preferenze del profilo e richieste di ricerca non passano dal rilevamento.

## 2.4 Architettura e flussi di dati

**Cifratura del dizionario (lato client).** Al primo avvio l'estensione genera una **chiave utente**
AES-GCM 256 (K_u); subito la cifra con la **chiave pubblica di custodia** dell'Ente (RSA-OAEP-4096)
e la invia al server come **copia di custodia (escrow)**, poi la importa nel browser come chiave **non
estraibile** e ne scarta la copia grezza. Nessuna frase segreta: nessun lavoro per l'utente o per l'IT.
La chiave privata di custodia è generata offline e divisa tra i Custodi (Shamir 2 di 3); **non è mai
sul server**. Il server conserva per ogni voce: HMAC del valore (per dare lo stesso tag allo stesso
valore), testo cifrato, IV, identificativo della chiave. Le copie di custodia stanno in un **key store
separato** (database, volume e backup propri). Rotazione automatica della chiave ogni 90 giorni.

| # | Da | A | Dati | Protezione |
|---|---|---|---|---|
| 1 | Estensione (Chrome gestito) | Server Pseudomania (VM interna) | Testo e allegati in chiaro, token OIDC | TLS con certificato dell'Ente, rete interna |
| 2 | API | Rizzo-PII (container) | Testo in chiaro | Rete interna, nessuna uscita verso Internet |
| 3 | API | Estensione | Testo pseudonimizzato + valori delle **sole voci nuove** (`newEntries`) | TLS; il server non scrive i valori su disco né nei log |
| 4 | Estensione | API → DB applicativo | Voci cifrate con K_u (testo cifrato, IV, keyId) | Cifratura lato client; il server non ha K_u |
| 5 | Estensione | API → key store | Copia di custodia di K_u | Cifrata con la chiave pubblica di custodia |
| 6 | Estensione | claude.ai (Anthropic, USA) via proxy | Testo/allegati pseudonimizzati, istruzione sui segnaposto; account nominativo; preferenze del profilo e richieste di ricerca web **non filtrate** | TLS; proxy autenticato; solo da Chrome gestito |
| 7 | claude.ai | Sub-fornitore di ricerca web | Query generate dal modello (da testi pseudonimizzati) | Regola d'uso; misura nel pilota (R15) |
| 8 | API → estensione | Ripristino | Voci cifrate; decifratura locale nel browser | Solo il proprietario dello scope |
| 9 | API / estensione | Registro minimo; Langfuse (progetto dedicato) | Pseudonimo HMAC, ufficio, conteggi, SHA-256; testi pseudonimizzati (Langfuse) | DB interno; Langfuse dell'Ente con progetto e chiavi dedicate |
| 10 | Account di custodia (2 Custodi) | Esportazione Claude Team | Conversazioni dell'organizzazione | Solo su richiesta dell'Autorità giudiziaria; estrazione parziale; distruzione del resto; verbale |
| 11 | Custodi (offline) | Postazione offline | Copie di custodia e voci cifrate esportate | Ricomposizione 2 di 3; solo voci richieste; verbale |

## 2.5 Conservazione e motivazione delle durate

| Dato | Durata | Motivazione e fonti |
|---|---|---|
| Dizionario chat | 30 giorni dall'ultimo uso; nessun recupero dopo cambio di postazione | Minimizzazione e limitazione della conservazione (art. 5, par. 1, lett. c ed e, GDPR) |
| Dizionario progetti | Durata del progetto + 30 giorni dall'ultimo uso; conferma annuale dell'utente (senza conferma scade); recupero via Custodi su richiesta motivata | Come sopra; i progetti hanno vita lunga, la conferma evita dizionari dimenticati |
| Scope `pending:` | 24 ore | Tecnica |
| Registro minimo (`audit_events`) | **90 giorni** in forma pseudonima, poi solo aggregati anonimi (giorno, ufficio, azione, conteggi) | Garante, documento di indirizzo del 6/6/2024 (doc. web 10026277): i metadati che consentono un controllo indiretto vanno conservati al massimo 21 giorni, oltre servono le garanzie dell'art. 4, c. 1, L. 300/1970. Provv. Regione Lombardia (29/4/2025, doc. web 10134221): sanzione per conservazione generalizzata senza accordo, con ordine di limitare i log a 90 giorni e poi anonimizzarli. Pertanto i 90 giorni sono subordinati all'**accordo sindacale o autorizzazione INL** e alla finalità di verifica dell'autenticità delle esportazioni |
| Tracce Langfuse | 30 giorni nel pilota, poi 7 (job dell'Ente: la conservazione automatica di Langfuse self-hosted è a pagamento) | Minimizzazione; servono solo per misurare il rilevamento. Per analogia, le Linee guida EDPB 3/2019 sui dispositivi video indicano tempi brevi (pochi giorni) con cancellazione automatica `[DA VERIFICARE: paragrafo]` |
| Backup DB applicativo | Rotazione ≤ 35 giorni (7 giornalieri + 4 settimanali), una copia offline | Continuità di servizio; EDPB, azione coordinata 2025 sul diritto alla cancellazione (rapporto 18/02/2026): difficoltà a cancellare dai backup → durata breve e riapplicazione delle cancellazioni (Allegato B) |
| Key store e suoi backup | Backup separati, rotazione 14 giorni | Separazione chiavi/dati; ACN, LG banche dati (nov. 2024): backup cifrati e ad accesso limitato |
| Copie di custodia | Stessa vita della chiave (rotazione 90 giorni), distrutte con la chiave | Cancellazione crittografica (NIST SP 800-88 Rev. 2, *cryptographic erase* come tecnica di *purge*) |
| Registri tecnici accessi amministratori e Custodi; registro cancellazioni | 24 mesi, sola aggiunta, catena di hash | Garante, provv. 27/11/2008 amministratori di sistema (log di accesso inalterabili, almeno 6 mesi); ACN, LG banche dati (log conservati almeno 24 mesi) |
| Verbali dei Custodi e richieste dell'Autorità | Protocollati, secondo il massimario dell'Ente | Linee guida AgID sulla formazione, gestione e conservazione dei documenti informatici (2021) `[DA VERIFICARE: determinazione vigente]` |
| Blocco per Autorità giudiziaria | Sospende la cancellazione dei soli dati indicati, fino a revoca, registrato | Obblighi di legge |
| Conversazioni su claude.ai | Piano Team: **a tempo indeterminato** per default; conservazione personalizzata solo Enterprise; tempi di rimozione dopo la cancellazione non pubblicati | Condizioni del fornitore (`verifiche-fase0.md` § 3b) |
| Feedback ad Anthropic | Fino a 5 anni, usabili per l'addestramento → **disattivati** | Privacy Center di Anthropic |

Riferimento di principio: Linee guida del Garante per posta elettronica e Internet del 1/3/2007
(doc. web 1387522), richiamate dal documento del 2024, sull'aspettativa di riservatezza dei lavoratori.

## 2.6 Destinatari

- Personale autorizzato (art. 29 GDPR; art. 2-quaterdecies Codice privacy) e amministratori di
  sistema, senza accesso ai dizionari in chiaro né all'account di custodia.
- **Anthropic Ireland, Limited** (entità contraente per il SEE) – responsabile del trattamento
  (art. 28 GDPR) tramite il DPA incorporato nei Commercial Terms (versione consultata: 24/02/2025);
  Anthropic PBC (USA) come importatore `[da confermare, verifiche-fase0 Q2]`.
- **Sub-responsabili di Anthropic**: da fonte secondaria AWS, Google Cloud, Microsoft Azure,
  Cloudflare (infrastruttura), WorkOS (SSO), **Brave Search (ricerca web)**, Stripe, servizi di
  assistenza e anti-abuso. Elenco ufficiale da allegare `[DA FARE]`.
- Langfuse dell'Ente (servizio interno condiviso con altre applicazioni; progetto e chiavi dedicate a
  Pseudomania; accesso al progetto riservato agli amministratori designati).
- Fornitore per sviluppo e manutenzione di Pseudomania (responsabile ex art. 28) `[DA DEFINIRE]`.
- Autorità giudiziaria, su richiesta.

## 2.7 Trasferimenti verso Paesi terzi

I dati sono trattati negli Stati Uniti (e, tramite i fornitori infrastrutturali, potenzialmente in
altri Paesi). Il DPA prevede le **clausole contrattuali tipo** (moduli 2 e 3, legge e foro irlandesi).
Né il DPA né il Privacy Center di Anthropic menzionano il Data Privacy Framework e l'elenco ufficiale
DPF non è stato consultabile: il trasferimento si considera fondato sulle **SCC** (art. 46 GDPR), con
**valutazione d'impatto del trasferimento (TIA)** documentata `[DA FARE]`.

## 2.8 Strumenti e componenti

Chrome gestito con policy Enterprise; estensione Pseudomania (MV3, derivata da Privacy Guardrail –
DFKI, Apache-2.0); server FastAPI su VM Linux interna; Rizzo-PII; PostgreSQL 16 (database applicativo)
e PostgreSQL separato per il key store; OpenBao (chiavi HMAC); Langfuse dell'Ente (progetto dedicato);
Caddy; strumento offline dei Custodi (`tools/custodi/`); identity provider dell'Ente (OIDC) con accesso
condizionato; proxy dell'Ente; MDM per i dispositivi Android; console di amministrazione di Claude Team.

# 3. Necessità e proporzionalità (art. 35, par. 7, lett. b)

1. **Necessità.** L'uso di Claude Team è già in atto; l'alternativa "nessun intervento" lascia i dati
   esposti senza controlli. Un divieto puro è stato ritenuto meno efficace (*shadow AI* con account o
   dispositivi personali). L'impiego risponde all'obiettivo di efficienza dell'azione amministrativa
   (art. 14, c. 1, L. 132/2025).
2. **Minimizzazione.** Al fornitore arrivano solo testi pseudonimizzati; esclusi i dati degli artt.
   9-10; memoria e funzioni non necessarie disattivate; ricerca web mantenuta per la sua utilità, con
   regola d'uso e misura nel pilota.
3. **Protezione del dizionario.** Cifratura lato client con chiave automatica: l'amministratore del
   server non può decifrare in blocco i dizionari; il recupero è possibile solo con due Custodi.
4. **Registro proporzionato.** Registro minimo **senza testi**, con impronte SHA-256 che servono solo a
   verificare l'autenticità delle esportazioni e delle cancellazioni; 90 giorni e poi solo aggregati
   anonimi; tracce Langfuse brevi.
5. **Osservabilità ibrida.** I contenuti non sono duplicati sul server: in caso di richiesta
   dell'Autorità si usa l'esportazione di Claude Team con doppio controllo, estraendo solo il
   necessario e distruggendo il resto.
6. **Alternative valutate.** Proxy di rete (scartato: cifratura TLS, complessità); piano Enterprise
   (log di audit, Compliance API, conservazione personalizzata: costo superiore) `[DA DEFINIRE:
   valutazione costi]`; modelli locali (qualità e costi) `[DA DEFINIRE]`; frase segreta dell'utente per
   la cifratura (scartata: carico per utenti e IT, rischio di perdita). Valutazione comparativa ai
   sensi dell'art. 68 CAD `[DA DEFINIRE]`.
7. **Informazione e diritti.** Informativa ai dipendenti (Allegato A del Regolamento); trasparenza
   verso i cittadini sull'uso dell'IA; aggiornamento delle informative di settore per i terzi i cui dati
   compaiono nei documenti `[DA VERIFICARE con il RPD]`.

# 4. Valutazione dei rischi (art. 35, par. 7, lett. c)

**Scala.** Probabilità (P) e gravità (G): 1 = bassa, 2 = media, 3 = alta, 4 = molto alta.
Rischio = P × G: 1-3 **basso**, 4-6 **medio**, 8-9 **alto**, 12-16 **molto alto**.
Valutazioni **preliminari**, da confermare dopo i test della fase pilota.

| ID | Rischio | Fonte | P | G | Rischio inerente | Misure (rif. progetto) | P res. | G res. | Rischio residuo |
|---|---|---|---|---|---|---|---|---|---|
| R1 | **Dati personali non rilevati** (falsi negativi) inviati ad Anthropic | Limiti del modello NER; formati insoliti; OCR di PDF; tabelle XLSX | 4 | 3 | 12 molto alto | Rizzo-PII su testo e allegati; allowlist controllata; ispezione; segnalazione falsi negativi; test periodici con corpus dell'Ente; formazione; *fail-closed* | 3 | 2 | 6 medio |
| R2 | **Quasi-identificatori** che consentono la re-identificazione | Contesto descrittivo | 3 | 3 | 9 alto | Art. 6 Regolamento; formazione; ispezione; mascheramento di DATE, CITY, ORG, AGE; esclusione artt. 9-10 | 2 | 3 | 6 medio |
| R3 | **Furto o lettura del dizionario** e re-identificazione massiva | Compromissione VM, DB, backup o abuso dei privilegi di root | 2 | 4 | 8 alto | **Cifratura lato client** con chiave utente non estraibile: DB e backup contengono solo testi cifrati; chiave privata di custodia offline e divisa 2 di 3; key store separato con backup propri; rotazione 90 giorni; scadenze; amministratori designati e tracciati. **Residuo dichiarato:** (a) il server vede il testo in chiaro durante la singola richiesta e root può intercettare **richieste future**; (b) root può verificare se un **valore indovinato** è presente (HMAC); (c) non può decifrare i dizionari passati | 1 | 3 | 3 basso |
| R3b | **Perdita di disponibilità del dizionario** (cambio di PC, profilo Chrome cancellato, voci non caricate entro 10 minuti) | Chiave legata al browser | 3 | 1 | 3 basso | Recupero via Custodi per i progetti; per le chat perdita accettata; segnaposto mostrati come "non ripristinabili" | 3 | 1 | 3 basso |
| R4 | **Uso improprio del registro o delle tracce per monitorare i dipendenti** | Accessi di dirigenti/amministratori | 3 | 3 | 9 alto | Registro minimo senza testi; pseudonimo HMAC; 90 giorni poi aggregati anonimi; tracce Langfuse 30→7 giorni; accesso solo aggregato; accordo sindacale/autorizzazione INL; registri degli accessi in sola aggiunta | 1 | 3 | 3 basso |
| R4b | **Esportazione delle conversazioni di tutti i membri** dalla console Claude Team (funzione del Primary Owner, senza log di audit sul piano Team) | Funzioni di amministrazione del fornitore | 3 | 3 | 9 alto | **Osservabilità ibrida governata:** Primary Owner solo sull'account di custodia, password e MFA divise tra due Custodi; uso solo su richiesta dell'Autorità giudiziaria; estrazione della sola parte richiesta e distruzione verbalizzata del resto; autenticità verificata con le impronte SHA-256; auto-esportazione dei membri disattivata; inclusione nell'accordo ex art. 4 L. 300/1970 | 1 | 3 | 3 basso |
| R5 | **Elusione tramite dispositivi o app non gestiti** | Comportamento dell'utente | 3 | 3 | 9 alto | SSO con accesso condizionato; proxy che consente claude.ai solo da Chrome gestito; app desktop bloccata; app Android bloccata via MDM; estensione forzata e non disattivabile; evento `extension_disabled`; sanzioni | 2 | 3 | 6 medio |
| R6 | **Trattamento lato fornitore e trasferimento negli USA** | Fornitore e sub-responsabili; quadro giuridico USA | 2 | 3 | 6 medio | Solo dati pseudonimizzati; DPA art. 28; SCC + TIA; divieto di addestramento sui contenuti del cliente; feedback disattivati; memoria spenta; cancellazione delle chat non necessarie; verifica qualificazione ACN | 1 | 3 | 3 basso |
| R7 | **Alterazione dei segnaposto** con ripristino di dati errati | Modello che declina, rinumera o inventa tag | 2 | 3 | 6 medio | Istruzione fissa a Claude; rilevamento `unknownTags`; evidenziazione dei valori ripristinati; verifica umana obbligatoria. **Collisione tra scope tramite la memoria: mitigata spegnendo la memoria di Claude** (decisione dell'Ente del 31/10/2026); i tag valgono solo nella propria conversazione o progetto | 1 | 3 | 3 basso |
| R8 | **Malfunzionamento dell'estensione dopo modifiche dell'interfaccia di claude.ai** | Aggiornamenti del fornitore | 3 | 3 | 9 alto | *Fail-closed*; evento `page_unrecognized` con blocco; test automatici; rilascio rapido; procedura di sospensione | 2 | 3 | 6 medio |
| R9 | **Affidamento eccessivo / inesattezza degli output** in atti amministrativi | Natura probabilistica dei modelli | 3 | 3 | 9 alto | Art. 14, c. 2, L. 132/2025; obbligo di verifica; formazione art. 4 AI Act; divieto di decisioni automatizzate | 2 | 3 | 6 medio |
| R10 | **Fuga di categorie particolari o dati giudiziari** | Testi su salute, disabilità, procedimenti penali, iscrizioni sindacali | 3 | 4 | 12 molto alto | Divieto; blocco senza override se rilevati; dizionari di termini sensibili `[DA DEFINIRE]`; formazione; esclusione dal pilota degli uffici a rischio `[DA DEFINIRE]` | 2 | 4 | 8 alto |
| R11 | **Accesso non autorizzato all'account Claude** | Phishing, malware | 2 | 2 | 4 medio | SSO con MFA e accesso condizionato; blocco di altre estensioni; scadenza sessioni `[DA DEFINIRE]` | 1 | 2 | 2 basso |
| R12 | **Esposizione dei dati reali nel browser** dopo il ripristino | Postazione di lavoro | 2 | 2 | 4 medio | Blocco delle estensioni non autorizzate; chiave non estraibile; postazioni gestite | 1 | 2 | 2 basso |
| R13 | **Mancata attuazione della cancellazione** (backup, copie presso il fornitore) | Backup; conversazioni su più account | 2 | 2 | 4 medio | Cancellazione crittografica; backup ≤ 35 giorni e key store 14 giorni; registro delle cancellazioni riapplicato dopo ogni ripristino (Allegato B); cancellazione delle chat | 1 | 2 | 2 basso |
| R14 | **Sospensione dell'account o blocco tecnico dell'estensione** da parte del fornitore | Termini del fornitore; sistemi anti-abuso | 2 | 2 | 4 medio | Prova tecnica e poi lettera di conferma ad Anthropic; *fail-closed*; piano di sospensione del servizio | 1 | 2 | 2 basso |
| R15 | **Dati personali nelle richieste di ricerca web o nelle preferenze del profilo** (non filtrati da Pseudomania) | Ricerca web attiva; campi del profilo | 3 | 2 | 6 medio | Regola d'uso (art. 5, nn. 7-8 Regolamento); formazione; informativa; verifica del sub-fornitore di ricerca; **misura nel pilota**: campione delle query di ricerca visibili nelle conversazioni (via tracce Langfuse pseudonimizzate, se l'estensione le acquisisce `[DA VERIFICARE con il team tecnico]`, o con revisione volontaria degli utenti pilota) per stimare la frequenza di dati sfuggiti; se rilevante, disattivazione della ricerca web | 2 | 2 | 4 medio |
| R16 | **Abuso o compromissione delle funzioni di custodia** (Custodi collusi, quota o supporto smarrito, account di custodia violato) | Fattore umano | 1 | 4 | 4 medio | Schema 2 di 3; Custodi distinti dagli amministratori; MFA divisa; postazione offline; verbali; registri in sola aggiunta; verifica annuale e ridistribuzione delle quote (Allegato C) | 1 | 3 | 3 basso |

**Variazioni della versione 0.3:** R3 scende da medio a **basso** (cifratura lato client, con i rischi
residui dichiarati); R7 diventa **mitigato** (memoria spenta); R4b gestito con l'osservabilità ibrida;
aggiunti R3b, R15 (ricerca web e profilo) e R16 (custodia).

**Rischi residui alti:** R10 resta **alto** (8). Se il RPD conferma la valutazione, il titolare adotta
misure ulteriori (es. esclusione degli uffici a rischio dalla fase pilota) oppure procede alla
**consultazione preventiva del Garante** (art. 36 GDPR).

# 5. Misure previste (art. 35, par. 7, lett. d) – mappa sul progetto tecnico

| Misura | Componente | Rischi |
|---|---|---|
| Estensione forzata, non disattivabile, *fail-closed* (letti solo dalla policy) | Chrome policy, `chrome.storage.managed` | R1, R5, R8 |
| Pseudonimizzazione testi e allegati, file e istruzioni dei Progetti | `/v1/pseudonymize`, `/v1/pseudonymize/file` | R1, R2, R6 |
| Blocco artt. 9-10 senza override | `blocked=true` | R10 |
| Istruzione fissa sui segnaposto; `unknownTags`; memoria spenta | `/v1/config`; console Team | R7 |
| Cifratura lato client del dizionario; chiave non estraibile; escrow con chiave pubblica di custodia | Estensione; `/v1/dictionary/entries`; `/v1/keys/escrow` | R3, R12 |
| Key store separato; rotazione 90 giorni; rotazione forzata | `postgres-keys`; `/v1/dictionary/rekey`; `rotateKey` | R3, R16 |
| Chiave privata di custodia offline, Shamir 2 di 3 | `tools/custodi/` | R3, R16 |
| Recupero progetti con chiave di dispositivo | `/v1/keys/device`, `/v1/keys/recovered` | R3b |
| Registro minimo senza testi con SHA-256; aggregati anonimi dopo 90 giorni | `audit_events`, `audit_daily` | R4, R4b |
| Tracce Langfuse brevi in progetto dedicato | Job di conservazione Langfuse | R4 |
| Account di custodia (Primary Owner) a doppio controllo | Console Team; Allegato C | R4b |
| Cancellazione crittografica; registro cancellazioni riapplicato dopo i ripristini; blocchi giudiziari | `deletion_log`, `judicial_holds`; Allegato B | R13 |
| Registri degli accessi amministratori e Custodi in sola aggiunta | `admin_log` con catena di hash | R4, R16 |
| SSO + accesso condizionato; proxy; MDM; blocco app desktop | Infrastruttura dell'Ente | R5, R11 |
| Funzioni disattivate su claude.ai (memoria, connettori, voce, Claude in Chrome, condivisione, feedback); ricerca web attiva con regola d'uso | Console Team; Regolamento | R5, R6, R15 |
| Regolamento, informativa, formazione | Governance | R2, R9, R10, R15 |
| Test periodici di rilevamento e dell'interfaccia | Processo `[DA DEFINIRE]` | R1, R8 |

# 6. Verifiche sul fornitore (Anthropic)

Dettaglio in `verifiche-fase0.md`.

| Aspetto | Stato |
|---|---|
| Termini applicabili al piano Team | Commercial Terms (versione consultata: 17/06/2025); entità per il SEE: **Anthropic Ireland, Limited** |
| DPA art. 28 | Incorporato; notifica violazioni entro 48 ore; audit tramite report e audit del cliente; cancellazione entro 30 giorni dalla cessazione |
| Addestramento | Vietato sui contenuti del cliente; eccezione feedback → disattivati |
| Log di audit, Compliance API, conservazione personalizzata | Non disponibili sul piano Team; conservazione illimitata per default |
| Esportazione dati dell'organizzazione | Disponibile al Primary Owner, comprende le conversazioni di tutti i membri → account di custodia |
| Memoria | Spenta dall'Ente |
| Ricerca web | Attiva; sub-fornitore di ricerca da verificare |
| Sub-responsabili | Fonte secondaria; ufficiale da allegare |
| Trasferimenti | SCC; DPF non menzionato → TIA |
| Qualificazione ACN | Nessuna evidenza pubblica; catalogo da consultare dall'Italia `[DA VERIFICARE]` |
| Estensioni del browser | Non trattate nei termini; **lettera di conferma dopo la prova tecnica** (R14) |
| AI Act | L'Ente è *deployer* di un modello per finalità generali; usi consentiti non ad alto rischio `[DA VERIFICARE con il RPD]`; art. 4 (alfabetizzazione); art. 50 per testi pubblicati `[DA VERIFICARE]` |

# 7. Parere del RPD/DPO (art. 35, par. 2, GDPR)

`[DA COMPILARE A CURA DEL RPD]`

- Data:
- Parere: favorevole / favorevole con prescrizioni / non favorevole
- Prescrizioni:
- Necessità di consultazione preventiva (art. 36): sì / no – motivazione:

# 8. Opinione degli interessati e dei loro rappresentanti (art. 35, par. 9, GDPR)

`[DA COMPILARE]`

- Consultazione delle rappresentanze sindacali (anche nell'ambito della procedura ex art. 4 L. 300/1970,
  in particolare su registro minimo di 90 giorni, esportazione tramite account di custodia, Custodi):
  data, esito, osservazioni recepite.
- Consultazione degli utenti della fase pilota: data, esito.
- Eventuali motivi per non raccogliere l'opinione di categorie di interessati (es. cittadini):

# 9. Piano d'azione e riesame

| Azione | Responsabile | Scadenza |
|---|---|---|
| Accordo sindacale o autorizzazione INL | `[DA DEFINIRE]` | prima del pilota |
| Designazione dei Custodi, generazione offline della chiave di custodia, prova delle procedure (Allegati B e C) | Titolare, Custodi | prima del pilota |
| Impostazioni console Team (memoria spenta, feedback spenti, account di custodia unico Primary Owner) | Amministratori, Custodi | prima del pilota |
| TIA per il trasferimento basato su SCC; elenco ufficiale dei sub-responsabili | RPD | prima del pilota |
| Test di rilevamento su corpus dell'Ente (R1) | Team tecnico | prima e durante il pilota |
| Misura delle query di ricerca web con dati sfuggiti (R15) | Team tecnico, RPD | durante il pilota |
| Prova tecnica e poi lettera ad Anthropic (`verifiche-fase0.md` § 5) | RTD | dopo la prova tecnica |
| Riesame della DPIA a fine pilota e prima di ogni nuova fase | Titolare, RPD | fine pilota |

# 10. Approvazione

| Ruolo | Nome | Data | Firma |
|---|---|---|---|
| Titolare (legale rappresentante o delegato) | `[DA DEFINIRE]` | | |
| Dirigente responsabile | `[DA DEFINIRE]` | | |
| RPD/DPO (presa visione del parere) | `[DA DEFINIRE]` | | |

---

# Riferimenti

Fonti consultate (aperte il 30-31/10/2026); le fonti delle verifiche su fornitore e licenze sono in
`verifiche-fase0.md`:

- Garante, provv. n. 467 dell'11/10/2018 (doc. web 9058979): https://garanteprivacy.it/garante/doc.jsp?ID=9058979 –
  Allegato 1 consultato in:
  https://www.dirittobancario.it/wp-content/uploads/sites/default/files/allegati/delibera_garante_per_la_protezione_dei_dati_personali_11_ottobre_2018_n._467.pdf
- Garante, documento di indirizzo 6/6/2024, metadati della posta elettronica (doc. web 10026277, provv. n. 364):
  https://dirittobancario.it/wp-content/uploads/2024/06/Provvedimento-Garante-Privacy-6-giugno-2024.pdf
- Garante, provv. Regione Lombardia (doc. web 10134221), sintesi:
  https://www.cybersecurity360.it/news/sanzione-privacy-a-regione-lombardia-50mila-euro-per-controllo-illecito-di-email-e-internet/
  e https://privacymatters.dlapiper.com/2025/06/italy-the-garante-issues-first-gdpr-fine-over-employees-email-metadata-privacy-breach/
  (data del provvedimento indicata dal progetto: 29/4/2025 `[DA VERIFICARE sul doc. web]`)
- Garante, provv. 27/11/2008 amministratori di sistema (sintesi):
  https://www.filodiritto.com/le-nuove-prescrizioni-privacy-i-titolari-del-trattamento-relativamente-alle-attribuzioni-delle-funzioni-di-amministratore-di-sistema
- Garante, Linee guida posta elettronica e Internet 1/3/2007 (doc. web 1387522): citate nel documento del 6/6/2024 (non aperte direttamente)
- ACN, Linee guida banche dati, nov. 2024: https://cybersecitalia.it/wp-content/uploads/2024/11/Linee-guida-banche-dati.pdf
  `[DA VERIFICARE: copia sul sito ufficiale ACN]`
- NIST SP 800-88 Rev. 2: https://csrc.nist.gov/pubs/sp/800/88/r2/final ; FAQ:
  https://csrc.nist.gov/files/pubs/sp/800/88/r2/final/docs/sp800-88r2-faq.pdf
- EDPB, CEF 2025 diritto alla cancellazione (18/02/2026):
  https://www.edpb.europa.eu/news/edpb-identifies-challenges-hindering-the-full-implementation-of-the-right-to-erasure_en
- EDPB, Linee guida 3/2019 sui dispositivi video: https://www.edpb.europa.eu/sites/default/files/files/file1/edpb_guidelines_201903_video_devices_en.pdf
  (non aperto: errore del sito) `[DA VERIFICARE]`
- AgID, Linee guida formazione, gestione e conservazione documenti informatici (determinazione 371/2021
  secondo fonti secondarie) `[DA VERIFICARE]`
- EDPB, Linee guida 01/2025 pseudonimizzazione:
  https://edpb.europa.eu/news/news/2025/edpb-adopts-pseudonymisation-guidelines-and-paves-way-improve-cooperation_en
- CGUE, C-413/23 P (sintesi): https://www.cliffordchance.com/insights/resources/blogs/talking-tech/en/articles/2025/09/pseudonymized-data-after-edps-v-srb.html
- Anthropic, DPA: https://www.anthropic.com/legal/data-processing-addendum ; Commercial Terms:
  https://www.anthropic.com/legal/commercial-terms
- Agenda Digitale, art. 14 L. 132/2025:
  https://www.agendadigitale.eu/cittadinanza-digitale/legge-132-2025-e-uso-dellai-nella-nella-pubblica-amministrazione-la-guida/
- Assolombarda, art. 4 L. 300/1970:
  https://new.assolombarda.it/servizi/diritto-di-impresa/documenti/art-4-legge-300-del-1970
- QuiFinanza, Regolamento unico ACN: https://quifinanza.it/innovazione/regolamento-unico-infrastrutture-servizi-cloud/832868/

Non aperti, da verificare sul testo ufficiale: WP248 rev.01, decisione (UE) 2023/1745, art. 51 d.lgs.
165/2001, Allegato III e artt. 26 e 50 del Reg. (UE) 2024/1689.
