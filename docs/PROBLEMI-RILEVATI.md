# Problemi e incongruenze rilevati

Aggiornato il 5/11/2026 (esiti della prima prova reale della Personal edition, 4/11/2026; prima
revisione: 31/10/2026, dopo DECISIONI.md e la riscrittura di SPEC.md). Confronto tra SPEC.md/DECISIONI.md e i file di
`deploy/`, `server/`, `tools/custodi/`, `extension/`. **Nessun file fuori da `docs/` è stato
modificato**: dove serve la documentazione indica un rimedio operativo.

Gravità: **A** = blocca o rompe una funzione; **M** = rischio o lavoro manuale; **B** = minore.

## Aperti

| # | Gravità | Dove | Problema | Effetto | Rimedio proposto | Nei docs |
|---|---|---|---|---|---|---|
| 4 | M | `server/pseudogate/retention.py` (`purge_langfuse`) | Usa `GET /api/public/traces` e `DELETE /api/public/traces` (`traceIds`). Non provato contro un server Langfuse 4.72 reale. | Se l'endpoint differisce la conservazione delle trace (30/7 giorni) non è applicata. | Prova su Langfuse reale; registrare l'esito del job nel registro amministrativo. | installazione-ente.md §14.3; verifica-pilota.md G8d |
| 6 | M | Rischio residuo (DECISIONI.md) | Con OpenBao sbloccato, root sulla VM può usare l'AppRole dell'api per calcolare HMAC (verificare se un valore indovinato è nel dizionario) e intercettare i testi delle richieste future. Non può decifrare i dizionari passati. | Dichiarato; non è un difetto del codice. | DPIA, accesso root limitato e registrato. | installazione-ente.md §2 |
| 12 | B | `deploy/VERSIONS.md` | Tag delle immagini non verificati sui registri. | Possibile errore al primo `pull`. | Verificare al primo pull. | — |
| 13 | B | Podman | Non provato (contesto Git, reti interne, healthcheck, `chown`). | Possibili errori. | Prova su VM. | installazione-ente.md §6.2 |
| 14 | B | `.env.example` / README estensione | `OIDC_AUDIENCE=pseudogate` con client di esempio `pseudogate-extension`: con Keycloak serve un mapper di audience. | 401 se non configurato. | Citare il mapper nel README. | configurazione.md §B.1.a |
| 15 | M | `deploy/` (immagine `rizzo-pii`) | Lo stack costruisce Rizzo-PII 1.5.0 (`RIZZO_MODEL_REVISION=v1.5.0`, commit `9057eef`); la Personal edition è stata provata con l'app 2.0. | Possibili differenze di rilevamento tra le edizioni. | Aggiornare build e modello alla 2.0 e ripetere il collaudo. | installazione-ente.md §7 |
| 16 | M | `extension/manifest.json` | L'host del server non è in `host_permissions` (solo in `optional_host_permissions`, che nella Server edition non vengono richiesti all'utente). | Le chiamate al server possono fallire. | Aggiungere l'host prima di impacchettare l'estensione per l'ente (`extension/README.md` §2.2). | — |
| 17 | B | Personal edition, PDF scaricati da Claude | L'app Rizzo-PII 2.0 non offre il ripristino dei PDF: l'estensione genera un PDF di solo testo. | Impaginazione persa nei PDF scaricati. | Proposta a Rizzo-PII di `POST /restore/pdf` (5/11/2026); l'estensione la usa già se presente. | personal-edition (sito) |

## Prova reale della Personal edition (4/11/2026)

Prova su un PC Windows con l'app desktop Rizzo-PII 2.0.0 e claude.ai, con i documenti di
`collaudo/prova-personal/` (tutti i 24 tag di Rizzo-PII). Correzioni nelle versioni 0.1.1-0.1.13.

| # | Stato | Esito |
|---|---|---|
| 5 | **Risolto** | L'app desktop di Rizzo-PII 2.0 accetta le chiamate del service worker dell'estensione: nessun fork necessario. |
| — | **Corretto** | Falsi «Invio bloccato … file «file»» sui dati tecnici di claude.ai (telemetria): passano, i documenti restano controllati. |
| — | **Corretto** | Allegati elaborati ma non consegnati: la graffetta apre ora la finestra «Carica o aggiungi file» e il trascinamento una zona di rilascio temporanea; i file pseudonimizzati vanno al campo file della casella di scrittura. Trascinamento: la finestra «Trascina i file qui» si chiude da sola. |
| — | **Corretto** | Timeout di Rizzo-PII diagnosticato come blocco CORS; «Rizzo-PII» mascherato come nome di persona (ora tra i termini consentiti). |
| — | **Corretto** | Errore «Extension context invalidated» dopo l'aggiornamento dell'estensione: ora avviso di ricaricare la pagina. |
| — | **Aggiunto** | Ripristino dei PDF scaricati (vedi n. 17), indicatore di attesa, registro delle attività nelle impostazioni. |
| — | **OK** | Testi con tutti i tag, termini consentiti e omonimie, blocco di dati sanitari e giudiziari, DOCX scaricato ripristinato. |

Test automatici eseguiti per la prima volta il 4/11/2026 in un ambiente Linux: server 66 superati (4 saltati:
richiedono PostgreSQL e Rizzo-PII reali), strumento dei custodi 12/12, estensione (unit) 50/50.

## Correzioni dell'agente server (31/10/2026, terza revisione)

| # | Stato | Correzione |
|---|---|---|
| 1 | **Risolto** | `PUT` (e `DELETE`) in `allow_methods` del CORS; test della preflight `PUT /v1/dictionary/rekey`. L'host del server in `host_permissions` resta compito dell'estensione. |
| 2 | **Risolto** | `genera-segreti.sh` crea `secrets/api/admin-api-token` (48 caratteri) e assegna `secrets/api`, `registro/`, `esportazioni/` all'uid 10001 (token 400). |
| 3 | **Risolto** | Sito Langfuse di Caddy facoltativo: `CADDY_LANGFUSE_SITE=on|off` (file `caddy/langfuse-on.caddy` / `langfuse-off.caddy`); con `off` `LANGFUSE_DOMAIN` e i certificati Langfuse non servono. `EXTRA_CA_FILE` (al posto di `OIDC_CA_FILE`, ancora accettato) aggiunge le CA interne alle pubbliche per **tutte** le chiamate HTTPS dell'api (OIDC, SDK Langfuse, job di pulizia: bundle combinato in `SSL_CERT_FILE`/`REQUESTS_CA_BUNDLE`); proxy `OUTBOUND_HTTPS_PROXY` (vale anche `OIDC_HTTPS_PROXY`) e `OUTBOUND_NO_PROXY` per gli host da raggiungere direttamente (es. Langfuse condiviso). |
| 4 | **Corretto, da provare** | Verificato sul sorgente di Langfuse (ramo main, 31/10/2026): in v4 la scrittura predefinita è `events_only` e `GET /api/public/traces` risponde 404. Il job ora elenca le trace con `GET /api/public/v2/observations?toStartTime=…&fields=core&limit=1000` (cursore), con ripiego su `GET /api/public/traces` per i server v3/legacy, e cancella con `DELETE /api/public/traces` `{"traceIds":[…]}` (≤ 1000 per richiesta, asincrono lato Langfuse). Resta da provare su un Langfuse 4.72 reale. |
| 7 | **Risolto** | `custodia esporta-*`: `--out -` scrive su stdout (`docker compose exec -T api … --out - > file`); un nome semplice va in `/var/lib/pseudogate/esportazioni` = `deploy/esportazioni/` (scrivibile, esclusa dai backup, da svuotare dopo la cerimonia). |
| 8 | **Risolto** | `backup.sh` passa `--operatore "backup automatico"`. |
| 9 | **Risolto (nessuna modifica)** | OpenBao ha rimosso mlock (CHANGELOG 2.0, GH-363): `disable_mlock` è obsoleto e `IPC_LOCK` non serve (nota in `openbao.hcl`). |
| 10 | **Risolto** | `.pyc` rimossi; `.gitignore` nella radice (`__pycache__/`, `*.pyc`, cache, basi dati di sviluppo). |
| 11 | **Risolto** | Cambio della chiave di custodia: `rotateKey` diventa `true` per chi ha l'escrow con un `escrowKeyId` diverso da quello attuale (migrazione automatica alla rotazione); `escrow_key_mismatch` → l'estensione rilegge `/v1/config`. Nota in SPEC.md (conservare le quote vecchie finché esistono escrow con la vecchia chiave). |

Messaggio di blocco (categorie particolari): ora rimanda al pulsante «Segnala blocco errato» del pannello laterale.

## Risolti rispetto alla revisione precedente

| Problema precedente | Stato |
|---|---|
| n. 1 CORS senza `PUT`; n. 2 `secrets/api` e token amministrativo; n. 3 Langfuse condiviso (Caddy, CA, proxy); n. 7 esportazioni nel container; n. 8 `backup.sh` senza operatore | risolti dall'agente server (31/10/2026): `PUT` nei metodi CORS, token creato da `genera-segreti.sh`, `CADDY_LANGFUSE_SITE`, `EXTRA_CA_FILE`, `OUTBOUND_HTTPS_PROXY`/`OUTBOUND_NO_PROXY`, `--out -` e `deploy/esportazioni/`, `--operatore "backup automatico"`. Righe lasciate sopra per tracciabilità; da riverificare in prova |
| Ripristino del DB con `psql -U postgres` (tabelle di proprietà sbagliata) | risolto: `backup.sh` indica `-U pseudogate_app` e il rimedio `REASSIGN OWNED` |
| Caddyfile non pubblicava `/extension/` | risolto (`handle_path /extension/*`, volume `deploy/estensione`) |
| `manifest.json` senza `key` | risolto (ID `mbibgkkkoffbbpgbhelbmdgpjdebjlfd`, script `extension-id.js`) |
| CA interna e proxy verso l'IdP | risolti (`OIDC_CA_FILE`, `OIDC_HTTPS_PROXY`) |
| Quote di OpenBao visibili a chi inizializza | risolto con modalità PGP (`OPENBAO_PGP_KEYS`), revoca del token root |
| `/v1/health` non riportava OpenBao | risolto (`keys`, `status: degraded`) |
| Porta 80 pubblicata | risolto (solo 443) |
| AppRole e certificati assenti dal backup | risolto (`segreti-<data>.tar`) |
| Password iniziale di Langfuse obbligatoria per sempre | risolto (facoltativa dopo il primo avvio) |
| SPEC: Langfuse v3, `oidcTokenType`, risposta di `/v1/source` | risolti nella nuova SPEC |
| Cartella `deploy/config/` non documentata | risolto (`.env.example`, `ALLOWLIST_FILE`) |
| Modalità personale con server (`deploy/personale`, `LOCAL_TOKEN`, ps1) | superata: Personal edition senza server |
| Root poteva decifrare il dizionario tramite OpenBao | superato: cifratura nel browser, OpenBao tiene solo la chiave HMAC (resta il rischio n. 6) |

## Punti esterni non verificati

Le pagine di support.claude.com non erano consultabili dall'ambiente di lavoro. Restano
[DA VERIFICARE] in [configurazione.md](configurazione.md) e [custodi.md](custodi.md):

- console Claude Team: percorsi ed etichette di Require SSO, connettori, Claude in Chrome, voce,
  condivisione dei progetti, **memoria**, **ricerca web**, **feedback/valutazioni** (disattivabilità
  sul piano Team), trasferimento del ruolo di **Primary Owner**, **esportazione dei dati** (percorso
  e formato sul piano Team), restrizioni per tenant, lista di IP;
- sub-fornitore del servizio di ricerca web di Anthropic;
- domini completi di claude.ai web per il proxy;
- Entra: piattaforma SPA per il redirect `chromiumapp.org`, durata dei refresh token;
- Claude Desktop (percorsi/pacchetto Windows, bundle ID macOS), ID di «Claude in Chrome»;
- Langfuse: ruoli per singolo progetto nell'edizione gratuita, endpoint di cancellazione delle
  trace, cambio password in v4;
- app desktop di Rizzo-PII: pacchetti e installazione.

Verificato: pacchetto Android `com.anthropic.claude`.
