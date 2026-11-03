---
title: "Checklist degli adempimenti prima dell'avvio del pilota – Pseudomania Enterprise edition"
subtitle: "BOZZA – da verificare con il RPD/DPO"
lang: it-IT
---

> **BOZZA 0.3 del 31/10/2026** (recepisce DECISIONI.md del 31/10/2026 e `verifiche-fase0.md`).
> Ogni voce va chiusa (con estremi dell'atto o evidenza) **prima** dell'abilitazione dei 6 utenti
> pilota, salvo la n. 20 (dopo la prova tecnica). La Personal edition non richiede questi adempimenti
> da parte dell'Ente (non è un suo trattamento); per i singoli adottanti v. `policy-light.md`.

| # | Adempimento | Riferimento | Responsabile | Stato / evidenza |
|---|---|---|---|---|
| 1 | **DPIA** completata, con parere del RPD; se resta un rischio residuo alto (R10), consultazione preventiva del Garante | Artt. 35-36 GDPR; provv. Garante n. 467/2018, All. 1, nn. 5 e 7 | Titolare, RPD | ☐ |
| 2 | **Registro dei trattamenti** aggiornato (destinatari incl. sub-fornitore di ricerca web; trasferimenti; durate dell'art. 11 del Regolamento; misure) | Art. 30 GDPR | Titolare | ☐ |
| 3 | **Accordo art. 28 con Anthropic**: Commercial Terms e DPA vigenti, entità contraente (Anthropic Ireland, Limited – verificato), sub-responsabili, audit, notifica violazioni (48 ore), cancellazione a fine contratto | Art. 28 GDPR | Titolare, ufficio contratti | ☐ |
| 4 | **Trasferimenti extra-UE**: SCC (moduli 2/3); DPF non menzionato da Anthropic → **TIA** documentata; elenco ufficiale dei sub-responsabili allegato alla DPIA | Artt. 44-46 GDPR | Titolare, RPD | ☐ |
| 5 | **Controllo a distanza**: accordo sindacale o autorizzazione INL che copra registro minimo (90 giorni), tracce Langfuse, esportazione tramite account di custodia e procedura dei Custodi | Art. 4, cc. 1 e 3, L. 300/1970; art. 114 Codice privacy; Garante 6/6/2024 (doc. web 10026277) e doc. web 10134221 | Datore di lavoro, ufficio personale | ☐ |
| 6 | **Informativa ai dipendenti** consegnata e documentata (incl. ricerca web e preferenze del profilo non filtrate) | Art. 13 GDPR; All. A al Regolamento | Titolare | ☐ |
| 7 | **Designazioni**: persone autorizzate; amministratori di sistema (verifica annuale); **almeno 3 Custodi** distinti dagli amministratori; responsabile esterno per Pseudomania | Art. 29 GDPR; art. 2-quaterdecies Codice privacy; provv. Garante 27/11/2008 | Titolare | ☐ |
| 8 | **Chiave di custodia**: generazione offline con `tools/custodi/`, quote 2 di 3 consegnate ai Custodi, verifica di ricomposizione, chiave pubblica configurata sul server; verbale | All. C al Regolamento | Custodi, amministratori | ☐ |
| 9 | **Prova delle procedure**: cancellazione e ripristino da backup con riapplicazione del registro delle cancellazioni; recupero di un progetto; esportazione di prova con account di custodia, estrazione parziale e distruzione; verbali | All. B e C al Regolamento | Amministratori, Custodi, RPD | ☐ |
| 10 | **Console Claude Team**: memoria **spenta**; feedback (*Rate chats*) spenti; connettori, richieste connettori, Claude in Chrome, voce, condivisione progetti spenti; auto-esportazione dei membri spenta; **ricerca web attiva**; account di custodia unico Primary Owner (password e MFA divise tra due Custodi) | DPIA §2.1, R4b, R6, R7, R15 | Amministratori, Custodi | ☐ |
| 11 | **Configurazione tecnica verificata**: estensione forzata e non disattivabile; *fail-closed*; key store separato con backup a 14 giorni; backup DB ≤ 35 giorni con copia offline; job di conservazione (dizionari, registro, Langfuse 30 giorni); registri in sola aggiunta; app desktop e Android bloccate; SSO con accesso condizionato; proxy limitato a Chrome gestito | SPEC.md; DECISIONI.md; DPIA §5 | Amministratori di sistema | ☐ |
| 12 | **Langfuse condiviso**: progetto e chiavi dedicate a Pseudomania; accesso al progetto limitato agli amministratori designati | DPIA §2.6 | Amministratori | ☐ |
| 13 | **Qualificazione ACN** del servizio Claude Team: consultare il catalogo dall'Italia e salvarne l'esito; in mancanza, valutazione motivata di RTD e RPD | Regolamento unico ACN (d.d. n. 21007/24) `[DA VERIFICARE]` | RTD | ☐ |
| 14 | **L. 132/2025**: uso strumentale e di supporto, responsabilità della persona, conoscibilità e tracciabilità; misure organizzative e formative | Art. 14 L. 132/2025; art. 11 per il lavoro `[DA VERIFICARE]` | Dirigente, RTD | ☐ |
| 15 | **Linee guida AgID** sull'IA nella PA: verifica dello stato e allineamento | AgID `[DA VERIFICARE]` | RTD | ☐ |
| 16 | **Formazione** di utenti pilota e Custodi documentata (alfabetizzazione IA, protezione dati, ricerca web, uso di Pseudomania, procedure di custodia) | Art. 4 Reg. (UE) 2024/1689 | Dirigente, formazione | ☐ |
| 17 | **AI Act – classificazione degli usi**: usi consentiti non ad alto rischio; trasparenza per testi pubblicati | Artt. 6, 26, 50 Reg. (UE) 2024/1689 `[DA VERIFICARE]` | RPD, RTD | ☐ |
| 18 | **CAD**: valutazione comparativa delle soluzioni; pubblicazione del codice di Pseudomania (AGPL-3.0) per il riuso | Artt. 68 e 69 d.lgs. 82/2005 | RTD | ☐ |
| 19 | **Regolamento d'uso** (con Allegati A, B, C) adottato e pubblicato internamente; sintesi sul sito istituzionale | Regolamento (bozza) | Titolare | ☐ |
| 20 | **Prova tecnica** con il servizio reale e poi **lettera ad Anthropic** (estensione, ACN, DPF, sub-responsabili, conservazione, export, ricerca web); risposta archiviata | `verifiche-fase0.md` § 5 | RTD, ufficio contratti | ☐ dopo la prova |
| 21 | **Test di rilevamento** su corpus dell'Ente con soglia di accettazione `[DA DEFINIRE]`; piano di misura delle query di ricerca web con dati sfuggiti (R15) | DPIA R1, R15 | Team tecnico | ☐ |
| 22 | **Procedura data breach** aggiornata con gli scenari Pseudomania (incl. compromissione di quote o account di custodia) | Artt. 33-34 GDPR | RPD | ☐ |
| 23 | **Licenze**: NOTICE Apache del DFKI conservato, nessun uso di nome/logo DFKI; attribuzione CC-BY-4.0 Ai4Privacy e MIT dei pesi Rizzo-PII; sorgente pubblicato per modifiche a componenti AGPL | `verifiche-fase0.md` § 4 | Team tecnico | ☐ |

---

# Riferimenti

- Verifiche di fase 0: `verifiche-fase0.md` (fonti su fornitore e licenze); DPIA, § 2.5 (fonti sulle durate)
- Garante privacy, provv. n. 467/2018: https://garanteprivacy.it/garante/doc.jsp?ID=9058979
- Garante, documento 6/6/2024 (doc. web 10026277):
  https://dirittobancario.it/wp-content/uploads/2024/06/Provvedimento-Garante-Privacy-6-giugno-2024.pdf
- Garante, Regione Lombardia (doc. web 10134221), sintesi:
  https://privacymatters.dlapiper.com/2025/06/italy-the-garante-issues-first-gdpr-fine-over-employees-email-metadata-privacy-breach/
- Anthropic, DPA: https://www.anthropic.com/legal/data-processing-addendum
- Assolombarda, art. 4 L. 300/1970:
  https://new.assolombarda.it/servizi/diritto-di-impresa/documenti/art-4-legge-300-del-1970
- Normattiva, L. 132/2025: https://www.normattiva.it/eli/id/2025/09/25/25G00143/CONSOLIDATED
- AgID, Intelligenza artificiale: https://www.agid.gov.it/it/ambiti-intervento/intelligenza-artificiale
- QuiFinanza, Regolamento unico ACN: https://quifinanza.it/innovazione/regolamento-unico-infrastrutture-servizi-cloud/832868/
- art. 68 CAD: https://miolegale.it/codici/codice-amministrazione-digitale/art-68/
