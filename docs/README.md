# Documentazione di Pseudomania

Pseudomania pseudonimizza ciò che si invia a claude.ai e ripristina i dati reali nelle risposte.
Codice: AGPL-3.0-or-later. Sito: https://pseudomania.statocritico.it

Due edizioni:

- **Server edition** – per gli enti: estensione Chrome imposta da policy + server su VM
  interna (dizionario cifrato nel browser, key store separato, custodi) + Langfuse;
- **Personal edition** – per il singolo professionista: solo estensione + app desktop di
  Rizzo-PII sul PC. Nessun server, nessun Docker.

Contratto tecnico: [`../SPEC.md`](../SPEC.md); decisioni vincolanti (prevalgono):
[`../DECISIONI.md`](../DECISIONI.md).

## Server edition

| Documento | Per chi | Contenuto |
|---|---|---|
| [installazione-ente.md](installazione-ente.md) | amministratori di sistema | dalla VM Ubuntu 24.04 / Debian 12 al servizio in esercizio: architettura, cosa protegge la cifratura, dimensionamento, DNS, certificati, Docker, build anche offline, chiave pubblica di custodia, segreti, OpenBao con i custodi, Langfuse dedicato o condiviso (progetto dedicato, pulizia delle trace), firewall, tabella di conservazione, backup del DB applicativo e del key store, ripristino con riapplicazione delle cancellazioni, blocchi giudiziari, rotazione forzata, aggiornamenti, log, problemi |
| [custodi.md](custodi.md) | custodi, DPO, amministratori | strumento offline `tools/custodi/`: generazione della chiave (2 di 3), verifica e ridistribuzione, recupero dopo un cambio PC (solo progetti), richieste dell'autorità giudiziaria, cancellazione crittografica, account di servizio Primary Owner, verbali |
| [configurazione.md](configurazione.md) | amministratori di Claude Team, identità, postazioni, rete | console di Claude Team (SSO, memoria spenta, ricerca web attiva, feedback spento, Primary Owner a doppia custodia…), identity provider, policy di Chrome, blocco di Claude Desktop e dell'app Android, proxy |
| [verifica-pilota.md](verifica-pilota.md) | amministratori, sicurezza, DPO | prove da superare prima del go-live, incluse cifratura, rotazione, cambio PC e recupero, cancellazione crittografica, backup e ripristino |

Ordine consigliato: installazione-ente (con custodi §2 prima del primo avvio) →
configurazione → verifica-pilota.

## Personal edition

| Documento | Contenuto |
|---|---|
| [installazione-personale.md](installazione-personale.md) | app desktop di Rizzo-PII, estensione, uso, file, dati locali, impostazioni di Claude per i piani Pro/Max, problemi, ipotesi del fork di Rizzo-PII |

## Per chi sviluppa

| Documento | Contenuto |
|---|---|
| [PROBLEMI-RILEVATI.md](PROBLEMI-RILEVATI.md) | difetti e incongruenze aperti nei componenti, problemi risolti, punti esterni non verificati |
| [`../extension/README.md`](../extension/README.md) | estensione: funzionamento, test, limiti noti |
| [`../deploy/VERSIONS.md`](../deploy/VERSIONS.md) | versioni e licenze dei componenti |
| [`../governance/`](../governance/) | policy d'uso (strutturata e light), DPIA, checklist degli adempimenti |

## Convenzioni

- Nomi visibili: **Pseudomania**; identificatori tecnici (servizi, database, cartelle, immagini)
  restano `pseudogate`.
- Esempi: `pseudogate.ente.local`, `langfuse.ente.local`, `idp.ente.local`, `ID_ESTENSIONE`.
- **[DA VERIFICARE]**: non confermato su una fonte ufficiale o non provato.
- La responsabilità legale dell'adozione e dell'uso resta interamente di chi adotta il sistema.
