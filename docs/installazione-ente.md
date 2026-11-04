# Pseudomania Server edition – installazione

Guida per gli amministratori di sistema. Parte da una VM Linux appena installata e arriva al
servizio in esercizio, con backup, cancellazioni e controlli. Gli identificatori tecnici
(servizi, database, cartelle, immagini) restano `pseudogate`; i testi visibili dicono
Pseudomania. Sito del progetto: https://pseudomania.statocritico.it

Altri documenti:

- [custodi.md](custodi.md): chiave di custodia, recupero dopo un cambio PC, richieste
  dell'autorità giudiziaria, cancellazione crittografica, verbali;
- [configurazione.md](configurazione.md): ciò che sta **fuori** dalla VM (console di Claude
  Team, identity provider, policy di Chrome, blocco delle app, proxy);
- [verifica-pilota.md](verifica-pilota.md): prove da superare prima del go-live.

Convenzioni: comandi con `sudo` nella cartella `/opt/pseudogate/deploy`;
`pseudogate.ente.local`, `langfuse.ente.local`, `idp.ente.local` sono esempi;
**[DA VERIFICARE]** = non provato o fonte esterna non confermata.

## Indice

1. [Architettura in breve](#1-architettura-in-breve)
2. [Cosa protegge la cifratura (e cosa no)](#2-cosa-protegge-la-cifratura-e-cosa-no)
3. [Dimensionamento](#3-dimensionamento)
4. [Prerequisiti: rete, DNS, certificati](#4-prerequisiti-rete-dns-certificati)
5. [Preparare la VM](#5-preparare-la-vm)
6. [Installare Docker Engine (o Podman)](#6-installare-docker-engine-o-podman)
7. [Scaricare il codice](#7-scaricare-il-codice)
8. [Costruire le immagini (anche offline)](#8-costruire-le-immagini-anche-offline)
9. [Chiave di custodia (prima del primo avvio)](#9-chiave-di-custodia-prima-del-primo-avvio)
10. [Segreti e file .env](#10-segreti-e-file-env)
11. [Personalizzazioni dell'ente](#11-personalizzazioni-dellente)
12. [Primo avvio, in ordine](#12-primo-avvio-in-ordine)
13. [OpenBao: inizializzazione con i custodi](#13-openbao-inizializzazione-con-i-custodi)
14. [Langfuse: dedicato o condiviso](#14-langfuse-dedicato-o-condiviso)
15. [Pacchetto dell'estensione](#15-pacchetto-dellestensione)
16. [Controlli di funzionamento](#16-controlli-di-funzionamento)
17. [Firewall](#17-firewall)
18. [Conservazione dei dati](#18-conservazione-dei-dati)
19. [Backup: DB applicativo e key store](#19-backup-db-applicativo-e-key-store)
20. [Ripristino e riapplicazione delle cancellazioni](#20-ripristino-e-riapplicazione-delle-cancellazioni)
21. [Comandi di amministrazione: blocchi, rotazione, registri](#21-comandi-di-amministrazione-blocchi-rotazione-registri)
22. [Riavvio della VM e sblocco di OpenBao](#22-riavvio-della-vm-e-sblocco-di-openbao)
23. [Aggiornamenti](#23-aggiornamenti)
24. [Log](#24-log)
25. [Risoluzione dei problemi](#25-risoluzione-dei-problemi)
26. [Fonti](#26-fonti)

---

## 1. Architettura in breve

Tutto gira con Docker Compose su una sola VM (`deploy/docker-compose.yml`, progetto
`pseudogate`). Solo `caddy` pubblica una porta sull'host: **443**.

| Servizio | Porta interna | Reti | Ruolo |
|---|---|---|---|
| `caddy` | 443 **pubblicata** | `edge`, `proxy_api`, `proxy_langfuse` | TLS con i certificati dell'ente; `/v1/*` → `api`; `/extension/*` → pacchetto dell'estensione (`deploy/estensione/`); `https://langfuse.ente.local` → `langfuse-web` |
| `api` | 8787 | `proxy_api`, `data`, `keys`, `detector`, `langfuse_ingest`, `egress` | API di Pseudomania |
| `rizzo-pii` | 5005 | `detector` (interna) | rilevatore di dati personali, senza Internet |
| `postgres` | 5432 | `data` (interna) | DB applicativo `pseudogate`: dizionario **cifrato dall'estensione**, registro minimo, registri tecnici |
| `postgres-keys` | 5432 | `keys` (interna) | **key store** `pseudogate_keys`: copie di custodia (escrow) delle chiavi utente. Container, volume (`pseudogate-keys-postgres`), rete e backup propri |
| `openbao` | 8200 | `data` (interna) | solo la chiave HMAC `user-hmac` (transit) e i segreti AppRole |
| `openbao-init` | — | `data` | operazione una tantum (profilo `init`) |
| `langfuse-web`, `langfuse-worker`, `langfuse-postgres`, `clickhouse`, `valkey`, `seaweedfs` | 3000 | `proxy_langfuse`, `langfuse_ingest`, `langfuse_backend` | profilo `langfuse`: **facoltativi** se l'ente ha già un Langfuse |

Reti: tutte `internal: true` tranne `edge` (con il NAT in uscita disattivato: caddy non
raggiunge Internet) ed `egress` (api → identity provider ed eventuale Langfuse condiviso, da
filtrare a firewall, §17).

Versioni e licenze: [`deploy/VERSIONS.md`](../deploy/VERSIONS.md). Contratto tecnico:
[`SPEC.md`](../SPEC.md); decisioni vincolanti: [`DECISIONI.md`](../DECISIONI.md).

## 2. Cosa protegge la cifratura (e cosa no)

Da leggere prima di installare: spiega perché esistono il key store, i custodi e due backup.

- Ogni utente ha una **chiave AES-256 generata dall'estensione** nel suo browser, non
  estraibile. L'estensione cifra i valori reali del dizionario (nomi, codici fiscali…) prima
  di inviarli al server. Il server conserva solo: HMAC del valore (per dare lo stesso
  segnaposto allo stesso valore), testo cifrato, IV, `keyId`.
- Alla creazione, la chiave dell'utente viene cifrata anche con la **chiave pubblica di
  custodia** (RSA-4096) e conservata nel **key store** (*escrow*). La chiave privata di custodia
  **non è mai sul server**: è divisa in quote (2 di 3) tra i custodi, con lo strumento offline
  `tools/custodi/` ([custodi.md](custodi.md)).
- Le chiavi utente **ruotano ogni 90 giorni** in automatico (`KEY_ROTATION_DAYS`): l'estensione
  ricifra le voci, il server distrugge l'escrow vecchio.
- **Cambio PC:** il browser nuovo ha una chiave nuova. I dizionari delle chat non si recuperano;
  quelli dei progetti solo su richiesta motivata, con due custodi.
- **Cancellazione crittografica:** quando scade o viene cancellato un dizionario si cancellano
  le voci; quando una chiave non ha più voci si distrugge il suo escrow. Ogni cancellazione va
  in un registro append-only, esportato anche fuori dal DB, da **riapplicare dopo ogni
  ripristino** da backup (§20).

Rischio residuo (dichiarato nella DPIA): il server vede il testo in chiaro **durante** la
singola richiesta (deve passarlo al rilevatore); root sulla VM può intercettare richieste
future, ma non decifrare i dizionari passati; root può verificare se un valore indovinato è
presente (HMAC con la chiave in OpenBao, quando OpenBao è sbloccato).

## 3. Dimensionamento

> **Le cifre sono stime**, non misure. Vanno verificate nel pilota (6 utenti) con
> `docker stats` e i tempi di risposta, e corrette prima di estendere il servizio.

| Risorsa | Pilota (6 utenti), Langfuse sulla VM | Senza Langfuse locale | Note |
|---|---|---|---|
| vCPU | 8 | 6 | `rizzo-pii` ha un limite di 4 CPU (`RIZZO_CPUS`), nessuna GPU |
| RAM | 16 GB (24 consigliati) | 12 GB | `rizzo-pii` fino a 6 GB (`RIZZO_MEMORY`); ClickHouse + Langfuse 3–5 GB |
| Disco | 100 GB SSD | 60 GB | immagini 10–15 GB; i backup vanno su altri dischi |
| Sistema | Ubuntu Server 24.04 LTS o Debian 12, x86_64 | | |

Misurare nel pilota: tempo di `POST /v1/pseudonymize` (messaggio tipico e PDF di 20 pagine:
su CPU anche minuti, `RIZZO_TIMEOUT_S=600`), memoria di picco di `rizzo-pii` e `clickhouse`,
crescita dei volumi.

## 4. Prerequisiti: rete, DNS, certificati

### 4.1 DNS interno

```
pseudogate.ente.local.  IN A  10.0.0.50
langfuse.ente.local.    IN A  10.0.0.50    ; solo con Langfuse sulla VM (CADDY_LANGFUSE_SITE=on)
```

### 4.2 Certificati TLS dell'ente

| File in `deploy/certs/` | Contenuto |
|---|---|
| `pseudogate.crt` | certificato di `pseudogate.ente.local` **seguito dalla catena intermedia** |
| `pseudogate.key` | chiave privata non cifrata |
| `langfuse.crt`, `langfuse.key` | idem per `langfuse.ente.local` |

Con un certificato SAN unico copiare lo stesso file con entrambi i nomi. Percorsi configurabili
in `.env` (`TLS_CERT_PSEUDOGATE`, `TLS_KEY_PSEUDOGATE`, `TLS_CERT_LANGFUSE`, `TLS_KEY_LANGFUSE`,
percorsi **nel container** sotto `/etc/caddy/certs`). La CA deve essere attendibile sui PC.

```bash
openssl pkcs12 -in pseudogate.pfx -nokeys -out pseudogate.crt          # da PFX
openssl pkcs12 -in pseudogate.pfx -nocerts -nodes -out pseudogate.key
openssl x509 -noout -modulus -in pseudogate.crt | sha256sum            # le due impronte
openssl rsa  -noout -modulus -in pseudogate.key | sha256sum            # devono coincidere
```

### 4.3 Accessi di rete necessari

| Fase | Destinazione | Perché |
|---|---|---|
| Installazione e build | repository Ubuntu/Debian, `download.docker.com` | pacchetti |
| Installazione e build | `docker.io`, `docker.langfuse.com` | immagini |
| Build di `api` | `pypi.org`, `files.pythonhosted.org` | dipendenze Python |
| Build di `rizzo-pii` | `github.com`, `huggingface.co` (e CDN), `download.pytorch.org` | codice, modello, torch CPU |
| Esercizio | identity provider (discovery e JWKS) | validazione dei token |
| Esercizio | Langfuse condiviso, se usato | invio delle trace e job di pulizia |
| Esercizio | nient'altro | |

Se la VM esce tramite il proxy aziendale, configurare il proxy per il demone Docker (pull) e
per le build:

```bash
sudo mkdir -p /etc/systemd/system/docker.service.d
sudo tee /etc/systemd/system/docker.service.d/http-proxy.conf >/dev/null <<'EOF'
[Service]
Environment="HTTP_PROXY=http://proxy.ente.local:3128"
Environment="HTTPS_PROXY=http://proxy.ente.local:3128"
Environment="NO_PROXY=localhost,127.0.0.1,.ente.local"
EOF
sudo systemctl daemon-reload && sudo systemctl restart docker
# per i RUN delle build: passare il proxy come build-arg al momento della build
sudo docker compose build --build-arg HTTPS_PROXY=http://proxy.ente.local:3128 \
  --build-arg HTTP_PROXY=http://proxy.ente.local:3128 api rizzo-pii
```

Non usare `~/.docker/config.json` → `proxies`: passerebbe il proxy anche ai container in
esercizio. Per le uscite dell'`api` (IdP, Langfuse condiviso) c'è `OUTBOUND_HTTPS_PROXY` (§10).

## 5. Preparare la VM

```bash
sudo apt update && sudo apt full-upgrade -y
sudo apt install -y ca-certificates curl git gnupg openssl age chrony
sudo timedatectl set-timezone Europe/Rome
timedatectl status          # "System clock synchronized: yes" (i token OIDC dipendono dall'ora)
```

`age` cifra i backup (in alternativa GnuPG). Gli script vanno eseguiti con `sudo`: i file in
`deploy/secrets/` sono creati dai container come root.

## 6. Installare Docker Engine (o Podman)

### 6.1 Docker Engine (consigliato)

Servono Docker Engine (Apache-2.0) con i plugin Compose v2 e Buildx (contesto di build Git per
`rizzo-pii`). Docker Desktop non serve sui server.

```bash
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
 | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo docker compose version && sudo docker buildx version
```

Debian 12: sostituire `linux/ubuntu` con `linux/debian` in entrambe le righe.

### 6.2 Podman [DA VERIFICARE]

Podman rootful con `podman-docker` e Compose v2 sul socket di Podman può funzionare, ma **non è
stato provato**: build con contesto Git, reti interne, `depends_on: service_healthy`, `chown`
in `openbao-init`. Gli script usano `docker compose`.

## 7. Scaricare il codice

```bash
sudo git clone <URL del repository di Pseudomania> /opt/pseudogate   # indicato su https://pseudomania.statocritico.it
cd /opt/pseudogate && git log -1 --format='%H %cd'                   # annotare il commit
cd deploy
```

Senza accesso a Git: copiare un archivio (`git archive`) e scompattarlo in `/opt/pseudogate`.

## 8. Costruire le immagini (anche offline)

| Servizio | Immagine | Sorgente |
|---|---|---|
| `api` | `pseudogate-api:0.1.0` | `../server` (PyPI) |
| `rizzo-pii` | `rizzo-pii:9057eef-v1.5.0` | `RIZZO_BUILD_CONTEXT` (Git, commit `9057eef…`); modello `rizzoaiacademy/rizzo-pii-0.3B` rev. `RIZZO_MODEL_REVISION=v1.5.0` da Hugging Face, torch CPU da `download.pytorch.org` |

Le altre immagini si scaricano. Creare prima `.env` (§10), poi:

```bash
sudo docker compose --profile langfuse pull --ignore-buildable
sudo docker compose build api rizzo-pii       # 10-30 minuti la prima volta
```

**Senza GitHub ma con Hugging Face/PyTorch:** clonare Rizzo-PII al commit indicato e impostare
`RIZZO_BUILD_CONTEXT=/opt/rizzo-pii` in `.env`.

**VM senza Internet:** costruire su un'altra macchina con lo stesso commit e un `.env` qualsiasi
(`cp .env.example .env && ./scripts/genera-segreti.sh`):

```bash
docker compose --profile langfuse pull --ignore-buildable
docker compose build api rizzo-pii
docker compose --profile langfuse config --images | sort -u > immagini.txt
docker save $(cat immagini.txt) | gzip > pseudogate-immagini.tar.gz
sha256sum pseudogate-immagini.tar.gz > pseudogate-immagini.tar.gz.sha256
```

Sulla VM: `sha256sum -c ...` e `gunzip -c pseudogate-immagini.tar.gz | sudo docker load`. Poi
avviare **senza** `--build`.

## 9. Chiave di custodia (prima del primo avvio)

L'`api` non parte senza la chiave **pubblica** di custodia (RSA-4096): va generata dai custodi,
**offline**, prima del primo avvio. Procedura completa e verbale: [custodi.md §2](custodi.md#2-generazione-della-chiave-di-custodia).
In breve:

```bash
# sul PC offline dei custodi
python3 tools/custodi/custodi.py genera-chiave --out cerimonia/ --quote 3 --soglia 2
# risultato: cerimonia/escrow_public.pem, cerimonia/escrow_key_id.txt, quote 1..3
```

Copiare sulla VM **solo** i due file pubblici:

```bash
sudo cp escrow_public.pem escrow_key_id.txt /opt/pseudogate/deploy/custodia/
sudo chmod 644 /opt/pseudogate/deploy/custodia/*
sudo openssl rsa -pubin -in /opt/pseudogate/deploy/custodia/escrow_public.pem -noout -text | head -1   # 4096 bit
```

Nessuna quota e nessuna chiave privata deve mai arrivare sulla VM.

## 10. Segreti e file .env

```bash
cd /opt/pseudogate/deploy
sudo ./scripts/genera-segreti.sh
```

Lo script crea `.env` da `.env.example` (se manca), sostituisce i segnaposto `__GENERA__`,
`__GENERA_HEX32__`, `__GENERA_PK__`/`__GENERA_SK__` senza toccare i segreti esistenti, imposta
`.env` a 600, crea `secrets/` (700), `certs/`, `custodia/`, `registro/`, `esportazioni/`, genera
il token amministrativo `secrets/api/admin-api-token` e assegna `secrets/api`, `registro/` ed
`esportazioni/` all'utente dell'api (uid 10001). Eseguirlo con `sudo`, altrimenti il `chown` non riesce.

Valori da impostare a mano (`sudo nano .env`):

| Variabile | Valore |
|---|---|
| `PSEUDOGATE_DOMAIN` | nome DNS del §4.1 |
| `CADDY_LANGFUSE_SITE` | `on` = Langfuse su questa VM (Caddy serve `LANGFUSE_DOMAIN`); `off` = Langfuse condiviso (§14.2) |
| `LANGFUSE_DOMAIN` | solo con `CADDY_LANGFUSE_SITE=on` |
| `OIDC_ISSUER` | issuer esatto del claim `iss` ([configurazione.md §B](configurazione.md#b-identity-provider)) |
| `OIDC_AUDIENCE` | claim `aud` atteso |
| `OIDC_USER_CLAIM` | `sub` |
| `OIDC_OFFICE_CLAIM` | facoltativo: claim dell'ufficio, usato **solo** negli aggregati anonimi dopo 90 giorni |
| `EXTRA_CA_FILE` | CA interne (IdP, Langfuse condiviso) per **tutte** le chiamate HTTPS dell'api: file PEM in `deploy/ca/`, es. `/etc/pseudogate/ca/ca-interna-ente.pem` (accettato anche il vecchio `OIDC_CA_FILE`) |
| `OUTBOUND_HTTPS_PROXY` | proxy per le uscite HTTPS dell'api (es. Entra ID), es. `http://proxy.ente.local:3128` (accettato anche il vecchio `OIDC_HTTPS_PROXY`) |
| `OUTBOUND_NO_PROXY` | host da raggiungere senza proxy oltre ai servizi interni, es. `langfuse.ente.local,.ente.local` |
| `CORS_ALLOW_ORIGIN_REGEX` | `^chrome-extension://<ID_ESTENSIONE>` (configurazione.md §C.1); non usare `$` |
| `SOURCE_URL` | URL del repository da cui è costruita l'installazione (AGPL-3.0) |
| `LANGFUSE_*` | §14 |
| `LANGFUSE_INIT_USER_EMAIL` | email dell'amministratore di Langfuse (solo Langfuse sulla VM) |
| `BACKUP_AGE_RECIPIENT` | chiave pubblica age del DB applicativo (§19) |
| `BACKUP_KEYS_AGE_RECIPIENT` | chiave pubblica age **diversa** per il key store (consigliato) |
| `BACKUP_DIR`, `BACKUP_KEYS_DIR` | due destinazioni distinte, possibilmente su supporti diversi |
| `OPENBAO_PGP_KEYS`, `OPENBAO_ROOT_TOKEN_PGP_KEY` | consigliato, §13 |

Lasciare i predefiniti nel pilota: `FAIL_CLOSED=true`, `ALLOW_DISABLE=false` (in ogni caso
l'estensione li legge **solo** dalla policy di Chrome), `MAX_FILE_MB=20` (< `MAX_REQUEST_MB=30`),
`SPECIAL_CATEGORIES_ENABLED=true`, `DETECTOR_EXCLUDE_TAGS=`, `KEY_ROTATION_DAYS=90`,
`PENDING_ENTRY_MINUTES=10`, durate del §18.

Certificati:

```bash
sudo cp pseudogate.crt pseudogate.key langfuse.crt langfuse.key /opt/pseudogate/deploy/certs/
sudo chmod 640 /opt/pseudogate/deploy/certs/*.key
```

**Token amministrativo.** `secrets/api/admin-api-token`, creato da `genera-segreti.sh`, abilita
`POST /v1/keys/recovered` (caricamento via API delle chiavi recuperate); in alternativa c'è il
comando da riga di comando (custodi.md §4.4). È leggibile solo da root e dall'api: non copiarlo
altrove. Controllo: `sudo ls -ln secrets/api` → proprietario 10001, permessi `r--------`.

**Esportazioni per i custodi.** `deploy/esportazioni/` (nell'api: `/var/lib/pseudogate/esportazioni`)
riceve i file di `custodia esporta-*` quando non si usa lo stdout; è **esclusa dai backup** e va
svuotata dopo ogni operazione (custodi.md).

## 11. Personalizzazioni dell'ente

**Allowlist e categorie particolari** (bozze da validare con il DPO):

```bash
sudo cp /opt/pseudogate/server/config/allowlist.yml /opt/pseudogate/server/config/special_categories.yml \
        /opt/pseudogate/deploy/config/
sudo nano /opt/pseudogate/deploy/config/allowlist.yml      # nome dell'ente, uffici; aggiornare "version"
```

In `.env`:

```
ALLOWLIST_FILE=/app/config-ente/allowlist.yml
SPECIAL_CATEGORIES_FILE=/app/config-ente/special_categories.yml
```

**CA interne e proxy in uscita:** `EXTRA_CA_FILE`, `OUTBOUND_HTTPS_PROXY`, `OUTBOUND_NO_PROXY`
(§10). Non serve un file di override.

Altre modifiche locali: `docker-compose.override.yml` nella stessa cartella (Compose lo unisce
automaticamente). Verifica: `sudo docker compose config --quiet && echo OK`.

## 12. Primo avvio, in ordine

Prerequisiti: `.env` completo, certificati in `certs/`, chiave pubblica di custodia in
`custodia/` (§9), custodi di OpenBao presenti (§13).

```bash
cd /opt/pseudogate/deploy

# 1. dati e chiavi
sudo docker compose up -d openbao postgres postgres-keys
sudo docker compose ps          # postgres e postgres-keys "healthy"; openbao "healthy" anche se sigillato

# 2. OpenBao: chiave HMAC, policy, AppRole (leggere PRIMA il §13)
sudo docker compose --profile init run --rm openbao-init

# 3. tutto il resto
sudo docker compose --profile langfuse up -d     # Langfuse sulla VM
# oppure, con un Langfuse condiviso dell'ente:
sudo docker compose up -d
sudo docker compose ps
```

Al primo avvio: `postgres` e `postgres-keys` creano gli utenti applicativi (`pseudogate_app`,
`pseudogate_keys_app`) solo su volumi vuoti; l'`api` applica le migrazioni di entrambi i DB;
`rizzo-pii` carica il modello (fino a 3 minuti); `langfuse-web` crea organizzazione, progetto,
chiavi e primo utente (fino a 2 minuti).

## 13. OpenBao: inizializzazione con i custodi

OpenBao custodisce **solo** la chiave HMAC del server (`user-hmac`): pseudonimi degli utenti,
HMAC dei valori e degli scope. I valori del dizionario **non** sono cifrati da OpenBao (li cifra
l'estensione). Senza OpenBao sbloccato l'api risponde 503 e l'estensione blocca gli invii.

Le quote di sblocco di OpenBao (Shamir, predefinito 5 quote / soglia 3:
`OPENBAO_KEY_SHARES`, `OPENBAO_KEY_THRESHOLD`) sono **diverse** dalle quote della chiave di
custodia (§9). Possono essere affidate alle stesse persone, ma vanno tenute distinte.

### 13.1 Modalità consigliata: quote cifrate con PGP

Nessuno, nemmeno chi esegue lo script, vede le quote in chiaro.

1. Ogni custode consegna la propria chiave PGP **pubblica**:
   ```bash
   gpg --export <id-chiave> | base64 -w0 > custode1.b64
   ```
2. Copiare i file in `deploy/secrets/pgp/` e in `.env`:
   ```
   OPENBAO_PGP_KEYS=custode1.b64,custode2.b64,custode3.b64,custode4.b64,custode5.b64
   OPENBAO_ROOT_TOKEN_PGP_KEY=custode1.b64
   ```
   (tanti file quante `OPENBAO_KEY_SHARES`).
3. `sudo docker compose --profile init run --rm openbao-init` → quote e token root cifrati in
   `secrets/openbao-init-cifrato.txt`.
4. Ogni custode decifra la propria quota sul suo PC (`echo "<quota>" | base64 -d | gpg -d`) e la
   inserisce con `sudo ./scripts/openbao-unseal.sh`, fino alla soglia.
5. Il destinatario del token root lo decifra e riesegue l'inizializzazione senza scriverlo sulla
   riga di comando:
   ```bash
   read -rs BAO_TOKEN && export BAO_TOKEN
   sudo -E docker compose --profile init run --rm -e BAO_TOKEN openbao-init
   unset BAO_TOKEN
   ```
   Lo script crea la chiave `user-hmac`, la policy e l'AppRole `pseudogate-api`
   (`secrets/openbao-approle/role_id`, `secret_id`), la policy `pseudogate-backup` e il token
   `secrets/openbao-backup-token`, poi **revoca** il token root (`OPENBAO_REVOKE_ROOT=true`).
6. Consegnare a ciascun custode la propria quota cifrata; cancellare il file:
   `sudo shred -u secrets/openbao-init-cifrato.txt`.

### 13.2 Modalità semplice (senza PGP)

Con `OPENBAO_PGP_KEYS` vuota le quote finiscono in chiaro in `secrets/openbao-init.txt`: chi
esegue lo script le vede tutte. Lo script sblocca, configura, revoca il token root e lo toglie
dal file. Distribuire una quota per custode e poi `sudo shred -u secrets/openbao-init.txt`.

### 13.3 Token amministrativo per operazioni successive

Serve, ad esempio, per un nuovo `secret_id`. Si genera con la soglia:

```bash
sudo docker compose exec openbao bao operator generate-root -init        # annotare Nonce e OTP
sudo docker compose exec openbao bao operator generate-root              # ogni custode, a turno
sudo docker compose exec openbao bao operator generate-root -decode=<token_codificato> -otp=<OTP>
```

Usarlo (`-e BAO_TOKEN`) e revocarlo subito (`bao token revoke -self`).

### 13.4 Sblocco automatico

`openbao/config/seal-static.hcl.example` (chiave sulla stessa VM) annulla il doppio controllo:
valutarlo solo con il DPO.

## 14. Langfuse: dedicato o condiviso

Langfuse riceve solo testi **già pseudonimizzati** (una trace `claude.ai message` per invio,
`userId` = pseudonimo). È facoltativo (`LANGFUSE_ENABLED`).

### 14.1 Langfuse sulla VM (profilo `langfuse`)

- Le chiavi API del progetto (`LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`) sono generate da
  `genera-segreti.sh` e registrate da `langfuse-web` al primo avvio nel progetto `Pseudomania`.
- Primo accesso: `https://langfuse.ente.local`, utente `LANGFUSE_INIT_USER_EMAIL`, password
  `LANGFUSE_INIT_USER_PASSWORD`. Cambiare la password dall'interfaccia [DA VERIFICARE percorso in
  Langfuse v4], poi svuotare la riga in `.env` (`LANGFUSE_INIT_USER_PASSWORD=`) e
  `sudo docker compose --profile langfuse up -d langfuse-web`: così la password non resta in
  `.env` né nei suoi backup.
- Registrazione libera disattivata (`AUTH_DISABLE_SIGNUP=true`); accesso solo per amministratori e
  DPO.

### 14.2 Langfuse condiviso dell'ente

Se l'ente ha già un Langfuse usato da altre applicazioni:

1. Nel Langfuse condiviso creare un **progetto dedicato** «Pseudomania» e generarne le chiavi API
   (*Settings → API Keys* del progetto).
2. Limitare i membri del progetto ad amministratori e DPO. In Langfuse i ruoli per singolo
   progetto potrebbero richiedere l'edizione a pagamento: verificare; altrimenti valutare
   un'organizzazione Langfuse separata [DA VERIFICARE].
3. In `.env`:
   ```
   LANGFUSE_ENABLED=true
   LANGFUSE_HOST=https://langfuse.ente.local
   LANGFUSE_PUBLIC_KEY=pk-lf-...      # del progetto dedicato
   LANGFUSE_SECRET_KEY=sk-lf-...
   CADDY_LANGFUSE_SITE=off      # Caddy non serve Langfuse: LANGFUSE_DOMAIN e certificati langfuse.* non servono
   ```
4. Non avviare il profilo `langfuse` (`sudo docker compose up -d`).
5. L'api deve raggiungere quell'host: consentirlo nel firewall (§17) sulla rete `egress`. Se è
   impostato `OUTBOUND_HTTPS_PROXY` e Langfuse va raggiunto direttamente, aggiungerlo a
   `OUTBOUND_NO_PROXY` (es. `langfuse.ente.local`). Se ha un certificato di CA interna, indicarla
   in `EXTRA_CA_FILE` (vale per tutte le chiamate HTTPS dell'api, SDK Langfuse e job di pulizia compresi).

### 14.3 Conservazione delle trace (job di Pseudomania)

La conservazione automatica di Langfuse self-hosted è una funzione a pagamento: Pseudomania la
sostituisce con un proprio job (dentro il job di pulizia dell'api, ogni
`RETENTION_INTERVAL_MINUTES`) che cancella via API pubblica le trace più vecchie di
`LANGFUSE_RETENTION_DAYS` (**30 nel pilota, poi 7**; `0` = disattivato).

- Il job usa le chiavi API del progetto Pseudomania: in Langfuse le chiavi API sono legate a un
  progetto, quindi **non tocca** le trace delle altre applicazioni del Langfuse condiviso.
- Verifica dopo il primo giorno: nessuna trace più vecchia del limite nel progetto
  (`docker compose logs api | grep -i langfuse`). L'endpoint di cancellazione delle trace
  dell'API pubblica va verificato sulla versione in uso [DA VERIFICARE].

## 15. Pacchetto dell'estensione

Caddy pubblica la cartella `deploy/estensione/` sotto `https://pseudogate.ente.local/extension/`
(tipo MIME corretto per `.crx`, `no-cache` per `update.xml`).

```bash
sudo cp pseudogate-0.1.0.crx update.xml /opt/pseudogate/deploy/estensione/
curl -sI https://pseudogate.ente.local/extension/update.xml | head -3
```

Chiave di firma, ID, `update.xml` e policy: [configurazione.md §C](configurazione.md#c-policy-di-chrome-enterprise).

## 16. Controlli di funzionamento

```bash
cd /opt/pseudogate/deploy
sudo docker compose ps
curl -s https://pseudogate.ente.local/v1/health
# {"status":"ok","version":"0.1.0","mode":"ente","detector":"ok","keys":"ok"}
```

| `status` | `detector` | `keys` | Significato |
|---|---|---|---|
| `ok` | `ok` | `ok` | tutto funzionante |
| `degraded` | `down` | `ok` | rilevatore in avvio o guasto |
| `degraded` | `ok` | `sealed` | OpenBao sigillato: sbloccarlo (§22) |
| `degraded` | qualsiasi | `down` | OpenBao non raggiungibile |

La risposta è sempre HTTP 200: il monitoraggio deve leggere il campo `status`.

```bash
curl -s https://pseudogate.ente.local/v1/source                                   # URL del sorgente
curl -s -o /dev/null -w '%{http_code}\n' https://pseudogate.ente.local/v1/config  # 401 senza token
curl -s -o /dev/null -w '%{http_code}\n' https://pseudogate.ente.local/           # 404
sudo docker compose exec api python -m pseudogate registri verifica               # catene di hash integre
```

Chiave di custodia esposta all'estensione (con un token reale):

```bash
TOKEN='eyJ...'
curl -s -H "Authorization: Bearer $TOKEN" https://pseudogate.ente.local/v1/config \
  | python3 -c 'import json,sys; c=json.load(sys.stdin); print(c["escrowKeyId"], c["keyRotationDays"], c["pendingEntryMinutes"])'
# escrowKeyId uguale a deploy/custodia/escrow_key_id.txt; 90; 10
```

Prova end-to-end: si fa dal browser con l'estensione ([verifica-pilota.md](verifica-pilota.md)).
Da riga di comando si può provare solo la pseudonimizzazione (il ripristino richiede la chiave nel
browser):

```bash
curl -s -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"scope":{"type":"conversation","id":"prova-installazione"},"site":"claude.ai","kind":"message","text":"Scrivi a Mario Rossi, mario.rossi@example.it"}' \
  https://pseudogate.ente.local/v1/pseudonymize
# "text" con [FULLNAME_1] e [EMAIL_1]; "newEntries" con i valori (solo in questa risposta)
curl -s -X DELETE -H "Authorization: Bearer $TOKEN" https://pseudogate.ente.local/v1/scopes/conversation/prova-installazione
```

## 17. Firewall

Ingresso: solo 443 (e SSH dalla rete amministrativa). Uscita: solo l'`api` verso l'IdP (ed
eventualmente il Langfuse condiviso).

Le porte pubblicate da Docker non passano da `ufw`/`firewalld`: per i container usare la catena
`DOCKER-USER` o il firewall perimetrale. `ufw` per SSH:

```bash
sudo ufw default deny incoming
sudo ufw allow from 10.0.10.0/24 to any port 22 proto tcp
sudo ufw enable
```

La rete `edge` di caddy ha il NAT in uscita disattivato; per l'`api` (rete `pseudogate_egress`):

```bash
sudo tee /usr/local/sbin/pseudogate-firewall.sh >/dev/null <<'EOF'
#!/bin/sh
# Uscite dei container di Pseudomania (catena DOCKER-USER). Adattare gli IP.
set -eu
ALLOWED_IPS="10.0.0.20"   # IdP (o proxy aziendale), Langfuse condiviso se usato
EXT_IF="$(ip route show default | awk '{print $5; exit}')"
EGRESS="br-$(docker network inspect -f '{{.Id}}' pseudogate_egress | cut -c1-12)"
iptables -F DOCKER-USER
iptables -A DOCKER-USER -m conntrack --ctstate ESTABLISHED,RELATED -j RETURN
for ip in $ALLOWED_IPS; do
  iptables -A DOCKER-USER -i "$EGRESS" -o "$EXT_IF" -d "$ip" -p tcp --dport 443 -j RETURN
done
iptables -A DOCKER-USER -i "$EGRESS" -o "$EXT_IF" -j DROP
iptables -A DOCKER-USER -j RETURN
EOF
sudo chmod 700 /usr/local/sbin/pseudogate-firewall.sh
sudo /usr/local/sbin/pseudogate-firewall.sh
```

Per riapplicarlo a ogni avvio, un'unità systemd `Type=oneshot` dopo `docker.service` (con un
breve ritardo: la rete esiste dopo il primo `docker compose up`). Con un IdP cloud (Entra ID)
filtrare per IP non è praticabile: usare `OUTBOUND_HTTPS_PROXY` e consentire solo l'IP del proxy.

Verifica:

```bash
sudo docker compose exec api python -c "import urllib.request; urllib.request.urlopen('https://www.example.com', timeout=5)"        # errore atteso
sudo docker compose exec rizzo-pii python -c "import urllib.request; urllib.request.urlopen('https://huggingface.co', timeout=5)"  # errore atteso
```

## 18. Conservazione dei dati

Fonte: DECISIONI.md, «Durate di conservazione». Il job di pulizia gira nell'api ogni
`RETENTION_INTERVAL_MINUTES` (60); `sudo docker compose exec api python -m pseudogate retention`
lo esegue subito.

| Dato | Durata | Dove si regola |
|---|---|---|
| Dizionario chat | 30 giorni dall'ultimo uso; nessun recupero dopo cambio PC | `DICT_TTL_CONVERSATION_DAYS` |
| Dizionario progetti | 30 giorni dall'ultimo uso **oppure** senza conferma annuale dell'utente nel pannello; recupero via custodi solo su richiesta motivata | `DICT_TTL_PROJECT_INACTIVITY_DAYS`, `PROJECT_CONFIRM_INTERVAL_DAYS` |
| Scope `pending:` (chat nuove) | 24 ore | `PENDING_SCOPE_TTL_HOURS` |
| Voci non caricate dall'estensione | 10 minuti (poi non ripristinabili) | `PENDING_ENTRY_MINUTES` |
| Registro azioni (`audit_events`) | 90 giorni pseudonimo, poi solo aggregati anonimi (giorno, ufficio, azione, conteggi) | `AUDIT_RETENTION_DAYS` |
| Tracce Langfuse (progetto Pseudomania) | 30 giorni nel pilota, poi 7 | `LANGFUSE_RETENTION_DAYS` |
| Backup DB applicativo | 7 giornalieri + 4 settimanali (≤ 35 giorni) + copia offline | `BACKUP_DAILY_KEEP`, `BACKUP_WEEKLY_KEEP` |
| Key store e suoi backup | backup separati, rotazione 14 giorni | `BACKUP_KEYS_KEEP_DAYS` |
| Escrow delle chiavi utente | vita della chiave: rotazione ogni 90 giorni, distrutti con la chiave | `KEY_ROTATION_DAYS` |
| Registri tecnici (`deletion_log`, `admin_log`) | 24 mesi, append-only, catena di hash | (fisso: 730 giorni) |
| Verbali dei custodi, richieste dell'autorità | protocollati, secondo il massimario dell'ente | fuori dal sistema |
| Blocco per autorità giudiziaria | sospende la cancellazione dei soli dati indicati, fino a revoca | §21.1 |

## 19. Backup: DB applicativo e key store

Due backup **separati**, con destinazioni e (consigliato) chiavi di cifratura diverse: così un
escrow distrutto sparisce da tutti i backup entro 14 giorni, mentre il DB applicativo si
conserva fino a 35.

### 19.1 Chiavi di cifratura

Su un PC dei custodi, **non sulla VM**:

```bash
age-keygen -o pseudomania-backup-app.key      # "Public key: age1..." → BACKUP_AGE_RECIPIENT
age-keygen -o pseudomania-backup-chiavi.key   # → BACKUP_KEYS_AGE_RECIPIENT
```

Le chiavi private si custodiscono come le quote. Gli script rifiutano di scrivere backup in chiaro.

### 19.2 DB applicativo – `scripts/backup.sh`

Ogni esecuzione crea `BACKUP_DIR/giornalieri/<data>/` con:

| File | Contenuto |
|---|---|
| `pseudogate-<data>.sql.gz.age` | DB `pseudogate` (dizionario cifrato, registri) |
| `langfuse-<data>.sql.gz.age` | DB di Langfuse, se in esecuzione sulla VM |
| `openbao-<data>.snap.age` | snapshot di OpenBao (chiave HMAC, cifrata dal seal) |
| `env-<data>.age` | `.env` |
| `segreti-<data>.tar.age` | AppRole dell'api, token di backup, `secrets/api`, chiavi PGP pubbliche, `certs/`, `ca/`, `config/`, `custodia/` (mai le quote) |
| `registro-<data>.tar.age` | esportazione del registro delle cancellazioni |

Tiene 7 giornalieri e 4 settimanali (copia la domenica, `BACKUP_WEEKLY_DAY`). **Non** include il
key store. OpenBao deve essere sbloccato.

**Copia offline (obbligatoria):** almeno settimanale, su supporto scollegabile cifrato custodito
fuori dalla sala server:

```bash
sudo rsync -a --delete /var/backups/pseudogate/settimanali/ /media/backup-offline/pseudogate/
```

Annotare data e operatore nel registro dei backup.

### 19.3 Key store – `scripts/backup-chiavi.sh`

`pg_dump` di `pseudogate_keys` cifrato in `BACKUP_KEYS_DIR/keys-<data>.sql.gz.age`, rotazione
`BACKUP_KEYS_KEEP_DAYS=14`. Gli escrow sono già cifrati con la chiave pubblica di custodia: senza
la soglia dei custodi il backup non rivela nulla. **Non** copiarlo nella copia offline a lungo
termine né in sistemi di backup con conservazione superiore a 14 giorni.

### 19.4 Pianificazione

```bash
sudo tee /etc/cron.d/pseudogate-backup >/dev/null <<'EOF'
15 2 * * * root cd /opt/pseudogate/deploy && ./scripts/backup.sh >> /var/log/pseudogate-backup.log 2>&1
45 2 * * * root cd /opt/pseudogate/deploy && ./scripts/backup-chiavi.sh >> /var/log/pseudogate-backup-chiavi.log 2>&1
EOF
```

Controllare ogni settimana la riga finale dei due log. Se l'ente copia `BACKUP_DIR` su un
proprio sistema di backup, la conservazione deve restare entro 35 giorni (più la copia offline);
`BACKUP_KEYS_DIR` entro 14 giorni.

## 20. Ripristino e riapplicazione delle cancellazioni

Servono insieme: backup, chiavi private age, quote di OpenBao (soglia). Provare il ripristino su
una VM di prova **prima del go-live** e poi almeno una volta l'anno.

```bash
# 0. decifrare
for f in *.age; do age -d -i pseudomania-backup-app.key -o "${f%.age}" "$f"; done
age -d -i pseudomania-backup-chiavi.key -o keys-<data>.sql.gz keys-<data>.sql.gz.age

# 1. .env e segreti (stesso backup)
sudo cp env-<data> /opt/pseudogate/deploy/.env && sudo chmod 600 /opt/pseudogate/deploy/.env
cd /opt/pseudogate/deploy
sudo tar -xf segreti-<data>.tar -C .
sudo chown -R 10001:10001 secrets/openbao-approle

# 2. servizi di base su volumi vuoti
sudo docker compose up -d postgres postgres-keys openbao
sudo docker compose --profile langfuse up -d langfuse-postgres      # se Langfuse è sulla VM

# 3. DB applicativo, COME pseudogate_app (il dump è senza proprietari)
gunzip -c pseudogate-<data>.sql.gz | sudo docker compose exec -T postgres \
  psql -U pseudogate_app -d pseudogate -v ON_ERROR_STOP=1

# 4. key store, COME pseudogate_keys_app (dal backup più recente del key store)
gunzip -c keys-<data>.sql.gz | sudo docker compose exec -T postgres-keys \
  psql -U pseudogate_keys_app -d pseudogate_keys -v ON_ERROR_STOP=1

# 5. Langfuse (se sulla VM)
gunzip -c langfuse-<data>.sql.gz | sudo docker compose exec -T langfuse-postgres \
  psql -U langfuse -d langfuse -v ON_ERROR_STOP=1

# 6. OpenBao: istanza temporanea (OPENBAO_PGP_KEYS vuota in .env per questo passo), poi snapshot
sudo docker compose --profile init run --rm -e OPENBAO_REVOKE_ROOT=false openbao-init
TMPROOT=$(sudo awk '/^Initial Root Token:/{print $NF}' secrets/openbao-init.txt)
sudo docker compose cp openbao-<data>.snap openbao:/tmp/restore.snap
printf '%s' "$TMPROOT" | sudo docker compose exec -T openbao sh -c \
  'read -r BAO_TOKEN; export BAO_TOKEN; bao operator raft snapshot restore -force /tmp/restore.snap'
unset TMPROOT; sudo shred -u secrets/openbao-init.txt
sudo ./scripts/openbao-unseal.sh          # quote ORIGINALI dei custodi

# 7. avvio dell'api e RIAPPLICAZIONE DELLE CANCELLAZIONI
sudo docker compose up -d api
sudo ./scripts/riapplica-cancellazioni.sh "Nome Cognome operatore"
```

**Passo 7, perché.** Il backup può contenere voci ed escrow cancellati **dopo** la sua data
(scadenze, richieste degli utenti, rotazioni). Il registro delle cancellazioni è esportato anche
fuori dal DB in `deploy/registro/cancellazioni.jsonl`; lo script lo rilegge, ricancella ciò che
il backup ha riportato in vita (idempotente) e verifica le catene di hash dei registri.

- Usare il registro **più recente** disponibile: la cartella `deploy/registro/` attuale se la VM
  originale è leggibile, altrimenti il `registro-<data>.tar` del backup più recente (anche più
  recente del dump usato). Per un file diverso:
  `sudo ./scripts/riapplica-cancellazioni.sh "Nome" /var/lib/pseudogate/registro/<file>.jsonl`
  (percorso **nel container**: la cartella `deploy/registro/` è montata lì).
- Redigere il verbale di cancellazione/riapplicazione (custodi.md §6).

```bash
# 8. resto dello stack e verifica
sudo docker compose --profile langfuse up -d
curl -s https://pseudogate.ente.local/v1/health
```

Esito atteso: una conversazione recente (precedente al backup) aperta dallo **stesso browser**
dell'utente mostra di nuovo i valori reali (la chiave è nel browser, il dizionario cifrato è
stato ripristinato); una chat cancellata dopo la data del backup **non** viene ripristinata.

## 21. Comandi di amministrazione: blocchi, rotazione, registri

Si eseguono nel container dell'api e sono registrati in `admin_log` (append-only, catena di hash)
con il nome dell'operatore:

```bash
dc_admin() { sudo docker compose exec api python -m pseudogate --operatore "Nome Cognome" "$@"; }
```

`--sub` calcola lo pseudonimo dal claim `sub` dell'utente (OpenBao deve essere sbloccato);
`--pseudonimo` usa direttamente lo pseudonimo letto dal registro.

### 21.1 Blocco per l'autorità giudiziaria

Sospende la cancellazione **solo** dei dati indicati (un utente o un suo scope), fino a revoca:
le scadenze, le cancellazioni manuali e la distruzione degli escrow di quell'utente/scope non
avvengono.

```bash
dc_admin blocchi aggiungi --rif "PROT-2026-1234" --sub "<sub dell'utente>" --scope project:<uuid> --nota "Procura di ..."
dc_admin blocchi elenca
dc_admin blocchi revoca <ID> --rif "PROT-2026-1301"
```

Il blocco non estrae dati: l'estrazione segue la procedura dei custodi ([custodi.md §5](custodi.md#5-richiesta-dellautorità-giudiziaria)).
Nota: i backup del key store ruotano comunque a 14 giorni; il blocco impedisce la distruzione
nel DB in esercizio.

### 21.2 Rotazione forzata delle chiavi

In caso di sospetta esposizione di una chiave utente (es. PC compromesso):

```bash
dc_admin chiavi forza-rotazione --sub "<sub>" --motivo "PC smarrito, ticket 4567"
dc_admin chiavi forza-rotazione --tutti --motivo "cambio della chiave di custodia"
```

Alla prossima richiesta `/v1/config` restituisce `rotateKey: true` e l'estensione ruota la
chiave senza azioni dell'utente.

### 21.3 Registri tecnici

```bash
dc_admin registri verifica              # integrità delle catene di hash di deletion_log e admin_log
dc_admin cancellazioni esporta          # esporta il registro in /var/lib/pseudogate/registro (deploy/registro)
```

L'esportazione avviene anche automaticamente nel job di pulizia e a ogni `backup.sh` (registrata in
`admin_log` con operatore «backup automatico»).

### 21.4 Esportazioni per i custodi

`custodia esporta-escrow`, `custodia esporta-voci`, `custodia importa-recuperate`: vedi
[custodi.md](custodi.md). Le esportazioni vanno su stdout (`--out -`) o in `deploy/esportazioni/`
(esclusa dai backup, da svuotare dopo l'uso).

## 22. Riavvio della VM e sblocco di OpenBao

Dopo ogni riavvio OpenBao è **sigillato** (`/v1/health` → `"keys":"sealed"`): l'estensione
blocca gli invii.

```bash
cd /opt/pseudogate/deploy
sudo ./scripts/openbao-unseal.sh     # ogni custode inserisce la propria quota (non mostrata né salvata)
curl -s https://pseudogate.ente.local/v1/health
```

Organizzare la reperibilità dei custodi (almeno soglia + 1) e pianificare le patch con loro.

## 23. Aggiornamenti

```bash
sudo ./scripts/backup.sh && sudo ./scripts/backup-chiavi.sh
cd /opt/pseudogate && sudo git fetch && sudo git log --oneline HEAD..origin/main && sudo git pull
cd deploy
sudo diff <(grep -oE '^[A-Z0-9_]+=' .env.example | sort) <(grep -oE '^[A-Z0-9_]+=' .env | sort)   # variabili nuove ("<")
sudo docker compose --profile langfuse pull --ignore-buildable
sudo docker compose build api
sudo docker compose --profile langfuse up -d
sudo docker image prune -f
```

- VM offline: ripetere il trasferimento delle immagini (§8).
- Nuova versione di `rizzo-pii`: cambiare commit e modello, rieseguire le prove di rilevamento.
- PostgreSQL a nuova versione maggiore: dump e ripristino.
- Estensione: nuovo `.crx` firmato con la stessa chiave e `update.xml` in `deploy/estensione/`.

## 24. Log

Rotazione `json-file` (10 MB × 5 per servizio).

```bash
sudo docker compose logs -f api            # metodo, percorso, esito, durata: mai contenuti
sudo docker compose logs --since 1h caddy  # JSON senza Authorization, Cookie, scope_id
```

Il registro delle azioni è nella tabella `audit_events` (solo pseudonimi, conteggi e
SHA-256 del testo pseudonimizzato di ogni messaggio):

```bash
sudo docker compose exec postgres psql -U postgres -d pseudogate -c \
  "SELECT ts, action, kind, entity_counts, blocked, block_category FROM audit_events ORDER BY ts DESC LIMIT 20;"
```

## 25. Risoluzione dei problemi

| Sintomo | Causa probabile | Rimedio |
|---|---|---|
| `api` in riavvio: «Variabili obbligatorie mancanti: … ESCROW_PUBLIC_KEY_FILE …» | chiave pubblica di custodia assente | §9 |
| `api`: «La chiave pubblica di custodia è di N bit: servono 4096» | chiave sbagliata | rigenerare con `custodi.py genera-chiave` |
| `api`: «Servono OPENBAO_TOKEN oppure OPENBAO_ROLE_ID…» | `openbao-init` non eseguito | §12 passo 2 |
| `api`: «PG_MODE=personale non esiste più» | vecchio `.env` | togliere `PG_MODE` |
| `/v1/health` `"keys":"sealed"` | OpenBao sigillato | §22 |
| `/v1/health` `"detector":"down"` | `rizzo-pii` in avvio o senza memoria | attendere; `RIZZO_MEMORY` |
| 401 su tutte le chiamate | issuer/audience/claim, ora, JWKS irraggiungibile | decodificare il token; `timedatectl`; `EXTRA_CA_FILE`, `OUTBOUND_HTTPS_PROXY` |
| Estensione: «server non raggiungibile», `curl` funziona | CORS (ID estensione), certificato non attendibile sul PC | `CORS_ALLOW_ORIGIN_REGEX`; aprire `/v1/health` nel browser |
| Rotazione delle chiavi non completa | CORS: ID dell'estensione non ammesso, o api di versione precedente senza `PUT` tra i metodi CORS | `CORS_ALLOW_ORIGIN_REGEX`; aggiornare l'api |
| Molte voci «non ripristinabili» | caricamento oltre 10 minuti, cambio PC, dati del browser cancellati | normale per i cambi PC; per i progetti custodi.md §4 |
| `backup.sh`: «Imposta BACKUP_AGE_RECIPIENT…» | destinatario mancante | §19.1 |
| `backup.sh` fallisce sullo snapshot | OpenBao sigillato o token di backup scaduto | sbloccare; rigenerare il token con un token amministrativo |
| Dopo il ripristino «permission denied» | dump caricato come `postgres` | `REASSIGN OWNED BY postgres TO pseudogate_app` (o `pseudogate_keys_app`) |
| `riapplica-cancellazioni.sh`: file non trovato | percorso dell'host invece che del container | usare `/var/lib/pseudogate/registro/...` |
| `registri verifica` segnala catena interrotta | manomissione o ripristino parziale | non proseguire; avvisare sicurezza e DPO; verbale |
| `api` non scrive il registro o le esportazioni | `deploy/registro`, `deploy/esportazioni` non di uid 10001 | `sudo chown -R 10001:10001 registro esportazioni secrets/api` |
| Langfuse condiviso: trace assenti | firewall, `OUTBOUND_NO_PROXY`, `EXTRA_CA_FILE` | §14.2 |
| Caddy non parte: certificato langfuse mancante | `CADDY_LANGFUSE_SITE=on` senza certificati | copiarli in `certs/` oppure `CADDY_LANGFUSE_SITE=off` |

## 26. Fonti

File del repository: `deploy/docker-compose.yml`, `deploy/.env.example`, `deploy/VERSIONS.md`,
`deploy/caddy/Caddyfile`, `deploy/openbao/init.sh`, `deploy/postgres*/init/*`,
`deploy/scripts/*` (in particolare `backup.sh`, `backup-chiavi.sh`,
`riapplica-cancellazioni.sh`), `server/pseudogate/settings.py`, `server/pseudogate/__main__.py`,
`tools/custodi/custodi.py`, `SPEC.md`, `DECISIONI.md`.

Fonti esterne (da ricontrollare al momento dell'installazione):

- Docker Engine: https://docs.docker.com/engine/install/ubuntu/ , https://docs.docker.com/engine/install/debian/
- Docker e firewall (DOCKER-USER): https://docs.docker.com/engine/network/packet-filtering-firewalls/
- Proxy del demone Docker: https://docs.docker.com/engine/daemon/proxy/
- OpenBao, comandi `operator init` (PGP), `generate-root`, snapshot raft: https://openbao.org/docs/commands/
- Langfuse self-hosting e API pubblica: https://langfuse.com/self-hosting , https://api.reference.langfuse.com
- age: https://age-encryption.org
