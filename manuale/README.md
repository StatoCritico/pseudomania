# Manuale utente di Pseudomania

Pseudomania pseudonimizza automaticamente ciò che invii a **claude.ai** e ripristina i dati reali
nelle risposte, solo nel tuo browser. Software libero, licenza AGPL-3.0-or-later.
Sito: <https://pseudomania.statocritico.it>

Versione del manuale: 0.1 del 31/10/2026 (bozza). Formati: questi file Markdown,
[Manuale-Pseudomania.docx](Manuale-Pseudomania.docx) e [Manuale-Pseudomania.pdf](Manuale-Pseudomania.pdf).

> **Prima di tutto leggi il [capitolo 0](00-avvertenze.md).** Pseudomania riduce il rischio, non lo
> elimina; la responsabilità legale resta interamente di chi adotta e usa il sistema.

## Guide rapide (2 pagine)

| Guida | Per chi | Formati |
|---|---|---|
| [Guida rapida Personal edition](guida-rapida-personal.md) | professionista | [DOCX](guida-rapida-personal.docx) · [PDF](guida-rapida-personal.pdf) |
| [Guida rapida per l'utente Enterprise](guida-rapida-utente-enterprise.md) | dipendente di un'organizzazione | [DOCX](guida-rapida-utente-enterprise.docx) · [PDF](guida-rapida-utente-enterprise.pdf) |

## Indice

| Capitolo | Per chi |
|---|---|
| [0. Avvertenze e disclaimer di responsabilità](00-avvertenze.md) | tutti |
| [1. Cos'è e come funziona](01-come-funziona.md) | tutti |
| [2. Personal edition](02-personal-edition.md) | professionisti e piccole organizzazioni |
| [3. Enterprise edition](03-enterprise-edition.md) | decisori, responsabili IT, DPO, custodi |
| [4. Uso quotidiano](04-uso-quotidiano.md) | tutti gli utenti |
| [5. Creare una policy](05-creare-una-policy.md) | titolari, DPO, consulenti |
| [6. Risoluzione dei problemi](06-risoluzione-problemi.md) | utenti, help desk |
| [7. Glossario](07-glossario.md) | tutti |
| [Appendice – Riferimenti e link](08-appendice-riferimenti.md) | tutti |
| [Avvertenze finali](09-avvertenze-finali.md) | tutti |

Percorsi di lettura consigliati:

- **Professionista (Personal edition)**: 0 → 1 → 2 → 4 → 5.2 → 6.
- **Utente di un ente (Enterprise edition)**: 0 → 1 → 4 → 6.
- **Responsabile IT**: 0 → 1 → 3 → poi la documentazione tecnica in `../docs/`.
- **Titolare, DPO, ufficio personale**: 0 → 1 → 3.2-3.3 → 5.

## Convenzioni

- **[DA VERIFICARE]**: indicazione non ancora confermata su una fonte ufficiale o non provata sul
  sistema reale. L'elenco delle parti da aggiornare è in [DA-AGGIORNARE.md](DA-AGGIORNARE.md).
- **(Personal)** / **(Enterprise)**: comportamento specifico di un'edizione.
- `pseudogate.ente.local`, `idp.ente.local`, `ID_ESTENSIONE`: valori di esempio.
- I testi tra virgolette « » sono i messaggi mostrati dall'estensione.

## Rigenerare DOCX e PDF

Requisiti: `pandoc` (≥ 3), Node.js con il pacchetto `playwright` e Chromium.

```bash
cd manuale
./build/build.sh
```

Lo script converte lo schema SVG in PNG, unisce i capitoli, produce
`Manuale-Pseudomania.docx` (con lo stile di `../governance/reference-a4.docx`) e
`Manuale-Pseudomania.pdf` (pandoc → HTML → stampa con Chromium).
Le guide rapide si rigenerano con `./build/build-guide.sh`.
