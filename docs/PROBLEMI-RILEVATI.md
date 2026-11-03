# Problemi e incongruenze rilevati

Aggiornato il 31/10/2026 (seconda revisione della documentazione, dopo DECISIONI.md del
31/10/2026 e la riscrittura di SPEC.md). Confronto tra SPEC.md/DECISIONI.md e i file di
`deploy/`, `server/`, `tools/custodi/`, `extension/`. **Nessun file fuori da `docs/` è stato
modificato**: dove serve la documentazione indica un rimedio operativo.

Gravità: **A** = blocca o rompe una funzione; **M** = rischio o lavoro manuale; **B** = minore.

## Aperti

| # | Gravità | Dove | Problema | Effetto | Rimedio proposto | Nei docs |
|---|---|---|---|---|---|---|
| 1 | **A** | `server/pseudogate/main.py` (riga ~224, `CORSMiddleware`) | `allow_methods=["GET","POST","DELETE","OPTIONS"]` non include **PUT**, usato da `PUT /v1/dictionary/rekey`. Il manifest non contiene l'host del server in `host_permissions` (solo `optional_host_permissions`, che in Enterprise non vengono richiesti all'utente). | La preflight CORS del `PUT` fallisce: la **rotazione delle chiavi** ogni 90 giorni (e quella forzata) non si completa, gli escrow vecchi non vengono distrutti. | Aggiungere `PUT` ad `allow_methods`; in alternativa (o in aggiunta) inserire l'host del server in `host_permissions` prima di impacchettare. Lo segnala anche `extension/README.md` §2.2. | configurazione.md §C.4; verifica-pilota.md J6 |
| 2 | M | `deploy/scripts/genera-segreti.sh` + compose (`./secrets/api` montata in `/run/secrets/pseudogate`) | `secrets/api` viene creata con `umask 077` dentro `secrets/` (700, root) e non viene assegnata all'uid 10001; nessuno script crea `admin-api-token`. | Se si attiva `ADMIN_API_TOKEN` l'api non riesce a leggerlo; `POST /v1/keys/recovered` resta disabilitato. | Creare il token e fare `chown 10001` in `genera-segreti.sh` (o documentare); è comunque facoltativo (c'è `custodia importa-recuperate`). | installazione-ente.md §10; custodi.md §4.4 |
| 3 | M | Langfuse condiviso (`docker-compose.yml`, `Caddyfile`) | Senza profilo `langfuse`, Caddy richiede comunque `LANGFUSE_DOMAIN` e i certificati `langfuse.*` e fa da proxy verso un `langfuse-web` inesistente. `OIDC_CA_FILE` vale solo per le chiamate OIDC (`auth.py`), non per l'SDK Langfuse né per il job di pulizia; `HTTPS_PROXY` (da `OIDC_HTTPS_PROXY`) vale per tutto il processo e `NO_PROXY` non comprende l'host di un Langfuse condiviso. | Con un Langfuse condiviso su CA interna o raggiungibile solo direttamente le trace e la pulizia possono fallire; configurazione di Caddy inutile. | Rendere facoltativo il blocco Langfuse del Caddyfile; variabile CA generale (es. `SSL_CERT_FILE`) e `NO_PROXY` configurabile. | installazione-ente.md §14.2 |
| 4 | M | `server/pseudogate/retention.py` (`purge_langfuse`) | Usa `GET /api/public/traces` e `DELETE /api/public/traces` (`traceIds`). Non provato contro un server Langfuse 4.72 reale. | Se l'endpoint differisce la conservazione delle trace (30/7 giorni) non è applicata. | Prova su Langfuse reale; registrare l'esito del job nel registro amministrativo. | installazione-ente.md §14.3; verifica-pilota.md G8d |
| 5 | M | Personal edition (Rizzo-PII desktop) | Nessuna istruzione verificata per installare l'app desktop di Rizzo-PII (pacchetti, avvio automatico, cache del modello); chiamate dal service worker senza CORS provate solo con un Rizzo-PII simulato. | L'installazione personale può fallire o richiedere il fork di Rizzo-PII previsto in DECISIONI.md. | Prova con l'app reale; se serve, fork con `Access-Control-Allow-Origin: chrome-extension://<ID>`. | installazione-personale.md §2, §13 |
| 6 | M | Rischio residuo (DECISIONI.md) | Con OpenBao sbloccato, root sulla VM può usare l'AppRole dell'api per calcolare HMAC (verificare se un valore indovinato è nel dizionario) e intercettare i testi delle richieste future. Non può decifrare i dizionari passati. | Dichiarato; non è un difetto del codice. | DPIA, accesso root limitato e registrato. | installazione-ente.md §2 |
| 7 | B | `server/pseudogate/__main__.py` (`custodia esporta-*`) | `--out` scrive nel filesystem del container, che è in sola lettura tranne `/tmp` (tmpfs) e `/var/lib/pseudogate/registro`; `docker compose cp` non legge i tmpfs. | Lavoro manuale per estrarre i file (o rischio di lasciarli in `deploy/registro/`, che finisce nei backup). | Supportare `--out -` (stdout). | custodi.md §4.2, §5 (uso di `cat`) |
| 8 | B | `deploy/scripts/backup.sh` | Chiama `cancellazioni esporta` senza `--operatore`: avviso «operatore non indicato» e voce `admin_log` con operatore «non indicato». | Registro amministrativo meno chiaro. | Passare `--operatore backup`. | — |
| 9 | B | `deploy/openbao/config/openbao.hcl` | Nessun `disable_mlock`; il container non ha `IPC_LOCK`. [DA VERIFICARE] se OpenBao 2.7 con raft richiede l'una o l'altra. | Possibile mancato avvio di `openbao`. | Prova di avvio; se serve `disable_mlock = true`. | — |
| 10 | B | `tools/custodi/__pycache__/` | File `.pyc` presenti nel repository. | Rumore; possibile disallineamento con il sorgente. | Rimuoverli e aggiungere `__pycache__/` a `.gitignore`. | — |
| 11 | B | Sostituzione della chiave di custodia | Non è documentato (né provato) il comportamento durante la transizione: escrow di chiavi utente ancora legati alla vecchia `escrowKeyId`, errore `escrow_key_mismatch` per estensioni con config in cache. | Possibili errori temporanei dopo il cambio. | Test e nota nella SPEC. | custodi.md §8 |
| 12 | B | `deploy/VERSIONS.md` | Tag delle immagini non verificati sui registri. | Possibile errore al primo `pull`. | Verificare al primo pull. | — |
| 13 | B | Podman | Non provato (contesto Git, reti interne, healthcheck, `chown`). | Possibili errori. | Prova su VM. | installazione-ente.md §6.2 |
| 14 | B | `.env.example` / README estensione | `OIDC_AUDIENCE=pseudogate` con client di esempio `pseudogate-extension`: con Keycloak serve un mapper di audience. | 401 se non configurato. | Citare il mapper nel README. | configurazione.md §B.1.a |

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
