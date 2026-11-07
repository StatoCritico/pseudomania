# SPDX-License-Identifier: AGPL-3.0-or-later
# Descrive un PDF in JSON per test/e2e/pdf-offscreen.test.js (richiede PyMuPDF):
#   python3 verifica.py file.pdf
import hashlib
import json
import sys
import warnings

warnings.filterwarnings("ignore")
import pymupdf  # noqa: E402

doc = pymupdf.open(sys.argv[1])
pages = []
for p in doc:
    imgs = []
    for info in p.get_image_info(hashes=True, xrefs=True):
        imgs.append({"bbox": [round(v, 1) for v in info["bbox"]], "digest": info["digest"].hex() if info.get("digest") else None})
    lines = []
    for b in p.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            spans = [s for s in l["spans"] if s["text"].strip()]
            if spans:
                lines.append({"text": "".join(s["text"] for s in l["spans"]),
                              "origin": [round(v, 2) for v in spans[0]["origin"]],
                              "size": round(spans[0]["size"], 2), "font": spans[0]["font"]})
    pages.append({
        "text": p.get_text(),
        "lines": lines,
        "images": imgs,
        "annots": [{"type": a.type[1], "info": a.info} for a in p.annots()],
        "widgets": [w.field_value for w in p.widgets()],
    })
print(json.dumps({
    "metadata": doc.metadata,
    "xmp": doc.get_xml_metadata(),
    "toc": doc.get_toc(),
    "embedded": doc.embfile_names(),
    "pages": pages,
}, ensure_ascii=False))
