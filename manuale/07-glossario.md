# 7. Glossario

**Allowlist (elenco di eccezioni)** – Termini pubblici (enti, istituzioni, uffici) che non vengono
mai sostituiti da segnaposto.

**Anteprima** – Finestra che mostra, prima dell'invio, il testo originale e quello che partirà
verso Claude. Si apre con **Ctrl+Maiusc+Invio**.

**Categorie particolari di dati** – Dati che rivelano origine razziale o etnica, opinioni politiche,
convinzioni religiose o filosofiche, appartenenza sindacale, dati genetici, biometrici, relativi alla
salute, alla vita o all'orientamento sessuale (art. 9 GDPR); a questi si aggiungono i dati relativi a
condanne penali e reati (art. 10 GDPR). Pseudomania blocca gli invii in cui li rileva.

**Chiave di custodia** – Coppia di chiavi RSA dell'organizzazione (Server edition). La chiave pubblica
è sul server e serve a cifrare le copie di custodia; la chiave privata non è mai sul server ed è
divisa in quote tra i custodi.

**Chiave utente** – Chiave AES-256 generata automaticamente dal browser di ciascun utente, **non
estraibile**, con cui l'estensione cifra il dizionario. Ruota ogni 90 giorni (Server edition).

**Claude Team** – Piano commerciale di Anthropic per claude.ai destinato alle organizzazioni.

**Copia di custodia (escrow)** – Copia della chiave utente cifrata con la chiave pubblica di custodia,
conservata nel key store; si apre solo con due custodi.

**CORS** – Meccanismo di sicurezza dei browser che decide se una pagina o un'estensione può leggere
le risposte di un altro indirizzo. Rilevante per il dialogo tra estensione e Rizzo-PII o il server.

**Custode** – Persona designata che detiene una quota della chiave privata di custodia (e, per due di
loro, password o secondo fattore dell'account Primary Owner). Opera solo con un altro custode e con
verbale.

**Dizionario** – Corrispondenza tra segnaposto e valori reali, per conversazione o per progetto.
Sempre cifrato.

**DPA (Data Processing Addendum)** – Accordo sul trattamento dei dati tra cliente e fornitore (art. 28
GDPR).

**DPIA** – Valutazione d'impatto sulla protezione dei dati (art. 35 GDPR).

**DPO / RPD** – Responsabile della protezione dei dati (artt. 37-39 GDPR).

**Fail-closed** – Comportamento per cui, se il servizio di riconoscimento non risponde, l'invio viene
bloccato invece di partire senza protezione (Server edition).

**HMAC** – Impronta calcolata con una chiave segreta. Serve a dare lo stesso segnaposto allo stesso
valore senza conservarlo in chiaro, e a rendere pseudonima l'identità degli utenti nel registro.

**IdP (identity provider)** – Sistema che autentica gli utenti dell'organizzazione (es. Keycloak,
Microsoft Entra ID), usato per l'SSO e per l'accesso dell'estensione al server.

**IndexedDB** – Archivio locale del browser in cui l'estensione conserva dizionario e registro
(Personal) e le chiavi non estraibili.

**Key store** – Database separato in cui il server conserva le copie di custodia, con backup propri a
14 giorni.

**Langfuse** – Piattaforma di osservabilità in cui la Server edition registra, per pochi giorni,
i testi **già pseudonimizzati**, per misurare la qualità del riconoscimento.

**OpenBao** – Servizio che custodisce sul server la sola chiave HMAC; si sblocca con le quote dei
custodi.

**Pannello di ispezione** – Pannello laterale di Pseudomania che mostra originale e testo inviato,
dati sostituiti, segnalazioni, cancellazione dei dati, conferma e recupero dei progetti.

**Personal edition / Server edition** – Le due edizioni di Pseudomania (capitolo 1, §1.3).

**Primary Owner** – Ruolo più alto di un'organizzazione Claude Team; è l'unico che può esportare i dati
dell'organizzazione. Nella Server edition è assegnato a un account di servizio a doppia custodia.

**Progetto** – Funzione di claude.ai che raccoglie chat, istruzioni e file; in Pseudomania ha un unico
dizionario per tutte le sue chat.

**Pseudonimizzazione** – Trattamento per cui i dati non possono più essere attribuiti a una persona
senza informazioni aggiuntive conservate separatamente (art. 4, n. 5, GDPR). I dati pseudonimizzati
**restano dati personali**.

**Quasi-identificatori** – Informazioni che, senza nome, permettono comunque di riconoscere una
persona (ruolo unico, data e luogo di un fatto, numero di protocollo…). Pseudomania non li riconosce.

**Quota (Shamir)** – Parte di un segreto diviso con lo schema di Shamir: servono almeno «soglia» quote
(es. 2 di 3) per ricomporlo; una sola quota non rivela nulla.

**Registro minimo** – Registro del server (Server edition) con data e ora, pseudonimo dell'utente, ufficio,
azioni, conteggi, blocchi e impronta SHA-256 del testo pseudonimizzato; **nessun testo**.

**Rizzo-PII** – Modello e servizio open source per il riconoscimento dei dati personali in italiano;
nella Personal edition gira come app desktop sul PC, nella Server edition sul server.

**Scope** – Ambito di un dizionario: una conversazione, un progetto o una chat nuova non ancora salvata
(`pending:`).

**Segnaposto (tag)** – Stringa `[TIPO_N]` che sostituisce un dato personale, es. `[FULLNAME_1]`,
`[CF_2]`, `[IBAN_1]`.

**SHA-256 (impronta)** – Funzione che produce un'impronta di un testo; permette di verificare
l'autenticità di un messaggio esportato senza conservarne il contenuto.

**SSO** – Accesso unico con le credenziali dell'organizzazione.

**Verbale** – Documento redatto a ogni operazione dei custodi o di distruzione, poi protocollato.
