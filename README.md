# Pseudomania

Pseudomania sostituisce i dati personali con segnaposto (per esempio `[FULLNAME_1]`) prima che il testo arrivi a
Claude su claude.ai, e rimette i valori reali nelle risposte, solo nel browser di chi scrive. È pensato per le
pubbliche amministrazioni italiane che usano il piano Claude Team e per i professionisti che vogliono
pseudonimizzare in automatico invece che a mano.

Sito: **<https://pseudomania.statocritico.it>**

> **Stato: prima versione, non ancora provata in condizioni reali.** I test automatici passano contro simulazioni di
> claude.ai, del server e di Rizzo-PII. Non usare con dati reali prima della prova tecnica.
>
> Pseudomania è una misura di **mitigazione del rischio**, non una garanzia: non riconosce tutti i dati personali e la
> pseudonimizzazione resta un trattamento di dati personali. La responsabilità legale resta interamente in capo a chi
> adotta e usa il sistema.

## Due edizioni

| | Personal edition | Server edition |
|---|---|---|
| Per chi | Singolo professionista | Ente pubblico (Claude Team) |
| Cosa installare | Estensione Chrome + app desktop di [Rizzo-PII](https://github.com/Rizzo-AI-Academy/rizzo-pii) | Estensione installata d'ufficio + server interno (docker-compose) |
| Attivazione | Pulsante per conversazione | Sempre attiva |
| Dizionario | Nel browser, cifrato | Cifrato nel browser, conservato cifrato sul server, recuperabile dai custodi |

Supporta solo **Google Chrome** e **claude.ai**; ciò che è specifico del sito sta in un modulo adattatore
(`extension/src/sites/`).

## Contenuto del repository

| Cartella | Contenuto |
|---|---|
| [`extension/`](extension/) | Estensione Chrome (entrambe le edizioni), test, simulazioni, script di verifica su claude.ai |
| [`server/`](server/), [`deploy/`](deploy/) | API (FastAPI), stack docker-compose della Server edition, backup, OpenBao |
| [`tools/custodi/`](tools/custodi/) | Strumento offline dei custodi (chiave di custodia divisa con Shamir) |
| [`collaudo/`](collaudo/) | Documenti di prova inventati e script di valutazione |
| [`docs/`](docs/) | Installazione, configurazione, procedure dei custodi, verifica del pilota |
| [`governance/`](governance/) | Regolamento, DPIA, checklist degli adempimenti, verifiche preliminari |
| [`manuale/`](manuale/) | Manuale utente e guide rapide |
| [`site/`](site/) | Sito statico pubblicato su pseudomania.statocritico.it |

Documenti di riferimento: [`DECISIONI.md`](DECISIONI.md) (decisioni vincolanti), [`SPEC.md`](SPEC.md) (contratto
tecnico tra i componenti), [`RIEPILOGO.md`](RIEPILOGO.md) (stato del progetto).

## Per iniziare

- Personal edition: [`docs/installazione-personale.md`](docs/installazione-personale.md)
- Server edition: [`docs/installazione-ente.md`](docs/installazione-ente.md) e
  [`docs/configurazione.md`](docs/configurazione.md)
- Test dell'estensione: `cd extension && npm install && npm run test:all`
- Test del server: `cd server && pip install -r requirements-dev.txt && pytest`

## Licenza

Codice rilasciato con licenza **AGPL-3.0-or-later** ([`LICENSE`](LICENSE)). L'estensione deriva da
[Privacy Guardrail](https://github.com/dfki-dsa/pii-guardrail-browser-extension/) del DFKI (Apache-2.0): vedi
[`extension/NOTICE`](extension/NOTICE). Componenti di terze parti: [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

Segnalazioni: [issue](https://github.com/StatoCritico/pseudomania/issues). Vulnerabilità: vedi [`SECURITY.md`](SECURITY.md).
