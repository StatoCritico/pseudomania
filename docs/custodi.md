# Pseudomania Enterprise edition – procedure dei custodi

Per i custodi, il DPO e gli amministratori di sistema. Descrive la **chiave di custodia** e le
operazioni che richiedono i custodi: generazione, verifica, recupero dopo un cambio PC,
richieste dell'autorità giudiziaria, cancellazione crittografica, accesso ai contenuti tramite
l'esportazione di Claude Team. Ogni operazione ha un **verbale**.

Strumento: `tools/custodi/custodi.py` (offline). Comandi lato server:
`python -m pseudogate custodia ...` nel container dell'api (registrati in `admin_log`).
Le esportazioni si scrivono su stdout (`--out -`, consigliato) oppure, con un nome senza
cartella, in `deploy/esportazioni/` (nell'api `/var/lib/pseudogate/esportazioni`): cartella
**esclusa dai backup**, da svuotare (`shred`) a fine operazione.

## Indice

1. [Ruoli, materiale e postazione offline](#1-ruoli-materiale-e-postazione-offline)
2. [Generazione della chiave di custodia](#2-generazione-della-chiave-di-custodia)
3. [Verifica periodica e ridistribuzione delle quote](#3-verifica-periodica-e-ridistribuzione-delle-quote)
4. [Recupero dopo un cambio PC (solo progetti)](#4-recupero-dopo-un-cambio-pc-solo-progetti)
5. [Richiesta dell'autorità giudiziaria](#5-richiesta-dellautorità-giudiziaria)
6. [Cancellazione crittografica e riapplicazione dopo un ripristino](#6-cancellazione-crittografica-e-riapplicazione-dopo-un-ripristino)
7. [Account di servizio Primary Owner di Claude Team](#7-account-di-servizio-primary-owner-di-claude-team)
8. [Sostituzione della chiave di custodia](#8-sostituzione-della-chiave-di-custodia)
9. [Fonti](#9-fonti)

---

## 1. Ruoli, materiale e postazione offline

| Materiale | Chi lo tiene | Dove |
|---|---|---|
| Quote della **chiave di custodia** (predefinito 3, soglia 2) | tre custodi diversi, una ciascuno | busta sigillata o file cifrato age/gpg personale |
| Quote di sblocco di **OpenBao** (predefinito 5, soglia 3) | custodi (anche gli stessi), distinte dalle precedenti | idem |
| Chiave pubblica di custodia (`escrow_public.pem`, `escrow_key_id.txt`) | server, `deploy/custodia/` | pubblica |
| Chiavi private age dei backup | custodi | come le quote |
| Credenziali dell'account di servizio **Primary Owner** di Claude Team | password a un custode, secondo fattore (MFA) a un altro | §7 |

Regole:

- nessun amministratore di sistema tiene due quote della stessa chiave;
- le quote non si fotografano, non si inviano per email, non stanno sulla VM;
- elenco aggiornato dei custodi e dei sostituti, approvato dal titolare.

**Postazione offline.** Portatile dedicato senza rete (Wi-Fi disattivato, cavo scollegato),
avviato preferibilmente da una distribuzione live; Python ≥ 3.10 e il pacchetto
`cryptography`. Preparazione (una volta, da un PC collegato, stessa piattaforma):

```bash
pip download cryptography==50.0.1 -d wheels/
# copiare wheels/ e la cartella tools/custodi/ su chiavetta; sul PC offline:
python3 -m venv ~/custodi && ~/custodi/bin/pip install --no-index --find-links wheels/ cryptography==50.0.1
~/custodi/bin/python tools/custodi/custodi.py --help
```

Annotare nel verbale il commit del repository da cui proviene lo strumento.

I file scambiati tra server e postazione offline (`pseudomania-escrow-export`,
`pseudomania-voci-export`, `pseudomania-chiavi-recuperate`, JSON v1) si trasferiscono con una
chiavetta dedicata, cancellata (`shred`) a fine operazione.

## 2. Generazione della chiave di custodia

Una volta, **prima** del primo avvio del server. Presenti: i tre custodi, un testimone, il DPO
(o delegato).

1. Stampare il modello di verbale:
   ```bash
   ~/custodi/bin/python tools/custodi/custodi.py verbale --tipo generazione --out verbale-generazione.txt
   ```
2. Generare la chiave (RSA-OAEP-4096) e le quote. La chiave privata **non viene mai scritta su
   disco**. Con `--cifra` ogni quota esce già cifrata per il suo custode (consigliato):
   ```bash
   ~/custodi/bin/python tools/custodi/custodi.py genera-chiave --out cerimonia/ --quote 3 --soglia 2 \
     --cifra 1=age:age1...custode1 --cifra 2=age:age1...custode2 --cifra 3=gpg:<id-chiave-custode3>
   ```
   L'output riporta `escrowKeyId`, impronta SHA-256 e i file prodotti:
   `cerimonia/escrow_public.pem`, `cerimonia/escrow_key_id.txt`, `cerimonia/quota-N-di-3.txt`
   (o `.age`/`.gpg`).
3. Verificare subito con due quote qualsiasi (§3).
4. Consegnare **una** quota a ciascun custode; annotare nel verbale chi ha ricevuto quale indice.
5. Copiare `escrow_public.pem` ed `escrow_key_id.txt` sul server in `deploy/custodia/`
   (installazione-ente.md §9). Confrontare l'impronta:
   ```bash
   openssl rsa -pubin -in escrow_public.pem -outform DER 2>/dev/null | sha256sum   # = impronta del verbale
   ```
6. Cancellare dalla postazione offline la cartella `cerimonia/` tranne i file pubblici, e la
   chiavetta di trasferimento.
7. Firmare e protocollare il verbale.

## 3. Verifica periodica e ridistribuzione delle quote

**Verifica** (almeno annuale, e a ogni cambio di custode): due custodi controllano che le loro
quote ricostruiscano la chiave e che corrisponda alla pubblica in uso.

```bash
~/custodi/bin/python tools/custodi/custodi.py verifica --quota quota-1-di-3.txt.age --quota quota-3-di-3.txt.gpg \
  --identita-age ~/custode1.age --pubblica escrow_public.pem
# "esito": "quote valide", "corrisponde_alla_pubblica": true
```

Una quota può anche essere incollata (`--quota -`).

**Ridistribuzione** (un custode lascia l'incarico, cambia la soglia, sospetta compromissione di
una quota): la **stessa** chiave viene ridivisa in quote nuove; le vecchie diventano inutili solo
se tutte distrutte.

```bash
~/custodi/bin/python tools/custodi/custodi.py ridistribuisci --quota q1 --quota q2 --out nuove/ --quote 3 --soglia 2 \
  --cifra 1=age:... --cifra 2=age:... --cifra 3=age:...
~/custodi/bin/python tools/custodi/custodi.py verbale --tipo ridistribuzione
```

Se una quota è stata **esposta** insieme a un'altra (soglia raggiunta da persona non
autorizzata): non basta ridistribuire, va sostituita la chiave (§8).

## 4. Recupero dopo un cambio PC (solo progetti)

Quando un utente cambia PC (o profilo Chrome, o cancella i dati del browser) la nuova estensione
ha una chiave nuova. I dizionari delle **chat** non si recuperano. Quelli dei **progetti** si
recuperano solo su **richiesta motivata** approvata (dirigente dell'utente, DPO informato).

### 4.1 Sul PC nuovo (utente + assistenza)

1. L'utente apre claude.ai con Chrome gestito: le voci vecchie compaiono come segnaposto
   «non ripristinabili» (in grigio) con un avviso.
2. Pannello laterale di Pseudomania → **Prepara il recupero**: l'estensione genera una coppia
   RSA del dispositivo (privata non estraibile), pubblica la chiave pubblica
   (`POST /v1/keys/device`) e mostra un **codice** (`deviceKeyId`).
3. L'utente comunica il codice all'assistenza, con la richiesta motivata (ticket).

### 4.2 Sul server (amministratore)

```bash
cd /opt/pseudogate/deploy
sudo docker compose exec -T api python -m pseudogate --operatore "Nome Cognome" \
  custodia esporta-escrow --sub "<sub dell'utente>" --out - > escrow-<ticket>.json
```

Il file contiene gli escrow (chiavi cifrate per i custodi) e le chiavi pubbliche dei dispositivi
dell'utente: nessun dato in chiaro. Si può limitare a una chiave con `--key-id`.
Copiarlo sulla chiavetta di trasferimento.

### 4.3 Sulla postazione offline (due custodi)

```bash
~/custodi/bin/python tools/custodi/custodi.py ricifra --quota q1 --quota q2 \
  --escrow escrow-<ticket>.json --dispositivo <deviceKeyId> --out chiavi-recuperate-<ticket>.json
~/custodi/bin/python tools/custodi/custodi.py verbale --tipo recupero
```

Lo strumento ricostruisce la chiave privata di custodia in memoria, decifra le chiavi vecchie
dell'utente e le ricifra per la chiave pubblica **del nuovo dispositivo**: solo quel browser
potrà usarle. Con `--key-id` si recuperano solo chiavi specifiche (predefinito: tutte quelle
cifrate con la chiave di custodia attuale).

### 4.4 Caricamento (amministratore)

Da riga di comando (consigliato):

```bash
sudo cp chiavi-recuperate-<ticket>.json /opt/pseudogate/deploy/esportazioni/
sudo chown 10001:10001 /opt/pseudogate/deploy/esportazioni/chiavi-recuperate-<ticket>.json
sudo docker compose exec api python -m pseudogate --operatore "Nome Cognome" \
  custodia importa-recuperate --file /var/lib/pseudogate/esportazioni/chiavi-recuperate-<ticket>.json
sudo shred -u /opt/pseudogate/deploy/esportazioni/chiavi-recuperate-<ticket>.json
shred -u chiavi-recuperate-<ticket>.json escrow-<ticket>.json
```

In alternativa via API con il token amministrativo `secrets/api/admin-api-token`
(installazione-ente.md §10):

```bash
sudo sh -c 'curl -s -X POST -H "Authorization: Bearer $(cat /opt/pseudogate/deploy/secrets/api/admin-api-token)" \
  -H "Content-Type: application/json" --data @chiavi-recuperate-<ticket>.json \
  https://pseudogate.ente.local/v1/keys/recovered -w "%{http_code}\n"'      # 204 atteso
```

### 4.5 Sul PC nuovo

L'estensione scarica la chiave entro un minuto (`GET /v1/keys/recovered`, o pulsante «Verifica
chiavi recuperate»), la importa come chiave «legacy» non estraibile e ricifra le voci con la
chiave attiva. Le chiavi recuperate restano scaricabili per 7 giorni. Controllare con l'utente
che il progetto mostri di nuovo i valori reali; chiudere il ticket e protocollare il verbale.

## 5. Richiesta dell'autorità giudiziaria

Principio: si estrae **solo** ciò che è richiesto, con verbale; il resto non si tocca.

1. **Protocollo e verifica** della richiesta (ufficio legale, DPO). Identificare utente, periodo,
   conversazioni o progetti.
2. **Blocco** per sospendere le cancellazioni dei soli dati indicati (installazione-ente.md §21.1):
   ```bash
   sudo docker compose exec api python -m pseudogate --operatore "Nome" \
     blocchi aggiungi --rif "PROT-..." --sub "<sub>" [--scope project:<uuid>] --nota "..."
   ```
   Agire subito: dizionari delle chat ed escrow hanno durate brevi (§6), i backup del key store
   ruotano a 14 giorni.
3. **Contenuti delle chat** (testi pseudonimizzati): non sono sul server Pseudomania. Si ottengono
   con l'esportazione dei dati di Claude Team tramite l'account di servizio Primary Owner (§7),
   estraendo solo le conversazioni richieste e distruggendo il resto dell'esportazione.
   Autenticità: confrontare lo SHA-256 del testo pseudonimizzato di ciascun messaggio con
   `audit_events.prompt_sha256` (stesso utente, stesso intervallo di tempo).
4. **Valori reali** dei segnaposto: esportazioni dal server, limitate allo scope e ai tag necessari:
   ```bash
   sudo docker compose exec -T api python -m pseudogate --operatore "Nome" \
     custodia esporta-escrow --sub "<sub>" --out - > escrow.json
   sudo docker compose exec -T api python -m pseudogate --operatore "Nome" \
     custodia esporta-voci --sub "<sub>" --scope project:<uuid> --tag "[FULLNAME_1]" --tag "[CF_1]" --out - > voci.json
   ```
5. Sulla postazione offline, due custodi:
   ```bash
   ~/custodi/bin/python tools/custodi/custodi.py decifra-voci --quota q1 --quota q2 \
     --escrow escrow.json --voci voci.json --scope project:<uuid> --tag "[FULLNAME_1]" --out voci-decifrate.csv
   ~/custodi/bin/python tools/custodi/custodi.py verbale --tipo giudiziaria
   ```
   Il CSV (`scopeType, scopeId, tag, tipo, valore`) contiene dati personali in chiaro: consegnarlo
   secondo le modalità della richiesta, poi `shred` di tutti i file.
6. **Revoca del blocco** quando l'autorità lo consente:
   `blocchi revoca <ID> --rif "PROT-..."`. Le cancellazioni sospese riprendono al job successivo.
7. Protocollare verbale e richiesta.

Limiti da dichiarare nel verbale: le voci non caricate entro 10 minuti dall'invio non esistono
cifrate; voci già cancellate prima del blocco non sono recuperabili (neanche dai backup del key
store oltre 14 giorni).

## 6. Cancellazione crittografica e riapplicazione dopo un ripristino

**Come avviene.** Alla scadenza (tabella in installazione-ente.md §18) o su richiesta (utente dal
pannello laterale, `DELETE /v1/scopes/...`) il server cancella le voci del dizionario. Quando una
chiave utente non ha più voci vive (o dopo la rotazione) il suo **escrow** nel key store viene
distrutto: a quel punto, anche con la soglia dei custodi, nessuno può più decifrare quelle voci
eventualmente rimaste in un backup del DB applicativo. Dopo 14 giorni l'escrow sparisce anche dai
backup del key store.

**Registro.** Ogni cancellazione va in `deletion_log` (append-only, catena di hash, 24 mesi) e
nell'esportazione `deploy/registro/cancellazioni.jsonl`, fuori dal DB e inclusa nei backup.
I dati sotto **blocco giudiziario** non vengono cancellati.

**Dopo ogni ripristino da backup** (DB applicativo e/o key store):

```bash
cd /opt/pseudogate/deploy
sudo ./scripts/riapplica-cancellazioni.sh "Nome Cognome operatore"
```

Lo script riapplica le cancellazioni registrate dopo la data del backup (idempotente) e verifica
le catene dei registri (`registri verifica`). Verbale:

```bash
python3 tools/custodi/custodi.py verbale --tipo cancellazione
```

Nel verbale: backup usato (data), file di registro riapplicato (data dell'ultima riga), esito di
`registri verifica`, numero di voci ed escrow ricancellati.

**Cancellazione su richiesta dell'interessato** (art. 17 GDPR): l'utente cancella dal pannello;
in alternativa l'amministratore individua lo scope e lo cancella con l'API dell'utente o
attende la scadenza. La cancellazione è definitiva per l'escrow solo dopo 14 giorni (backup del
key store): indicarlo nella risposta all'interessato.

## 7. Account di servizio Primary Owner di Claude Team

DECISIONI.md, punto 4: i contenuti delle chat si recuperano solo tramite l'esportazione di Claude
Team, con il ruolo **Primary Owner** su un **account di servizio** a doppia custodia.

1. Creare nell'IdP un account di servizio (es. `claude-owner@ente.it`), escluso dalle regole di
   accesso condizionato solo se strettamente necessario, con MFA obbligatoria.
2. **Password** a un custode, **secondo fattore** (token hardware o app su dispositivo dedicato)
   a un altro custode: nessuno dei due può accedere da solo.
3. Trasferire a questo account il ruolo di Primary Owner dell'organizzazione Claude Team
   [DA VERIFICARE: procedura di trasferimento nella console]. Gli amministratori operativi
   restano Owner/Admin con i propri account.
4. Usarlo **solo** per: esportazione dei dati su richiesta dell'autorità giudiziaria (§5),
   operazioni riservate al Primary Owner. Ogni accesso con verbale (data, motivo, presenti).
5. Esportazione: dalle impostazioni dell'organizzazione, sezione dati/esportazione
   [DA VERIFICARE: percorso e formato dell'esportazione sul piano Team]. Estrarre solo le
   conversazioni richieste; distruggere il resto dell'esportazione con verbale.
6. Verificare almeno una volta all'anno che i due custodi riescano ad accedere (senza esportare).

## 8. Sostituzione della chiave di custodia

Da fare se la chiave privata potrebbe essere stata ricostruita da persone non autorizzate.

1. Generare una nuova chiave (§2) e copiare i nuovi file pubblici in `deploy/custodia/`;
   `sudo docker compose up -d api`. `/v1/config` pubblica il nuovo `escrowKeyId`.
2. Forzare la rotazione di tutte le chiavi utente:
   ```bash
   sudo docker compose exec api python -m pseudogate --operatore "Nome" chiavi forza-rotazione --tutti --motivo "sostituzione chiave di custodia"
   ```
   Ogni estensione crea una chiave nuova con escrow per la nuova chiave di custodia e ricifra le
   voci; gli escrow vecchi vengono distrutti a ricifratura completata.
3. Conservare le vecchie quote finché la rotazione non è completa (utenti inattivi), poi
   distruggerle con verbale. [DA VERIFICARE: comportamento del server con escrow di una chiave di
   custodia precedente durante la transizione, errore `escrow_key_mismatch`.]

## 9. Fonti

Repository: `tools/custodi/custodi.py` (comandi e modelli di verbale), `server/pseudogate/__main__.py`
(comandi `custodia`, `blocchi`, `chiavi`, `cancellazioni`, `registri`), `deploy/scripts/riapplica-cancellazioni.sh`,
`DECISIONI.md` (progetto crittografico, durate), `SPEC.md`, `extension/README.md` §2.7.
