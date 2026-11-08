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


def firmato():
    """PDF firmato come quelli di firma digitale qualificata (PAdES/CAdES): pagina scansionata (solo
    immagine), riquadro visibile della firma con il nome, dizionario /Sig con nome e un finto
    «certificato» che contiene nome e codice fiscale in chiaro (come il CMS reale), /Perms e /DSS.
    La firma non è crittograficamente valida: serve solo a riprodurre la struttura."""
    doc = fitz.open()
    p = doc.new_page(width=595, height=842)
    scan = png_text(["Atto di sottomissione n. 1", "Impresa Elettrica Verdi srl",
                               "Il direttore dei lavori Luca Neri", "Torino, 6 novembre 2026"], (1100, 360), 40)
    p.insert_image(fitz.Rect(40, 60, 555, 230), stream=scan)
    # riquadro visibile della firma (aspetto con il nome del firmatario)
    ap = doc.get_new_xref()
    font = doc.get_new_xref()
    doc.update_object(font, "<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>")
    stream = b"BT /F1 8 Tf 2 70 Td (LUCA) Tj 0 -10 Td (NERI) Tj 0 -10 Td (06.11.2026 11:51:09) Tj ET"
    doc.update_object(ap, "<</Type/XObject/Subtype/Form/BBox[0 0 90 90]/Resources<</Font<</F1 %d 0 R>>>>>>" % font)
    doc.update_stream(ap, stream)
    cert = (b"\x30\x82Actalis finta CA\x31Neri\x31Luca\x31TINIT-NRELCU80A01L219X\x31Luca Neri\x31"
            b"WSREF-123\x30" + bytes(range(256)))
    sig = doc.get_new_xref()
    doc.update_object(sig, "<</Type/Sig/Filter/Adobe.PPKLite/SubFilter/ETSI.CAdES.detached/Name(Luca Neri)"
                           "/Location(Torino)/Reason(Firma del direttore dei lavori)/M(D:20261106115109+01'00')"
                           "/ByteRange[0 100 200 100]/Contents<%s>>>" % (cert.hex().upper() + "00" * 64))
    widget = doc.get_new_xref()
    doc.update_object(widget, "<</Type/Annot/Subtype/Widget/FT/Sig/F 132/T(Signature1)/V %d 0 R"
                              "/P %d 0 R/Rect[400 60 490 150]/AP<</N %d 0 R>>>>" % (sig, p.xref, ap))
    doc.xref_set_key(p.xref, "Annots", "[%d 0 R]" % widget)
    dss = doc.get_new_xref()
    doc.update_object(dss, "<</Certs[]/OCSPs[]/CRLs[]>>")
    cat = doc.pdf_catalog()
    doc.xref_set_key(cat, "AcroForm", "<</Fields[%d 0 R]/SigFlags 3>>" % widget)
    doc.xref_set_key(cat, "Perms", "<</DocMDP %d 0 R>>" % sig)
    doc.xref_set_key(cat, "DSS", "%d 0 R" % dss)
    doc.save(out("firmato.pdf"), deflate=True)


if __name__ == "__main__":
    testo()
    immagini()
    ripristino()
    protetto()
    firmato()
    print("ok")
