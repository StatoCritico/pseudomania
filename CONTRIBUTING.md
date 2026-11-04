# Contribuire

Proposte e correzioni sono benvenute tramite issue e pull request.

- Leggi prima [`DECISIONI.md`](DECISIONI.md) (decisioni vincolanti) e [`SPEC.md`](SPEC.md) (contratto tra estensione e
  server). Un cambiamento al contratto va discusso in una issue prima del codice.
- Testi visibili in italiano; nome del prodotto **Pseudomania**; edizioni **Personal edition** ed **Server edition**.
- Codice nuovo con intestazione `SPDX-License-Identifier: AGPL-3.0-or-later`; solo dipendenze open source con
  licenze compatibili con l'AGPL.
- Esegui i test prima di proporre una modifica (`extension/`: `npm run test:all`; `server/`: `pytest`).
- Mai dati personali reali in test, esempi, schermate o log; mai chiavi o segreti nel repository.
- Per aggiungere un altro chatbot o browser: nuovo adattatore in `extension/src/sites/` e voce in `registry.js`.
