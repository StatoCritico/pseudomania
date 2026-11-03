# SPDX-License-Identifier: AGPL-3.0-or-later
"""Genera il corpus sintetico di collaudo di Pseudomania (collaudo/corpus/).

Tutti i documenti sono INVENTATI: persone, indirizzi, numeri, ditte e l'ente
("Comune di Esempio") non esistono. Codici fiscali, IBAN e partite IVA sono generati
con gli algoritmi ufficiali di controllo (carattere di controllo del CF, CIN e
check digit ISO 13616 dell'IBAN, cifra di controllo della P.IVA), quindi superano le
verifiche di checksum, ma non corrispondono a soggetti reali (i nomi sono inventati
e le combinazioni casuali). I codici catastali dei comuni (es. H501) sono pubblici.

Uso:
    python collaudo/genera_corpus.py            # rigenera collaudo/corpus/
Richiede: python-docx, openpyxl, reportlab (facoltativo, per i PDF).

Verità di riferimento (file *.json accanto a ogni documento, indice in manifest.json):
  - testi:  {"text": ..., "entities": [{"start","end","text","type","action"}]}
            con offset sul testo esatto del file .txt (UTF-8);
  - DOCX/XLSX/PDF: {"values": [{"text","type","action","where"}]} (a livello di valore);
  - "expected": "pseudonymize" | "block"; per i blocchi "block_category" e "article".
Azioni:
  mask    va sostituito con un segnaposto
  allow   NON deve essere sostituito (allowlist: ente, uffici, istituzioni, norme)
  ignore  neutro: sostituirlo o no è accettabile (es. date e numeri di atti pubblici,
          importi di contributi pubblici); non conta né per la recall né come errore.
I nomi dei funzionari pubblici citati per ruolo (Sindaco, RUP, dirigenti) sono comunque
dati personali: azione "mask" (l'allowlist non deve mai contenere nomi di persone).
"""

from __future__ import annotations

import io
import json
import random
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent / "corpus"
rng = random.Random(20261031)

# --------------------------------------------------------------------------- #
# Codici con checksum valido
# --------------------------------------------------------------------------- #
_ODD = {**{str(i): v for i, v in enumerate([1, 0, 5, 7, 9, 13, 15, 17, 19, 21])},
        **dict(zip("ABCDEFGHIJKLMNOPQRSTUVWXYZ",
                   [1, 0, 5, 7, 9, 13, 15, 17, 19, 21, 2, 4, 18, 20, 11, 3, 6, 8, 12, 14,
                    16, 10, 22, 25, 24, 23]))}
_EVEN = {**{str(i): i for i in range(10)}, **{c: i for i, c in enumerate("ABCDEFGHIJKLMNOPQRSTUVWXYZ")}}
_MONTHS = "ABCDEHLMPRST"
_VOW = set("AEIOU")


def _cons_vow(s: str) -> tuple[str, str]:
    s = re.sub(r"[^A-Z]", "", s.upper())
    return "".join(c for c in s if c not in _VOW), "".join(c for c in s if c in _VOW)


def _surname_code(s: str) -> str:
    c, v = _cons_vow(s)
    return (c + v + "XXX")[:3]


def _name_code(s: str) -> str:
    c, v = _cons_vow(s)
    if len(c) >= 4:
        c = c[0] + c[2] + c[3]
    return (c + v + "XXX")[:3]


def codice_fiscale(cognome: str, nome: str, anno: int, mese: int, giorno: int, sesso: str,
                   belfiore: str) -> str:
    base = (_surname_code(cognome) + _name_code(nome) + f"{anno % 100:02d}" + _MONTHS[mese - 1]
            + f"{giorno + (40 if sesso == 'F' else 0):02d}" + belfiore)
    tot = sum(_ODD[ch] if i % 2 == 0 else _EVEN[ch] for i, ch in enumerate(base))
    return base + chr(ord("A") + tot % 26)


def cf_ok(cf: str) -> bool:
    tot = sum(_ODD[ch] if i % 2 == 0 else _EVEN[ch] for i, ch in enumerate(cf[:15]))
    return cf[15] == chr(ord("A") + tot % 26)


def _cin(abi: str, cab: str, conto: str) -> str:
    odd = [1, 0, 5, 7, 9, 13, 15, 17, 19, 21, 2, 4, 18, 20, 11, 3, 6, 8, 12, 14, 16, 10, 22, 25, 24, 23]
    s = 0
    for i, ch in enumerate(abi + cab + conto):
        v = int(ch) if ch.isdigit() else ord(ch) - 65
        s += odd[v] if i % 2 == 0 else v
    return chr(65 + s % 26)


def iban_it() -> str:
    abi = f"{rng.randint(1000, 9999):05d}"
    cab = f"{rng.randint(10000, 99999):05d}"
    conto = f"{rng.randint(0, 10**12 - 1):012d}"
    bban = _cin(abi, cab, conto) + abi + cab + conto
    num = "".join(str(int(c, 36)) for c in bban + "IT00")
    check = 98 - int(num) % 97
    return f"IT{check:02d}{bban}"


def iban_ok(iban: str) -> bool:
    s = iban[4:] + iban[:4]
    return int("".join(str(int(c, 36)) for c in s)) % 97 == 1


def partita_iva() -> str:
    d = [rng.randint(0, 9) for _ in range(7)] + [int(x) for x in f"{rng.randint(1, 100):03d}"]
    s = 0
    for i, x in enumerate(d):
        if i % 2 == 0:
            s += x
        else:
            y = x * 2
            s += y - 9 if y > 9 else y
    return "".join(map(str, d)) + str((10 - s % 10) % 10)


def piva_ok(p: str) -> bool:
    s = 0
    for i, ch in enumerate(p[:10]):
        x = int(ch)
        if i % 2 == 0:
            s += x
        else:
            y = x * 2
            s += y - 9 if y > 9 else y
    return (10 - s % 10) % 10 == int(p[10])


# --------------------------------------------------------------------------- #
# Persone e soggetti inventati
# --------------------------------------------------------------------------- #
P = {
    # chiave: (nome, cognome, anno, mese, giorno, sesso, belfiore)
    "sindaco": ("Carlo", "Ferretti", 1968, 4, 9, "M", "H501"),
    "assessore": ("Lucia", "Montanari", 1975, 11, 23, "F", "F205"),
    "segretario": ("Paolo", "Cavallini", 1962, 2, 14, "M", "L219"),
    "rup": ("Giovanna", "Marchetti", 1979, 7, 2, "F", "H501"),
    "dirigente": ("Stefano", "Orlandini", 1970, 5, 30, "M", "A944"),
    "cittadino1": ("Antonio", "Esposito", 1984, 3, 17, "M", "F839"),
    "cittadina2": ("Rosa", "Bianco", 1991, 8, 5, "F", "L219"),          # nomi = parole comuni
    "cittadino3": ("Leone", "Fortunato", 1958, 12, 1, "M", "F839"),     # nomi = parole comuni
    "cittadina4": ("Marina", "Serra", 1987, 6, 21, "F", "G273"),        # nomi = parole comuni
    "cittadino5": ("Giuseppe", "Lombardo", 1949, 10, 11, "M", "C351"),
    "membro1": ("Elena", "Rinaldi", 1981, 1, 28, "F", "H501"),
    "membro2": ("Marco", "De Santis", 1976, 9, 3, "M", "H501"),
    "impiegata": ("Chiara", "Benedetti", 1990, 4, 15, "F", "D612"),
    "impiegato": ("Davide", "Galli", 1985, 2, 6, "M", "D612"),
    "inquilino": ("Francesca", "Testa", 1993, 7, 19, "F", "A662"),
    "locatore": ("Roberto", "Villa", 1955, 3, 8, "M", "F205"),
    "dipendente": ("Sara", "Colombo", 1988, 5, 25, "F", "H501"),
    "candidato": ("Alessio", "Ruggeri", 1983, 11, 2, "M", "H501"),
}
NOME = {k: f"{v[0]} {v[1]}" for k, v in P.items()}
CF = {k: codice_fiscale(v[1], v[0], *v[2:]) for k, v in P.items()}
IBAN = {k: iban_it() for k in ("assoc", "cittadino1", "beneficiari1", "beneficiari2", "beneficiari3",
                                  "locatore", "fornitore1", "fornitore2")}
PIVA = {k: partita_iva() for k in ("edilverde", "fornitore1", "fornitore2", "fornitore3")}
for c in CF.values():
    assert cf_ok(c), c
for i in IBAN.values():
    assert iban_ok(i), i
for p in PIVA.values():
    assert piva_ok(p), p


# --------------------------------------------------------------------------- #
# Mini-linguaggio dei modelli: [[TIPO|testo]] = mask, [[=TIPO|testo]] = allow,
# [[~TIPO|testo]] = ignore
# --------------------------------------------------------------------------- #
_MARK = re.compile(r"\[\[([=~]?)([A-Z_]+)\|(.+?)\]\]")
ACTION = {"": "mask", "=": "allow", "~": "ignore"}


def render(template: str) -> tuple[str, list[dict]]:
    out, ents, pos = [], [], 0
    cur = 0
    for m in _MARK.finditer(template):
        out.append(template[pos:m.start()])
        cur += m.start() - pos
        val = m.group(3)
        ents.append({"start": cur, "end": cur + len(val), "text": val, "type": m.group(2),
                     "action": ACTION[m.group(1)]})
        out.append(val)
        cur += len(val)
        pos = m.end()
    out.append(template[pos:])
    text = "".join(out)
    for e in ents:
        assert text[e["start"]:e["end"]] == e["text"]
    return text, ents


def N(k):  # nome da mascherare
    return f"[[FULLNAME|{NOME[k]}]]"


ENTE = "[[=ORG|Comune di Esempio]]"

# --------------------------------------------------------------------------- #
# Testi
# --------------------------------------------------------------------------- #
TESTI = {
    "01_delibera_giunta": dict(kind="delibera", expected="pseudonymize", t=f"""\
[[=ORG|COMUNE DI ESEMPIO]]
DELIBERAZIONE DELLA GIUNTA COMUNALE N. [[~DOCID|87/2026]] DEL [[~DATE|14 ottobre 2026]]

OGGETTO: Concessione di un contributo straordinario all'associazione [[ORG|Amici del Borgo APS]].

L'anno duemilaventisei, il giorno quattordici del mese di ottobre, alle ore [[~TIME|17:30]], nella sede
del {ENTE}, si è riunita la Giunta comunale. Presiede il Sindaco, {N('sindaco')}; partecipa il
Segretario generale, dott. {N('segretario')}, che cura la verbalizzazione.

LA GIUNTA COMUNALE
Vista la domanda presentata il [[~DATE|2 settembre 2026]] (prot. n. [[~DOCID|11452]]) dal legale
rappresentante dell'associazione, sig.ra {N('membro1')},
residente in [[STREET|via Roma]] [[BUILDINGNUM|18]], [[ZIPCODE|00185]] [[CITY|Roma]];
Visto il parere favorevole dell'[[=ORG|Ufficio Protocollo]] e dei [[=ORG|Servizi Demografici]];
Visto il [[=ORG|Testo unico degli enti locali]] e la [[=ORG|legge 241/1990]];

DELIBERA
di concedere un contributo di [[~AMOUNT|€ 2.500,00]] da accreditare sul conto IBAN
[[IBAN|{IBAN['assoc']}]] intestato all'associazione, codice fiscale del legale rappresentante
[[CF|{CF['membro1']}]]. Relatrice l'assessora {N('assessore')}.
"""),
    "02_determina_dirigenziale": dict(kind="determina", expected="pseudonymize", t=f"""\
{ENTE} - Settore Lavori Pubblici
DETERMINAZIONE DIRIGENZIALE N. [[~DOCID|312]] DEL [[~DATE|20/10/2026]]

OGGETTO: Affidamento diretto dei lavori di manutenzione della scuola primaria alla ditta
[[ORG|Edilverde S.r.l.]] (P.IVA [[PIVA|{PIVA['edilverde']}]]). CIG [[~DOCID|B1A2C3D4E5]].

IL DIRIGENTE
Richiamato il [[=ORG|Codice dei contratti pubblici]] ([[=ORG|d.lgs. 36/2023]]);
Dato atto che il Responsabile unico del progetto è l'arch. {N('rup')}, tel. [[TELEPHONENUM|+39 06 5551234]],
email [[EMAIL|g.marchetti@comune.esempio.it]];
Considerato che l'offerta della ditta, sottoscritta dall'amministratore unico {N('cittadino5')},
ammonta a [[~AMOUNT|€ 38.400,00]] oltre IVA;

DETERMINA
di affidare i lavori alla ditta sopra indicata, con sede in [[STREET|via delle Industrie]]
[[BUILDINGNUM|7]], [[ZIPCODE|20121]] [[CITY|Milano]] ([[PROVINCE|MI]]).

Il Dirigente del Settore
{N('dirigente')}
"""),
    "03_lettera_tari": dict(kind="lettera", expected="pseudonymize", t=f"""\
{ENTE}
[[=ORG|Ufficio Tributi]]

Gentile sig. {N('cittadino1')}
[[STREET|Via dei Mille]] [[BUILDINGNUM|12]]
[[ZIPCODE|80121]] [[CITY|Napoli]] ([[PROVINCE|NA]])
Codice fiscale: [[CF|{CF['cittadino1']}]]

Oggetto: avviso di pagamento TARI 2026

Gentile contribuente, dalle verifiche risulta un importo dovuto di [[AMOUNT|€ 312,40]] per l'immobile
che lei occupa al secondo piano dello stabile di [[STREET|via dei Mille]], dove abita dal
[[DATE|3 marzo 2019]] insieme alla moglie. Può pagare con [[=ORG|PagoPA]] oppure con bonifico, indicando
come causale il suo codice fiscale. Per il rimborso dell'anno precedente indichi l'IBAN
[[IBAN|{IBAN['cittadino1']}]] già comunicato.

Per informazioni può rivolgersi all'[[=ORG|Ufficio Relazioni con il Pubblico]].
Distinti saluti.
La funzionaria responsabile, {N('impiegata')}
"""),
    "04_risposta_accesso_atti": dict(kind="lettera", expected="pseudonymize", t=f"""\
{ENTE} - [[=ORG|Segreteria Generale]]
Prot. n. [[~DOCID|15873/2026]]

Alla sig.ra {N('cittadina4')}
PEC: [[EMAIL|marina.serra@pec.example.it]]

Oggetto: istanza di accesso documentale del [[~DATE|10/10/2026]]

In riscontro alla sua istanza ai sensi della [[=ORG|legge 241/1990]], si comunica che i documenti
richiesti relativi alla pratica edilizia del fabbricato censito al catasto [[CATASTO|foglio 12, particella 345, sub. 6]]
saranno disponibili presso l'[[=ORG|URP]] dal [[~DATE|5 novembre 2026]].
Il controinteressato, sig. {N('cittadino3')}, è stato informato e non si è opposto.
Il Segretario generale
{N('segretario')}
"""),
    "05_verbale_commissione": dict(kind="verbale", expected="pseudonymize", t=f"""\
VERBALE DELLA COMMISSIONE GIUDICATRICE - SEDUTA DEL [[~DATE|21 ottobre 2026]]

Alle ore [[~TIME|9:30]] si riunisce, presso la sala consiliare del {ENTE}, la commissione per la
selezione di un istruttore amministrativo. Sono presenti: {N('dirigente')} (presidente),
{N('membro1')} e {N('membro2')} (componenti), {N('impiegato')} (segretario verbalizzante).

La commissione esamina la candidatura di {N('candidato')}, nato a [[CITY|Roma]] il [[DATE|02/11/1983]],
di [[AGE|42 anni]], e della candidata {N('cittadina2')}. Il candidato [[FULLNAME|Ruggeri]] ottiene 27/30.
Il presidente ringrazia la candidata [[FULLNAME|Bianco]] per la puntualità. La seduta termina alle ore [[~TIME|12:45]].
"""),
    "06_email_ufficio": dict(kind="email", expected="pseudonymize", t=f"""\
Da: {N('impiegata')} <[[EMAIL|c.benedetti@comune.esempio.it]]>
A: {N('impiegato')} <[[EMAIL|d.galli@comune.esempio.it]]>
Oggetto: richiesta della sig.ra [[FULLNAME|Bianco]]

Ciao [[FULLNAME|Davide]],
ha chiamato {N('cittadina2')} ([[TELEPHONENUM|347 1234567]]) per il cambio di residenza: si trasferisce
in [[STREET|corso Vittorio Emanuele II]] [[BUILDINGNUM|45]], interno 3. Le ho detto di passare ai
[[=ORG|Servizi Demografici]] martedì. Ha chiesto anche di {N('cittadino3')}, il vicino, che deve
ritirare la [[=ORG|CIE]]: il numero della vecchia carta è [[ID_DOC|CA12345AB]].

P.S. la rosa dei candidati per il bando è pronta; il modulo bianco va in archivio.
[[FULLNAME|Chiara]]
"""),
    "07_segnalazione_cittadino": dict(kind="email", expected="pseudonymize", t=f"""\
Buongiorno,
sono {N('cittadino5')}, abito in [[STREET|via Garibaldi]] [[BUILDINGNUM|3]] a [[CITY|Torino]] e vi scrivo
per segnalare una buca pericolosa davanti al civico 10. Ieri sera alle [[~TIME|21:15]] l'auto di mio figlio,
targa [[TARGA|GH 482 KL]], ha subito danni. Potete contattarmi al [[TELEPHONENUM|+39 333 9876543]] o
all'indirizzo [[EMAIL|g.lombardo49@example.com]]. Ho [[AGE|77 anni]] e non posso venire in ufficio.
Cordiali saluti
"""),
    "08_avviso_pubblico": dict(kind="avviso", expected="pseudonymize", t=f"""\
{ENTE} - AVVISO PUBBLICO

Si informa la cittadinanza che dal 1° dicembre l'[[=ORG|Ufficio Protocollo]] e l'[[=ORG|Ufficio Relazioni con il Pubblico]]
osserveranno il nuovo orario. Le istanze possono essere inviate via [[=ORG|PEC]] o tramite [[=ORG|SPID]].
L'avviso è pubblicato all'[[=ORG|Albo pretorio]] e nella sezione [[=ORG|Amministrazione trasparente]],
ai sensi del [[=ORG|d.lgs. 33/2013]] e del [[=ORG|Regolamento (UE) 2016/679]].
Nel giardino comunale fiorisce la rosa antica; la fontana del leone e il muro bianco della marina
saranno restaurati con fondi della [[=ORG|Unione Europea]].
"""),
    "09_contratto_locazione": dict(kind="contratto", expected="pseudonymize", t=f"""\
CONTRATTO DI LOCAZIONE AD USO ABITATIVO (estratto)

Il sig. {N('locatore')}, codice fiscale [[CF|{CF['locatore']}]], residente in [[CITY|Milano]],
[[STREET|piazza Duomo]] [[BUILDINGNUM|2]] (di seguito "locatore"), concede in locazione alla sig.ra
{N('inquilino')}, nata il [[DATE|19/07/1993]], codice fiscale [[CF|{CF['inquilino']}]], carta d'identità
n. [[ID_DOC|CA98765ZX]], l'unità immobiliare sita in [[STREET|via Mazzini]] [[BUILDINGNUM|21]], [[ZIPCODE|60121]]
[[CITY|Ancona]], identificata al catasto [[CATASTO|foglio 7, particella 112, sub. 3]].
Il canone mensile di [[AMOUNT|€ 650,00]] sarà versato sull'IBAN [[IBAN|{IBAN['locatore']}]].
"""),
    "10_verbale_polizia_locale": dict(kind="verbale", expected="pseudonymize", t=f"""\
[[=ORG|Polizia Locale]] - {ENTE}
Verbale di accertamento di violazione al Codice della strada n. [[~DOCID|4471/2026]]

Il giorno [[~DATE|28/10/2026]] alle ore [[~TIME|8:05]] in [[STREET|viale della Repubblica]], gli agenti
accertavano che il veicolo targato [[TARGA|FB 123 XY]] sostava in area riservata. Conducente:
{N('cittadina4')}, [[GENDER|femmina]], di [[AGE|39 anni]], residente a [[CITY|Pisa]], patente n. [[ID_DOC|PI1234567K]].
Sanzione amministrativa: [[~AMOUNT|€ 42,00]].
"""),
    "11_blocco_salute": dict(kind="email", expected="block", block_category="salute", article="9", t=f"""\
Oggetto: assenza della dipendente
La dipendente {N('dipendente')} ha inviato il certificato medico: è in malattia fino a venerdì
per una patologia cronica. Prego aggiornare il cartellino.
"""),
    "12_blocco_giudiziario": dict(kind="lettera", expected="block", block_category="giudiziari", article="10",
                                  t=f"""\
Oggetto: verifica dei requisiti del candidato
Dal certificato del casellario giudiziale del candidato {N('candidato')} risulta una condanna
per un reato contro la pubblica amministrazione.
"""),
    "13_blocco_sindacale": dict(kind="email", expected="block", block_category="sindacale", article="9", t=f"""\
Per la busta paga di novembre applicare la trattenuta sindacale alla dipendente {N('dipendente')},
iscritta al sindacato dal mese scorso.
"""),
    "14_blocco_disabilita": dict(kind="email", expected="block", block_category="disabilita", article="9", t=f"""\
Il dipendente {N('impiegato')} ha chiesto i permessi della legge 104 per assistere il padre.
"""),
}


# --------------------------------------------------------------------------- #
# DOCX
# --------------------------------------------------------------------------- #
def _docx_letter():
    import docx
    from docx.shared import Pt
    d = docx.Document()
    d.core_properties.author = NOME["impiegata"]
    d.core_properties.title = f"Comunicazione a {NOME['cittadino1']}"
    sec = d.sections[0]
    sec.header.paragraphs[0].text = "Comune di Esempio - Ufficio Tributi"
    sec.footer.paragraphs[0].text = "Ufficio Relazioni con il Pubblico - tel. 06 0000000"
    d.add_paragraph("Comune di Esempio").runs[0].bold = True
    p = d.add_paragraph()
    p.add_run("Gentile sig. ")
    r = p.add_run("Anto")          # nome spezzato su run con formattazioni diverse
    r.bold = True
    r2 = p.add_run("nio Espo")
    r2.italic = True
    r3 = p.add_run("sito")
    r3.font.size = Pt(13)
    p.add_run(",")
    d.add_paragraph(f"residente in via dei Mille 12, 80121 Napoli, codice fiscale {CF['cittadino1']}.")
    d.add_paragraph("le comunichiamo l'esito della verifica. Riepilogo dei versamenti:")
    t = d.add_table(rows=3, cols=3)
    for i, row in enumerate([("Data", "Importo", "IBAN di addebito"),
                             ("15/03/2026", "€ 156,20", IBAN["cittadino1"]),
                             ("16/09/2026", "€ 156,20", IBAN["cittadino1"])]):
        for j, v in enumerate(row):
            t.cell(i, j).text = v
    d.add_paragraph(f"La funzionaria responsabile, {NOME['impiegata']}")
    values = [
        ("Antonio Esposito", "FULLNAME", "mask", "corpo (spezzato su 3 run)"),
        ("Napoli", "CITY", "mask", "corpo"), ("80121", "ZIPCODE", "mask", "corpo"),
        ("via dei Mille", "STREET", "mask", "corpo"),
        (CF["cittadino1"], "CF", "mask", "corpo"), (IBAN["cittadino1"], "IBAN", "mask", "tabella"),
        (NOME["impiegata"], "FULLNAME", "mask", "corpo e proprietà autore"),
        ("Comune di Esempio", "ORG", "allow", "intestazione e corpo"),
        ("Ufficio Tributi", "ORG", "allow", "intestazione"),
        ("Ufficio Relazioni con il Pubblico", "ORG", "allow", "piè di pagina"),
    ]
    return d, values


def _docx_relazione():
    import docx
    d = docx.Document()
    d.sections[0].header.paragraphs[0].text = f"Relazione istruttoria - RUP {NOME['rup']}"
    d.add_heading("Relazione istruttoria: contributi affitto 2026", 1)
    d.add_paragraph("Si riportano i beneficiari ammessi, verificati dai Servizi Demografici:")
    rows = [("Beneficiario", "Codice fiscale", "IBAN", "Indirizzo"),
            (NOME["cittadina2"], CF["cittadina2"], IBAN["beneficiari1"], "via Po 14, Torino"),
            (NOME["cittadino3"], CF["cittadino3"], IBAN["beneficiari2"], "vico Lungo 3, Napoli"),
            (NOME["inquilino"], CF["inquilino"], IBAN["beneficiari3"], "via Mazzini 21, Ancona")]
    t = d.add_table(rows=len(rows), cols=4)
    for i, row in enumerate(rows):
        for j, v in enumerate(row):
            t.cell(i, j).text = v
    d.add_paragraph(f"Il RUP, arch. {NOME['rup']}, propone l'approvazione dell'elenco.")
    values = [(NOME["rup"], "FULLNAME", "mask", "intestazione e corpo")]
    for r in rows[1:]:
        values += [(r[0], "FULLNAME", "mask", "tabella"), (r[1], "CF", "mask", "tabella"),
                   (r[2], "IBAN", "mask", "tabella")]
    values += [("via Po", "STREET", "mask", "tabella"), ("vico Lungo", "STREET", "mask", "tabella"),
               ("via Mazzini", "STREET", "mask", "tabella"),
               ("Servizi Demografici", "ORG", "allow", "corpo")]
    return d, values


def _docx_verbale():
    import docx
    d = docx.Document()
    d.core_properties.author = NOME["impiegato"]
    d.sections[0].header.paragraphs[0].text = "Comune di Esempio - Segreteria Generale"
    d.sections[0].footer.paragraphs[0].text = "Verbale riservato - uso interno"
    d.add_heading("Verbale di riunione del 21/10/2026", 1)
    p = d.add_paragraph("Presenti: ")
    r = p.add_run(NOME["sindaco"])
    r.bold = True
    p.add_run(f" (Sindaco), {NOME['assessore']} (Assessora), {NOME['segretario']} (Segretario).")
    d.add_paragraph(f"Il Sindaco riferisce della segnalazione del sig. {NOME['cittadino5']} "
                    f"(tel. +39 333 9876543, email g.lombardo49@example.com) su via Garibaldi.")
    d.add_paragraph("La rosa dei progetti è approvata. La seduta è tolta alle 12:00.")
    values = [(NOME["sindaco"], "FULLNAME", "mask", "corpo (run grassetto)"),
              (NOME["assessore"], "FULLNAME", "mask", "corpo"),
              (NOME["segretario"], "FULLNAME", "mask", "corpo"),
              (NOME["cittadino5"], "FULLNAME", "mask", "corpo"),
              (NOME["impiegato"], "FULLNAME", "mask", "proprietà autore"),
              ("+39 333 9876543", "TELEPHONENUM", "mask", "corpo"),
              ("g.lombardo49@example.com", "EMAIL", "mask", "corpo"),
              ("Comune di Esempio", "ORG", "allow", "intestazione"),
              ("Segreteria Generale", "ORG", "allow", "intestazione")]
    return d, values


# --------------------------------------------------------------------------- #
# XLSX
# --------------------------------------------------------------------------- #
def _xlsx_beneficiari():
    import openpyxl
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Beneficiari"
    ws.append(["Cognome e nome", "Codice fiscale", "Indirizzo", "CAP", "Comune", "IBAN", "Importo",
               "Intestazione"])
    data = [("cittadina2", "via Po 14", "10123", "Torino", "beneficiari1", 1200),
            ("cittadino3", "vico Lungo 3", "80134", "Napoli", "beneficiari2", 950),
            ("inquilino", "via Mazzini 21", "60121", "Ancona", "beneficiari3", 1100)]
    for i, (k, ind, cap, com, ib, imp) in enumerate(data, start=2):
        ws.append([NOME[k], CF[k], ind, cap, com, IBAN[ib], imp, None])
        ws[f"H{i}"] = f'="Contributo a "&A{i}'
    ws["F6"], ws["G6"] = "Totale", "=SUM(G2:G4)"
    wb.properties.creator = NOME["rup"]
    values = [(NOME[k], "FULLNAME", "mask", "colonna A") for k, *_ in data]
    values += [(CF[k], "CF", "mask", "colonna B") for k, *_ in data]
    values += [(IBAN[d[4]], "IBAN", "mask", "colonna F") for d in data]
    values += [("via Po", "STREET", "mask", "colonna C"), ("vico Lungo", "STREET", "mask", "colonna C"),
               ("via Mazzini", "STREET", "mask", "colonna C"),
               (NOME["rup"], "FULLNAME", "mask", "proprietà autore")]
    formulas = {"H2": '="Contributo a "&A2', "H3": '="Contributo a "&A3', "H4": '="Contributo a "&A4',
                "G6": "=SUM(G2:G4)"}
    return wb, values, formulas


def _xlsx_protocollo():
    import openpyxl
    from openpyxl.comments import Comment
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Registro"
    ws.append(["N. prot.", "Data", "Mittente", "Oggetto", "Ufficio assegnatario"])
    rows = [(15870, "27/10/2026", NOME["cittadina4"], "Istanza di accesso agli atti", "Segreteria Generale"),
            (15871, "27/10/2026", "Edilverde S.r.l.", f"Offerta, P.IVA {PIVA['edilverde']}", "Ufficio Protocollo"),
            (15872, "28/10/2026", NOME["cittadino5"], "Segnalazione buca in via Garibaldi", "Polizia Locale"),
            (15873, "28/10/2026", NOME["cittadino1"], f"Rimborso TARI, CF {CF['cittadino1']}", "Ufficio Tributi")]
    for r in rows:
        ws.append(list(r))
    ws["A7"], ws["B7"] = "Righe:", "=COUNTA(A2:A5)"
    ws["C2"].comment = Comment(f"Contattare anche {NOME['cittadino3']}", NOME["impiegata"])
    values = [(NOME["cittadina4"], "FULLNAME", "mask", "colonna C"),
              (NOME["cittadino5"], "FULLNAME", "mask", "colonna C"),
              (NOME["cittadino1"], "FULLNAME", "mask", "colonna C"),
              (NOME["cittadino3"], "FULLNAME", "mask", "commento"),
              (NOME["impiegata"], "FULLNAME", "mask", "autore del commento"),
              (PIVA["edilverde"], "PIVA", "mask", "colonna D"),
              (CF["cittadino1"], "CF", "mask", "colonna D"),
              ("Edilverde S.r.l.", "ORG", "ignore", "colonna C (ditta)"),
              ("Segreteria Generale", "ORG", "allow", "colonna E"),
              ("Ufficio Protocollo", "ORG", "allow", "colonna E"),
              ("Polizia Locale", "ORG", "allow", "colonna E")]
    return wb, values, {"B7": "=COUNTA(A2:A5)"}


def _xlsx_fornitori():
    import openpyxl
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Fornitori"
    ws.append(["Ragione sociale", "P.IVA", "Referente", "PEC", "Telefono", "IBAN", "Imponibile", "IVA 22%"])
    data = [("Edilverde S.r.l.", PIVA["edilverde"], NOME["cittadino5"], "edilverde@pec.example.it",
             "+39 02 5550101", IBAN["fornitore1"], 38400),
            ("Studio Tecnico Alfa", PIVA["fornitore1"], NOME["membro2"], "studioalfa@pec.example.it",
             "+39 06 5550202", IBAN["fornitore2"], 4200)]
    for i, d in enumerate(data, start=2):
        ws.append(list(d) + [None])
        ws[f"H{i}"] = f"=G{i}*0.22"
    values = []
    for d in data:
        values += [(d[1], "PIVA", "mask", "colonna B"), (d[2], "FULLNAME", "mask", "colonna C"),
                   (d[3], "EMAIL", "mask", "colonna D"), (d[4], "TELEPHONENUM", "mask", "colonna E"),
                   (d[5], "IBAN", "mask", "colonna F"), (d[0], "ORG", "ignore", "colonna A")]
    return wb, values, {"H2": "=G2*0.22", "H3": "=G3*0.22"}


# --------------------------------------------------------------------------- #
# PDF (reportlab)
# --------------------------------------------------------------------------- #
PDF_DOCS = {
    "pdf1_comunicazione": [
        "Comune di Esempio - Servizi Demografici",
        f"Alla sig.ra {NOME['cittadina2']}, corso Vittorio Emanuele II 45, 10128 Torino",
        f"Codice fiscale {CF['cittadina2']}",
        "Si comunica che la sua richiesta di cambio di residenza è stata accolta.",
        f"Il funzionario: {NOME['impiegato']}",
    ],
    "pdf2_liquidazione": [
        "Comune di Esempio - Settore Lavori Pubblici",
        f"Liquidazione alla ditta Edilverde S.r.l., P.IVA {PIVA['edilverde']}",
        f"Accredito sull'IBAN {IBAN['fornitore1']} - referente {NOME['cittadino5']}",
        f"Il Dirigente: {NOME['dirigente']}",
    ],
}
PDF_VALUES = {
    "pdf1_comunicazione": [(NOME["cittadina2"], "FULLNAME", "mask"), (CF["cittadina2"], "CF", "mask"),
                           ("corso Vittorio Emanuele II", "STREET", "mask"), ("10128", "ZIPCODE", "mask"),
                           (NOME["impiegato"], "FULLNAME", "mask"),
                           ("Comune di Esempio", "ORG", "allow"), ("Servizi Demografici", "ORG", "allow")],
    "pdf2_liquidazione": [(PIVA["edilverde"], "PIVA", "mask"), (IBAN["fornitore1"], "IBAN", "mask"),
                          (NOME["cittadino5"], "FULLNAME", "mask"), (NOME["dirigente"], "FULLNAME", "mask"),
                          ("Comune di Esempio", "ORG", "allow")],
}


def _pdf(lines: list[str], path: Path) -> None:
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas
    c = canvas.Canvas(str(path), pagesize=A4)
    c.setTitle("Documento di prova PseudoGate")
    c.setAuthor("Collaudo PseudoGate")
    y = 780
    for ln in lines:
        c.setFont("Helvetica", 11)
        c.drawString(56, y, ln)
        y -= 22
    c.save()


# --------------------------------------------------------------------------- #
def main() -> None:
    if ROOT.exists():
        shutil.rmtree(ROOT)
    for sub in ("testi", "docx", "xlsx", "pdf"):
        (ROOT / sub).mkdir(parents=True)
    manifest = {"descrizione": "Corpus sintetico di collaudo di Pseudomania: dati interamente inventati.",
                "generatore": "collaudo/genera_corpus.py", "seed": 20261031, "documenti": []}

    for doc_id, spec in TESTI.items():
        text, ents = render(spec["t"])
        f = ROOT / "testi" / f"{doc_id}.txt"
        f.write_text(text, encoding="utf-8")
        gt = {"id": doc_id, "format": "txt", "file": f"testi/{doc_id}.txt", "kind": spec["kind"],
              "expected": spec["expected"], "entities": ents}
        if spec["expected"] == "block":
            gt.update(block_category=spec["block_category"], article=spec["article"])
        (ROOT / "testi" / f"{doc_id}.json").write_text(json.dumps(gt, ensure_ascii=False, indent=1),
                                                     encoding="utf-8")
        manifest["documenti"].append({k: gt[k] for k in ("id", "format", "file", "expected")}
                                     | {"truth": f"testi/{doc_id}.json"})

    def save_office(doc_id, fmt, obj, values, formulas=None):
        f = ROOT / fmt / f"{doc_id}.{fmt}"
        b = io.BytesIO()
        obj.save(b)
        f.write_bytes(b.getvalue())
        gt = {"id": doc_id, "format": fmt, "file": f"{fmt}/{doc_id}.{fmt}", "expected": "pseudonymize",
              "values": [{"text": v[0], "type": v[1], "action": v[2], "where": v[3]} for v in values]}
        if formulas:
            gt["formulas"] = formulas
        (ROOT / fmt / f"{doc_id}.json").write_text(json.dumps(gt, ensure_ascii=False, indent=1),
                                                 encoding="utf-8")
        manifest["documenti"].append({k: gt[k] for k in ("id", "format", "file", "expected")}
                                     | {"truth": f"{fmt}/{doc_id}.json"})

    for name, fn in (("docx1_lettera_tributi", _docx_letter), ("docx2_relazione_istruttoria", _docx_relazione),
                     ("docx3_verbale_riunione", _docx_verbale)):
        d, values = fn()
        save_office(name, "docx", d, values)
    for name, fn in (("xlsx1_elenco_beneficiari", _xlsx_beneficiari), ("xlsx2_registro_protocollo", _xlsx_protocollo),
                     ("xlsx3_anagrafe_fornitori", _xlsx_fornitori)):
        wb, values, formulas = fn()
        save_office(name, "xlsx", wb, values, formulas)

    try:
        import reportlab  # noqa: F401
        for name, lines in PDF_DOCS.items():
            f = ROOT / "pdf" / f"{name}.pdf"
            _pdf(lines, f)
            gt = {"id": name, "format": "pdf", "file": f"pdf/{name}.pdf", "expected": "pseudonymize",
                  "values": [{"text": v[0], "type": v[1], "action": v[2], "where": "pagina 1"}
                             for v in PDF_VALUES[name]]}
            (ROOT / "pdf" / f"{name}.json").write_text(json.dumps(gt, ensure_ascii=False, indent=1),
                                                     encoding="utf-8")
            manifest["documenti"].append({k: gt[k] for k in ("id", "format", "file", "expected")}
                                         | {"truth": f"pdf/{name}.json"})
    except ImportError:
        manifest["nota_pdf"] = "reportlab non installato: PDF non generati"

    (ROOT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    n = {f: sum(1 for d in manifest["documenti"] if d["format"] == f) for f in ("txt", "docx", "xlsx", "pdf")}
    print(f"Corpus generato in {ROOT}: {n}")


if __name__ == "__main__":
    main()
