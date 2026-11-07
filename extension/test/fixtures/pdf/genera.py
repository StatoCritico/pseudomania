# SPDX-License-Identifier: AGPL-3.0-or-later
# Genera le fixture PDF di test/e2e/pdf-offscreen.test.js (richiede PyMuPDF e Pillow):
#   python3 test/fixtures/pdf/genera.py
import io
import os

import pymupdf as fitz
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"


def out(name):
    return os.path.join(HERE, name)


def testo():
    """Testo con PII + metadati, XMP, annotazioni, campo modulo, segnalibro, allegato."""
    doc = fitz.open()
    p = doc.new_page(width=595, height=842)
    y = 90
    for line in [
        "Il sottoscritto Mario Rossi, nato a Roma il 1/1/1980,",
        "codice fiscale RSSMRA80A01H501U, IBAN IT60X0542811101000000123456.",
        "Si allega la documentazione relativa al signor Fran-",
        "cesco Bianchi, residente in via Garibaldi 3.",
        "Oggetto: Re dei Re, iniziale C del secondo nome.",
        "Mario Rossi CORDELLA ricorda che DE non va toccato in CORDELLA.",
    ]:
        p.insert_text((72, y), line, fontname="helv", fontsize=11)
        y += 18
    a = p.add_text_annot((400, 60), "Nota per Mario Rossi: verificare IBAN")
    a.set_info(title="Mario Rossi", subject="Pratica di Mario Rossi")
    a.update()
    fa = p.add_freetext_annot(fitz.Rect(72, 300, 320, 330), "Commento: Mario Rossi", fontsize=10)
    fa.update()
    w = fitz.Widget()
    w.field_name = "nome"
    w.field_type = fitz.PDF_WIDGET_TYPE_TEXT
    w.rect = fitz.Rect(72, 360, 300, 380)
    w.field_value = "Mario Rossi"
    p.add_widget(w)
    p2 = doc.new_page(width=595, height=842)
    p2.insert_text((72, 90), "Seconda pagina senza dati personali.", fontname="helv", fontsize=11)
    doc.set_toc([[1, "Pratica Mario Rossi", 1], [2, "Allegati di Mario Rossi", 2], [1, "Indice", 2]])
    doc.set_metadata({"author": "Mario Rossi", "title": "Pratica Mario Rossi", "subject": "RSSMRA80A01H501U"})
    doc.set_xml_metadata('<?xpacket begin=""?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
                         '<rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:creator>Mario Rossi</dc:creator></rdf:Description>'
                         '</rdf:RDF></x:xmpmeta><?xpacket end="w"?>')
    doc.embfile_add("dati.txt", b"Mario Rossi RSSMRA80A01H501U", filename="dati.txt")
    doc.save(out("testo.pdf"))


def png_text(lines, size, fontsize):
    img = Image.new("RGB", size, "white")
    d = ImageDraw.Draw(img)
    f = ImageFont.truetype(FONT, fontsize)
    y = 30
    for ln in lines:
        d.text((30, y), ln, fill="black", font=f)
        y += int(fontsize * 1.6)
    b = io.BytesIO()
    img.save(b, "PNG")
    return b.getvalue()


def immagini():
    """Pagina 1: testo + immagine con un nome stampato; pagina 2: interamente scansionata."""
    doc = fitz.open()
    p = doc.new_page(width=595, height=842)
    p.insert_text((72, 90), "Relazione tecnica. Il nome in figura non e' nel testo.", fontname="helv", fontsize=11)
    img = png_text(["Firmato: Giulia Bianchi"], (900, 120), 48)
    p.insert_image(fitz.Rect(72, 200, 372, 240), stream=img)
    p.insert_text((72, 300), "Testo dopo la figura.", fontname="helv", fontsize=11)
    p2 = doc.new_page(width=595, height=842)
    scan = png_text(["Verbale di consegna", "Destinatario: Luca Neri", "Codice fiscale NRELCU75C12F205Z",
                     "Torino, 3 marzo 2026"], (1240, 1754), 44)
    p2.insert_image(p2.rect, stream=scan)
    doc.save(out("immagini.pdf"), deflate=True)


def ripristino():
    doc = fitz.open()
    p = doc.new_page(width=595, height=842)
    p.insert_text((72, 100), "Gentile [FULLNAME_1], la pratica [ID_1] e' chiusa.", fontname="helv", fontsize=12)
    p.insert_text((72, 130), "Riga senza segnaposto.", fontname="hebo", fontsize=12)
    p.insert_text((72, 160), "Sconosciuto: [EMAIL_9].", fontname="helv", fontsize=12)
    doc.save(out("ripristino.pdf"))


def protetto():
    doc = fitz.open()
    p = doc.new_page()
    p.insert_text((72, 100), "Segreto di Mario Rossi", fontname="helv", fontsize=12)
    doc.save(out("protetto.pdf"), encryption=fitz.PDF_ENCRYPT_AES_256, user_pw="segreta", owner_pw="padrone")


if __name__ == "__main__":
    testo()
    immagini()
    ripristino()
    protetto()
    print("ok")
