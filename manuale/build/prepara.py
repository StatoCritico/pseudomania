#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
"""Unisce i capitoli del manuale in un unico Markdown per pandoc.

- aggiunge un identificatore esplicito al titolo di ogni capitolo ({#cap-NN});
- trasforma i collegamenti tra capitoli (NN-nome.md[#...]) in collegamenti interni;
- trasforma gli altri collegamenti relativi (../docs/..., DA-AGGIORNARE.md, ...) in testo
  con il percorso nel repository, perché in DOCX/PDF non sarebbero raggiungibili.
Uso: prepara.py <cartella-manuale> <file-di-uscita>
"""
import re
import sys
from pathlib import Path

CAPITOLI = [
    "00-avvertenze.md",
    "01-come-funziona.md",
    "02-personal-edition.md",
    "03-server-edition.md",
    "04-uso-quotidiano.md",
    "05-creare-una-policy.md",
    "06-risoluzione-problemi.md",
    "07-glossario.md",
    "08-appendice-riferimenti.md",
    "09-avvertenze-finali.md",
]

LINK = re.compile(r"(?<!!)\[([^\]]+)\]\(([^)\s]+)\)")


def ident(nome: str) -> str:
    return "cap-" + nome[:2]


def riscrivi_link(m: re.Match) -> str:
    testo, dest = m.group(1), m.group(2)
    if re.match(r"^[a-z]+:", dest) or dest.startswith("#"):
        return m.group(0)
    file = dest.split("#", 1)[0]
    if file in CAPITOLI:
        return f"[{testo}](#{ident(file)})"
    percorso = dest
    if percorso.startswith("../"):
        percorso = percorso[3:]
    elif not percorso.startswith("manuale/"):
        percorso = "manuale/" + percorso
    if testo.strip("`") == percorso or testo.strip("`") == dest:
        return f"`{percorso}`"
    return f"{testo} (`{percorso}`)"


def main() -> None:
    base = Path(sys.argv[1])
    uscita = Path(sys.argv[2])
    parti = []
    for nome in CAPITOLI:
        testo = (base / nome).read_text(encoding="utf-8")
        righe = testo.splitlines()
        for i, riga in enumerate(righe):
            if riga.startswith("# "):
                righe[i] = f"{riga} {{#{ident(nome)}}}"
                break
        testo = "\n".join(righe)
        # i collegamenti nei blocchi di codice non vanno toccati
        pezzi = re.split(r"(^```.*?^```)", testo, flags=re.S | re.M)
        pezzi = [p if p.startswith("```") else LINK.sub(riscrivi_link, p) for p in pezzi]
        parti.append("".join(pezzi).strip() + "\n")
    uscita.write_text("\n\n".join(parti), encoding="utf-8")


if __name__ == "__main__":
    main()
