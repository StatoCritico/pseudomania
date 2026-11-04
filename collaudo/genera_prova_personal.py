# SPDX-License-Identifier: AGPL-3.0-or-later
"""Genera i documenti di prova della Personal edition (collaudo/prova-personal/).

Tutti i dati sono INVENTATI e casuali: persone, società, indirizzi, numeri. Codici fiscali,
IBAN, partite IVA e carte di credito superano i controlli di checksum ma non corrispondono a
soggetti reali. Le carte usano prefissi di prova (4111…/5555…), i domini sono example.*,
gli indirizzi IP sono delle reti di documentazione (RFC 5737).

Copre tutti i 24 tag di Rizzo-PII (22 del modello + URL e IPADDR della rete regex),
secondo docs/TASSONOMIA_TAG.md del progetto Rizzo-PII.

Uso:
    python collaudo/genera_prova_personal.py [--seed N]
Richiede: python-docx, openpyxl, reportlab.
"""

from __future__ import annotations

import argparse
import csv
import json
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import genera_corpus as gc  # noqa: E402  (checksum di CF, IBAN e P.IVA)

OUT = Path(__file__).resolve().parent / "prova-personal"

TAGS = ["FULLNAME", "AGE", "GENDER", "DATE", "TIME", "STREET", "BUILDINGNUM", "ZIPCODE", "CITY",
        "PROVINCE", "EMAIL", "TELEPHONENUM", "CF", "PIVA", "ID_DOC", "IBAN", "CREDITCARDNUMBER",
        "AMOUNT", "TARGA", "ORG", "DOCID", "CATASTO", "URL", "IPADDR"]

NOMI_M = ["Lorenzo", "Matteo", "Davide", "Simone", "Federico", "Alessio", "Tommaso", "Riccardo",
          "Gabriele", "Edoardo", "Niccolò", "Pietro", "Jacopo", "Filippo", "Emanuele"]
NOMI_F = ["Giulia", "Chiara", "Sara", "Martina", "Elena", "Alessia", "Francesca", "Beatrice",
          "Ilaria", "Valentina", "Camilla", "Serena", "Noemi", "Arianna", "Ludovica"]
COGNOMI = ["Barbieri", "Fontana", "Moretti", "Galli", "Caruso", "Mancini", "Lombardi", "Ferraro",
           "Testa", "Marchetti", "Bellini", "Gentile", "Cattaneo", "Pellegrini", "Sartori",
           "Valentini", "Farina", "Orlando", "Bernardi", "Monti", "Rinaldi", "Leone", "Martini"]
VIE = ["Via Garibaldi", "Via Mazzini", "Corso Vittorio Emanuele II", "Piazza Cavour", "Via dei Mille",
       "Viale Gramsci", "Via Roma", "Via Saragozza", "Via Indipendenza", "Strada Maggiore",
       "Via San Felice", "Viale Aldo Moro", "Via Dante Alighieri", "Via Emilia Levante"]
COMUNI = [("Bologna", "BO", "40121", "A944"), ("Modena", "MO", "41121", "F257"),
          ("Parma", "PR", "43121", "G337"), ("Ferrara", "FE", "44121", "D548"),
          ("Ravenna", "RA", "48121", "H199"), ("Reggio Emilia", "RE", "42121", "H223"),
          ("Rimini", "RN", "47921", "H294"), ("Forlì", "FC", "47121", "D704"),
          ("Piacenza", "PC", "29121", "G535"), ("Imola", "BO", "40026", "E289")]
SOCIETA = ["Edilnova S.r.l.", "Termotecnica Padana S.p.A.", "Studio Associato Ferri & Lodi",
           "Logistica Appennino S.r.l.s.", "Cooperativa Sociale Il Faro", "Officine Bertoni S.n.c.",
           "Banca Popolare dell'Emilia Esempio", "Assicurazioni Riunite Esempio S.p.A.",
           "Immobiliare Due Torri S.r.l.", "Farmacia Santa Lucia di Rossi e C. S.a.s."]


class Gen:
    def __init__(self, seed: int):
        self.r = random.Random(seed)
        gc.rng.seed(seed)  # anche IBAN e P.IVA del modulo condiviso diventano riproducibili
        self.used = set()

    def persona(self, sesso: str | None = None) -> dict:
        r = self.r
        sesso = sesso or r.choice("MF")
        while True:
            nome = r.choice(NOMI_M if sesso == "M" else NOMI_F)
            cognome = r.choice(COGNOMI)
            if (nome, cognome) not in self.used:
                self.used.add((nome, cognome))
                break
        anno, mese, giorno = r.randint(1950, 2003), r.randint(1, 12), r.randint(1, 28)
        comune = r.choice(COMUNI)
        res = r.choice(COMUNI)
        p = {
            "nome": nome, "cognome": cognome, "fullname": f"{nome} {cognome}",
            "sesso": sesso, "genere": "maschio" if sesso == "M" else "femmina",
            "nascita": f"{giorno:02d}/{mese:02d}/{anno}", "eta": 2026 - anno - (1 if mese > 10 else 0),
            "luogo_nascita": comune[0],
            "cf": gc.codice_fiscale(cognome, nome, anno, mese, giorno, sesso, comune[3]),
            "via": r.choice(VIE), "civico": str(r.randint(1, 180)),
            "cap": res[2], "citta": res[0], "prov": res[1],
            "email": f"{nome[0].lower()}.{cognome.lower()}@example.it",
            "pec": f"{cognome.lower()}.{nome.lower()}@pec.example.it",
            "tel": f"+39 3{r.randint(20, 49)} {r.randint(100, 999)} {r.randint(1000, 9999)}",
            "fisso": f"051 {r.randint(100, 999)} {r.randint(1000, 9999)}",
            "iban": gc.iban_it(),
            "carta": self.carta(),
            "ci": f"C{r.choice('ABCDEFGHJKL')}{r.randint(10000, 99999)}{r.choice('ABCDEFGHJKL')}{r.choice('ABCDEFGHJKL')}",
            "patente": f"{r.choice(['BO', 'MO', 'PR', 'FE'])}{r.randint(1000000, 9999999)}{r.choice('ABCDEFGHJKLMNPRSTUVZ')}",
            "passaporto": f"Y{r.choice('ABCDEFGH')}{r.randint(1000000, 9999999)}",
            "targa": f"{r.choice('BCDEFG')}{r.choice('ABCDEFGHJKLMNPRSTVWXYZ')} {r.randint(100, 999)} "
                     f"{r.choice('ABCDEFGHJKLMNPRSTVWXYZ')}{r.choice('ABCDEFGHJKLMNPRSTVWXYZ')}",
        }
        assert gc.cf_ok(p["cf"]) and gc.iban_ok(p["iban"])
        return p

    def carta(self) -> str:
        r = self.r
        base = [int(c) for c in r.choice(["411111", "555555", "400000"])] + [r.randint(0, 9) for _ in range(9)]
        tot = 0
        for i, d in enumerate(reversed(base)):
            d = d * 2 if i % 2 == 0 else d
            tot += d - 9 if d > 9 else d
        base.append((10 - tot % 10) % 10)
        s = "".join(map(str, base))
        return " ".join(s[i:i + 4] for i in range(0, 16, 4))

    def importo(self, lo=50, hi=90000) -> str:
        v = self.r.randint(lo * 100, hi * 100) / 100
        intero, dec = f"{v:.2f}".split(".")
        intero = f"{int(intero):,}".replace(",", ".")
        return f"€ {intero},{dec}"

    def data(self, anno=2026) -> str:
        return f"{self.r.randint(1, 28):02d}/{self.r.randint(1, 12):02d}/{anno}"

    def ora(self) -> str:
        return f"ore {self.r.randint(8, 19):02d}:{self.r.choice(['00', '15', '30', '45'])}"

    def piva(self) -> str:
        p = gc.partita_iva()
        assert gc.piva_ok(p)
        return p

    def rg(self) -> str:
        return f"{self.r.randint(1000, 19999)}/{self.r.choice([2024, 2025, 2026])}"

    def catasto(self) -> str:
        return f"Foglio {self.r.randint(1, 250)}, particella {self.r.randint(10, 2999)}, sub. {self.r.randint(1, 40)}"

    def ip(self) -> str:
        return self.r.choice(["192.0.2.", "198.51.100.", "203.0.113."]) + str(self.r.randint(2, 254))


# ---------------------------------------------------------------------------------------------
def scrivi(path: Path, testo: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(testo, encoding="utf-8")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=20261104)
    a = ap.parse_args()
    g = Gen(a.seed)
    if OUT.exists():
        for f in sorted(OUT.rglob("*"), reverse=True):
            f.unlink() if f.is_file() else f.rmdir()
    OUT.mkdir(parents=True, exist_ok=True)
    attesi = {}

    # ----- persone e soggetti comuni -----
    cli = g.persona("F")            # cliente
    contro = g.persona("M")         # controparte
    avv = g.persona("M")            # avvocato
    giudice = g.persona("F")
    teste = g.persona("M")
    soc = g.r.sample(SOCIETA, 4)
    piva_soc = [g.piva() for _ in soc]
    importi = [g.importo() for _ in range(6)]
    rg = g.rg()
    cat = g.catasto()
    ip = g.ip()
    url = f"https://www.{cli['cognome'].lower()}-consulenze.example.it/area-clienti"
    data_atto, data_fatto = g.data(), g.data(2025)
    ora_fatto = g.ora()

    # ===== 01 – testo con tutti i 24 tag =====
    t01 = f"""Oggetto: pratica di risarcimento – cliente {cli['fullname']}

Gentile collega,
ti riepilogo i dati della pratica che ho aperto il {data_atto} per la signora {cli['fullname']}, {cli['genere']}, {cli['eta']} anni, nata a {cli['luogo_nascita']} il {cli['nascita']}, codice fiscale {cli['cf']}, residente in {cli['via']} {cli['civico']}, {cli['cap']} {cli['citta']} ({cli['prov']}).
Recapiti: telefono {cli['tel']}, email {cli['email']}, PEC {cli['pec']}.
Documento di identità: carta d'identità n. {cli['ci']}; patente n. {cli['patente']}.

Il sinistro è avvenuto il {data_fatto} alle {ora_fatto}: il veicolo targato {contro['targa']}, condotto dal signor {contro['fullname']} (CF {contro['cf']}), dipendente della società {soc[0]} (P.IVA {piva_soc[0]}), ha urtato l'auto della cliente, targa {cli['targa']}.
La causa è iscritta al n. R.G. {rg} del Tribunale di Bologna, giudice dott.ssa {giudice['fullname']}; testimone il signor {teste['fullname']}, telefono {teste['tel']}.

Danni richiesti: {importi[0]} per il veicolo e {importi[1]} per le lesioni. Il risarcimento va accreditato sull'IBAN {cli['iban']} intestato alla cliente. Le spese anticipate sono state pagate con la carta {cli['carta']}.
L'immobile della cliente, danneggiato dal cantiere della società {soc[1]}, è censito al catasto fabbricati di {cli['citta']}, {cat}.

La cliente ha inviato i documenti dal portale {url}; l'accesso risulta dall'indirizzo IP {ip}.

Un saluto,
avv. {avv['fullname']}
"""
    scrivi(OUT / "01_lettera_tutti_i_tag.txt", t01)
    attesi["01_lettera_tutti_i_tag.txt"] = {
        "FULLNAME": [cli["fullname"], contro["fullname"], giudice["fullname"], teste["fullname"], avv["fullname"]],
        "GENDER": [cli["genere"]], "AGE": [f"{cli['eta']} anni"], "DATE": [data_atto, cli["nascita"], data_fatto],
        "TIME": [ora_fatto], "STREET": [cli["via"]], "BUILDINGNUM": [cli["civico"]], "ZIPCODE": [cli["cap"]],
        "CITY": [cli["citta"], cli["luogo_nascita"]], "PROVINCE": [cli["prov"]],
        "EMAIL": [cli["email"], cli["pec"]], "TELEPHONENUM": [cli["tel"], teste["tel"]],
        "CF": [cli["cf"], contro["cf"]], "PIVA": [piva_soc[0]], "ID_DOC": [cli["ci"], cli["patente"]],
        "IBAN": [cli["iban"]], "CREDITCARDNUMBER": [cli["carta"]], "AMOUNT": importi[:2],
        "TARGA": [contro["targa"], cli["targa"]], "ORG": [soc[0], soc[1]], "DOCID": [rg],
        "CATASTO": [cat], "URL": [url], "IPADDR": [ip],
        "NON_MASCHERARE": ["Tribunale di Bologna"],
    }

    # ===== 02 – scheda cliente in Markdown =====
    p2 = g.persona()
    imp2 = g.importo(100, 5000)
    t02 = f"""# Scheda cliente

| Campo | Valore |
|---|---|
| Nome e cognome | {p2['fullname']} |
| Sesso | {p2['sesso']} |
| Età | {p2['eta']} anni |
| Data di nascita | {p2['nascita']} |
| Codice fiscale | {p2['cf']} |
| Indirizzo | {p2['via']} {p2['civico']}, {p2['cap']} {p2['citta']} ({p2['prov']}) |
| Telefono | {p2['tel']} |
| Email | {p2['email']} |
| Passaporto | {p2['passaporto']} |
| IBAN | {p2['iban']} |
| Carta di credito | {p2['carta']} |
| Targa | {p2['targa']} |
| Onorario concordato | {imp2} |

## Note
Il cliente lavora per **{soc[2]}** (P.IVA {piva_soc[2]}). Appuntamento fissato il {g.data()} alle {g.ora()}.
"""
    scrivi(OUT / "02_scheda_cliente.md", t02)
    attesi["02_scheda_cliente.md"] = {"FULLNAME": [p2["fullname"]], "CF": [p2["cf"]], "IBAN": [p2["iban"]],
                                       "ID_DOC": [p2["passaporto"]], "ORG": [soc[2]], "PIVA": [piva_soc[2]]}

    # ===== 03 – CSV anagrafica =====
    righe = [g.persona() for _ in range(12)]
    with (OUT / "03_anagrafica_clienti.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["Nome", "Cognome", "Sesso", "Nascita", "Codice fiscale", "Indirizzo", "CAP", "Città",
                    "Prov", "Telefono", "Email", "IBAN", "Ultimo pagamento", "Data pagamento"])
        for p in righe:
            w.writerow([p["nome"], p["cognome"], p["sesso"], p["nascita"], p["cf"], f"{p['via']} {p['civico']}",
                        p["cap"], p["citta"], p["prov"], p["tel"], p["email"], p["iban"], g.importo(20, 3000), g.data()])
    attesi["03_anagrafica_clienti.csv"] = {"righe": len(righe), "CF": [p["cf"] for p in righe], "IBAN": [p["iban"] for p in righe]}

    # ===== 04 – atto di citazione DOCX =====
    from docx import Document
    from docx.shared import Pt
    d = Document()
    st = d.styles["Normal"]; st.font.name = "Times New Roman"; st.font.size = Pt(12)
    d.sections[0].header.paragraphs[0].text = f"Studio Legale {avv['cognome']} – avv. {avv['fullname']} – {avv['pec']}"
    d.sections[0].footer.paragraphs[0].text = f"R.G. {rg} – pag. 1"
    d.add_heading("TRIBUNALE ORDINARIO DI BOLOGNA", 1)
    d.add_heading("Atto di citazione", 2)
    d.add_paragraph(
        f"La signora {cli['fullname']}, nata a {cli['luogo_nascita']} il {cli['nascita']}, C.F. {cli['cf']}, residente in "
        f"{cli['citta']} ({cli['prov']}), {cli['via']} {cli['civico']}, rappresentata e difesa dall'avv. {avv['fullname']} "
        f"(C.F. {avv['cf']}, PEC {avv['pec']}, fax {avv['fisso']}),")
    d.add_paragraph("CITA").alignment = 1
    pr = d.add_paragraph()
    pr.add_run(f"la società {soc[1]}, P.IVA {piva_soc[1]}, in persona del legale rappresentante pro tempore sig. ")
    run = pr.add_run(contro["fullname"]); run.bold = True  # nome in grassetto: testo spezzato su più run
    pr.add_run(f", con sede in {contro['via']} {contro['civico']}, {contro['cap']} {contro['citta']},")
    d.add_paragraph(
        f"a comparire all'udienza del {g.data()} alle {g.ora()}, davanti al giudice designato, per sentir accogliere le "
        f"seguenti conclusioni: condannare la convenuta al pagamento di {importi[2]} oltre interessi.")
    d.add_heading("Fatto", 3)
    for txt in [
        f"In data {data_fatto} i lavori eseguiti dalla convenuta hanno causato infiltrazioni nell'immobile censito al {cat}.",
        f"La perizia del geom. {teste['fullname']} (tel. {teste['tel']}) quantifica il danno in {importi[3]}.",
        f"Il pagamento andrà effettuato sul conto IBAN {cli['iban']} presso {soc[3]}.",
    ]:
        d.add_paragraph(txt, style="List Number")
    d.add_heading("Prospetto dei danni", 3)
    tb = d.add_table(rows=1, cols=3); tb.style = "Table Grid"
    for c, h in zip(tb.rows[0].cells, ["Voce", "Riferimento", "Importo"]):
        c.text = h
    for voce, rif, imp in [("Ripristino intonaci", f"Fattura n. {g.rg()}", importi[4]),
                           ("Mobili danneggiati", f"Preventivo {soc[0]}", importi[5]),
                           ("Alloggio temporaneo", f"Ricevuta del {g.data()}", g.importo(300, 4000))]:
        row = tb.add_row().cells
        row[0].text, row[1].text, row[2].text = voce, rif, imp
    d.add_paragraph(f"Bologna, {data_atto}")
    d.add_paragraph(f"avv. {avv['fullname']}")
    d.save(OUT / "04_atto_citazione.docx")
    attesi["04_atto_citazione.docx"] = {
        "FULLNAME": [cli["fullname"], avv["fullname"], contro["fullname"], teste["fullname"]],
        "note": "nome della controparte in grassetto (run separato); dati anche in intestazione, piè di pagina, elenco numerato e tabella",
        "NON_MASCHERARE": ["TRIBUNALE ORDINARIO DI BOLOGNA"],
    }

    # ===== 05 – prospetto pagamenti XLSX =====
    from openpyxl import Workbook
    from openpyxl.styles import Font
    wb = Workbook()
    ws = wb.active; ws.title = "Clienti"
    ws.append(["Cliente", "Codice fiscale", "Email", "Telefono", "IBAN", "Carta", "Targa", "Note"])
    for c in ws[1]:
        c.font = Font(bold=True)
    clienti = [g.persona() for _ in range(8)]
    for p in clienti:
        ws.append([p["fullname"], p["cf"], p["email"], p["tel"], p["iban"], p["carta"], p["targa"],
                   f"Residente in {p['via']} {p['civico']}, {p['citta']}"])
    ws2 = wb.create_sheet("Movimenti")
    ws2.append(["Data", "Ora", "Cliente", "Causale", "Importo (€)", "Rif. pratica"])
    for c in ws2[1]:
        c.font = Font(bold=True)
    for i in range(15):
        p = g.r.choice(clienti)
        ws2.append([g.data(), g.ora().replace("ore ", ""), p["fullname"], f"Acconto pratica di {p['cognome']}",
                    round(g.r.uniform(80, 6000), 2), g.rg()])
    ws2.append([None, None, None, "TOTALE", "=SUM(E2:E16)", None])
    ws3 = wb.create_sheet("Fornitori")
    ws3.append(["Ragione sociale", "P.IVA", "Referente", "PEC", "Sito"])
    for s, pv in zip(soc, piva_soc):
        ref = g.persona()
        ws3.append([s, pv, ref["fullname"], ref["pec"], f"https://www.example.it/{s.split()[0].lower()}"])
    wb.save(OUT / "05_prospetto_pagamenti.xlsx")
    attesi["05_prospetto_pagamenti.xlsx"] = {"fogli": ["Clienti", "Movimenti", "Fornitori"],
                                              "note": "la formula =SUM del totale deve restare una formula",
                                              "FULLNAME": [p["fullname"] for p in clienti]}

    # ===== 06 – verbale di sinistro PDF =====
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table
    ss = getSampleStyleSheet()
    cond2 = g.persona()
    polizza = f"Polizza n. {g.r.randint(10000000, 99999999)}"
    el = [Paragraph("Constatazione amichevole di incidente – verbale", ss["Title"]),
          Paragraph(f"Data {data_fatto}, {ora_fatto}, in {cli['via']} all'altezza del civico {cli['civico']}, {cli['citta']}.", ss["Normal"]),
          Spacer(1, 10),
          Table([["", "Veicolo A", "Veicolo B"],
                 ["Conducente", cli["fullname"], cond2["fullname"]],
                 ["Codice fiscale", cli["cf"], cond2["cf"]],
                 ["Patente", cli["patente"], cond2["patente"]],
                 ["Targa", cli["targa"], cond2["targa"]],
                 ["Telefono", cli["tel"], cond2["tel"]],
                 ["Assicurazione", soc[3], "Assicurazioni Riunite Esempio S.p.A."],
                 ["Contratto", polizza, f"Polizza n. {g.r.randint(10000000, 99999999)}"]],
                style=[("GRID", (0, 0), (-1, -1), 0.5, (0.5, 0.5, 0.5))]),
          Spacer(1, 10),
          Paragraph(f"Il conducente del veicolo B, {cond2['fullname']}, {cond2['eta']} anni, dichiara di essere residente in "
                    f"{cond2['via']} {cond2['civico']}, {cond2['cap']} {cond2['citta']} ({cond2['prov']}), email {cond2['email']}.", ss["Normal"]),
          Paragraph(f"Danno stimato: {g.importo(500, 9000)}. Rimborso su IBAN {cond2['iban']}.", ss["Normal"])]
    SimpleDocTemplate(str(OUT / "06_verbale_sinistro.pdf"), pagesize=A4).build(el)
    attesi["06_verbale_sinistro.pdf"] = {"FULLNAME": [cli["fullname"], cond2["fullname"]], "TARGA": [cli["targa"], cond2["targa"]],
                                         "ID_DOC": [cli["patente"], cond2["patente"]], "DOCID": [polizza]}

    # ===== 07 – categorie particolari: deve essere BLOCCATO =====
    p7 = g.persona()
    scrivi(OUT / "07_blocco_dati_sanitari.txt",
           f"Certificato per la pratica di invalidità del signor {p7['fullname']} (CF {p7['cf']}): il paziente è affetto da "
           f"diabete mellito di tipo 1 ed è in cura presso il centro di salute mentale per un disturbo depressivo maggiore. "
           f"Assume insulina e antidepressivi. Riconosciuta invalidità civile al 75% e disabilità ai sensi della legge 104/1992.\n")
    p7b = g.persona()
    scrivi(OUT / "07b_blocco_dati_giudiziari.txt",
           f"Il signor {p7b['fullname']}, nato il {p7b['nascita']}, risulta condannato con sentenza irrevocabile per furto "
           f"aggravato e ha precedenti penali iscritti nel casellario giudiziale.\n")
    attesi["07_blocco_dati_sanitari.txt"] = {"atteso": "invio BLOCCATO (art. 9 GDPR, dati sanitari e disabilità)"}
    attesi["07b_blocco_dati_giudiziari.txt"] = {"atteso": "invio BLOCCATO (art. 10 GDPR, condanne penali)"}

    # ===== 08 – trappole: termini da non mascherare, omonimie, ripetizioni =====
    scrivi(OUT / "08_trappole.txt", f"""Nota interna sull'uso di Claude e Rizzo-PII nello studio.

Usiamo Claude di Anthropic con Pseudomania e Rizzo-PII, nel rispetto del GDPR e dell'AI Act. La circolare del Tribunale di Bologna e il d.lgs. 196/2003 restano i riferimenti.

Il signor Rizzo, nostro cliente, non c'entra con Rizzo-PII. La signora {cli['fullname']} ha chiamato tre volte: {cli['fullname']} chiede notizie; ricordarsi di richiamare {cli['nome']} {cli['cognome']} entro venerdì. Anche la sorella, {cli['nome'][0]}. {cli['cognome']}, è cliente.

Codice fiscale scritto con spazi: {' '.join([cli['cf'][i:i+4] for i in range(0, 16, 4)])}. IBAN con spazi: {' '.join([cli['iban'][i:i+4] for i in range(0, 27, 4)])}.
Telefono senza prefisso: {cli['tel'][4:]}. Email in maiuscolo: {cli['email'].upper()}.
Versione del software: 2.3.55.987 (non è un indirizzo IP).
""")
    attesi["08_trappole.txt"] = {
        "NON_MASCHERARE": ["Claude", "Anthropic", "Pseudomania", "Rizzo-PII", "GDPR", "AI Act", "Tribunale di Bologna",
                           "d.lgs. 196/2003", "2.3.55.987"],
        "da_mascherare": ["Rizzo (cognome del cliente)", cli["fullname"] + " (sempre lo stesso segnaposto)",
                          "CF e IBAN con spazi", "email in maiuscolo"],
    }

    # ===== 09 – richiesta di risposta lunga =====
    scrivi(OUT / "09_richiesta_risposta_lunga.txt", f"""Prepara una tabella riassuntiva con una riga per ciascuna di queste persone, con le colonne Nome, Codice fiscale, IBAN, Città, Telefono. Poi scrivi per ognuna un paragrafo di tre righe che ripete nome e codice fiscale. Infine elenca tutti gli IBAN in un blocco di codice.

{chr(10).join(f"- {p['fullname']}, CF {p['cf']}, IBAN {p['iban']}, {p['citta']}, tel. {p['tel']}" for p in righe[:8])}
""")
    attesi["09_richiesta_risposta_lunga.txt"] = {"atteso": "nella risposta tutti i segnaposto tornano valori reali, anche in tabella e nel blocco di codice"}

    (OUT / "valori_attesi.json").write_text(json.dumps(attesi, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Generati {len(list(OUT.iterdir()))} file in {OUT}")


if __name__ == "__main__":
    main()
