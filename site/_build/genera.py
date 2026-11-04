#!/usr/bin/env python3
"""Generatore del sito statico di Pseudomania (solo libreria standard).

Uso:  python3 site/_build/genera.py

Legge:
  _build/home.json            contenuti della landing page (sezioni e schede dei caroselli)
  _build/pagine/*.html        corpo delle pagine (approfondimenti, informativa privacy)
Scrive:
  index.html, privacy.html, approfondimenti/*.html

Intestazione, menu ad albero, piè di pagina e paginazione sono generati qui, così restano
uguali in tutte le pagine. Il menu ad albero elenca, per ogni capitolo, i titoli <h2 id="...">
trovati nella pagina. Alla fine controlla che ogni collegamento interno (pagina e ancora) esista.

La cartella _build/ non va pubblicata (vedi PUBBLICAZIONE.md).
"""
import html
import json
import re
import sys
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent
BUILD = SITE / "_build"
BASE_URL = "https://pseudomania.statocritico.it/"
REPO = "https://github.com/StatoCritico/pseudomania"

CAPITOLI = [
    ("il-problema", "Il problema"),
    ("come-funziona", "Come funziona"),
    ("scelte-di-progetto", "Scelte di progetto"),
    ("non-solo-software", "Non solo software"),
    ("personal-edition", "Personal edition"),
    ("server-edition", "Server edition"),
    ("guida-all-uso", "Guida all'uso"),
    ("faq", "Domande frequenti"),
    ("licenza-e-crediti", "Licenza e crediti"),
    ("note-legali", "Note legali e disclaimer"),
    ("strumenti-e-download", "Strumenti e download"),
]

HOME_NAV = [
    ("problema", "Il problema"),
    ("soluzione", "La soluzione"),
    ("non-solo-software", "Non solo software"),
    ("personal", "Personal edition"),
    ("server", "Server edition"),
]

LOGO = ('<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><rect width="64" height="64" rx="12" '
        'fill="#0059b3"/><path d="M22 14h-8v36h8M42 14h8v36h-8" fill="none" stroke="#fff" stroke-width="6" '
        'stroke-linejoin="round"/><rect x="25" y="29" width="14" height="6" rx="2" fill="#fff"/></svg>')

ICON_MOON = ('<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" '
             'd="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z"/></svg>')
ICON_MENU = ('<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" '
             'd="M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z"/></svg>')
ICON_PREV = ('<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" '
             'd="M15.4 7.4 14 6l-6 6 6 6 1.4-1.4L10.8 12z"/></svg>')
ICON_NEXT = ('<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" '
             'd="M8.6 16.6 10 18l6-6-6-6-1.4 1.4 4.6 4.6z"/></svg>')


def esc(t):
    return html.escape(t, quote=True)


def leggi_pagina(nome):
    testo = (BUILD / "pagine" / f"{nome}.html").read_text(encoding="utf-8")
    meta = {}
    m = re.match(r"\s*<!--meta\n(.*?)\n-->\n", testo, re.S)
    if m:
        for riga in m.group(1).splitlines():
            if ":" in riga:
                k, v = riga.split(":", 1)
                meta[k.strip()] = v.strip()
        testo = testo[m.end():]
    return meta, testo


def sottosezioni(corpo):
    return [(m.group(1), re.sub(r"<[^>]+>", "", m.group(2)).strip())
            for m in re.finditer(r'<h2 id="([^"]+)"[^>]*>(.*?)</h2>', corpo, re.S)]


def testa(titolo, descrizione, p, percorso):
    return f"""<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(titolo)}</title>
<meta name="description" content="{esc(descrizione)}">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#0059b3">
<meta name="referrer" content="no-referrer">
<link rel="canonical" href="{BASE_URL}{percorso}">
<link rel="icon" href="{p}assets/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="{p}assets/style.css">
<script src="{p}assets/theme-init.js"></script>
</head>
"""


def intestazione(p, home, attivo):
    voci = []
    for ancora, nome in HOME_NAV:
        href = f"#{ancora}" if home else f"{p}index.html#{ancora}"
        voci.append(f'<li><a href="{href}">{esc(nome)}</a></li>')
    cur = ' aria-current="page"' if attivo == "approfondimenti" else ""
    voci.append(f'<li><a href="{p}approfondimenti/index.html"{cur}>Approfondimenti</a></li>')
    brand_href = "#contenuto" if home else f"{p}index.html"
    return f"""<body>
<a class="skip-link" href="#contenuto">Vai al contenuto principale</a>
<div class="slim-header">
  <div class="wrap">
    <span>Software libero · AGPL-3.0 · riuso per la PA</span>
    <a href="{REPO}">Codice sorgente</a>
  </div>
</div>
<header class="site-header">
  <div class="wrap header-row">
    <a class="brand" href="{brand_href}" aria-label="Pseudomania, pagina principale">
      {LOGO}
      <span>
        <span class="brand-name">Pseudomania</span>
        <span class="brand-tag">Pseudonimizzazione per l'IA generativa</span>
      </span>
    </a>
    <div class="header-tools">
      <button type="button" class="btn-icon" id="theme-toggle" aria-pressed="false">{ICON_MOON}<span class="theme-label">Tema scuro</span></button>
      <button type="button" class="btn-icon menu-toggle" id="menu-toggle" aria-expanded="false" aria-controls="main-nav">{ICON_MENU}<span>Menu</span></button>
    </div>
  </div>
  <nav class="main-nav" id="main-nav" aria-label="Menu principale">
    <div class="wrap">
      <ul>
        {chr(10).join('        ' + v for v in voci).strip()}
      </ul>
    </div>
  </nav>
</header>
"""


def piede(p):
    a = f"{p}approfondimenti/"
    return f"""<footer class="site-footer">
  <div class="wrap">
    <div class="footer-grid">
      <div>
        <h2>Pseudomania</h2>
        <p>Software libero per pseudonimizzare ciò che si invia a Claude. Progettato per il riuso gratuito da parte delle pubbliche amministrazioni italiane e utilizzabile dai professionisti.</p>
        <p class="small">Copyright © 2026 gli autori di Pseudomania. Questo programma è software libero: puoi ridistribuirlo e/o modificarlo secondo i termini della <a href="https://www.gnu.org/licenses/agpl-3.0.html">GNU Affero General Public License</a>, versione 3 o (a tua scelta) successiva. È distribuito <strong>senza alcuna garanzia</strong>; la responsabilità dell'adozione e dell'uso resta interamente di chi lo adotta e lo usa (<a href="{a}note-legali.html">note legali</a>).</p>
      </div>
      <div>
        <h2>Approfondimenti</h2>
        <ul>
          <li><a href="{a}index.html">Indice degli approfondimenti</a></li>
          <li><a href="{a}faq.html">Domande frequenti</a></li>
          <li><a href="{a}guida-all-uso.html">Guida all'uso</a></li>
          <li><a href="{a}scelte-di-progetto.html">Scelte di progetto</a></li>
          <li><a href="{a}strumenti-e-download.html">Strumenti e download</a></li>
        </ul>
      </div>
      <div>
        <h2>Riuso e note legali</h2>
        <ul>
          <li><a href="{REPO}">Repository del codice</a></li>
          <li><a href="{a}licenza-e-crediti.html">Licenza e crediti</a></li>
          <li><a href="{a}note-legali.html">Note legali e disclaimer</a></li>
          <li><a href="{p}privacy.html">Informativa privacy dell'estensione</a></li>
          <li><a href="{REPO}/issues">Segnalazioni e proposte</a></li>
        </ul>
      </div>
    </div>
    <div class="footer-bottom">
      <p>Questo sito non usa cookie né strumenti di tracciamento e non carica risorse da terzi. La sola preferenza di tema, se la scegli, resta nel tuo browser.</p>
    </div>
  </div>
</footer>
<p id="annuncio" class="visually-hidden" role="status" aria-live="polite"></p>
<script src="{p}assets/main.js"></script>
</body>
</html>
"""


def albero(corrente, sezioni_per_pagina):
    righe = ['<ul class="tree">']
    for slug, titolo in CAPITOLI:
        aperto = " open" if slug == corrente else ""
        cls = ' class="tree-current"' if slug == corrente else ""
        cur = ' aria-current="page"' if slug == corrente else ""
        righe.append(f'<li><details{aperto}><summary{cls}>{esc(titolo)}</summary><ul>')
        righe.append(f'<li><a href="{slug}.html"{cur}>Panoramica</a></li>')
        for ancora, nome in sezioni_per_pagina.get(slug, []):
            righe.append(f'<li><a href="{slug}.html#{ancora}">{esc(nome)}</a></li>')
        righe.append("</ul></details></li>")
    righe.append('<li class="tree-leaf"><a href="../privacy.html">Informativa privacy</a></li>')
    righe.append("</ul>")
    return "\n".join(righe)


def pagina_approfondimento(slug, titolo, meta, corpo, sezioni_per_pagina, prec, succ):
    p = "../"
    nav = albero(slug, sezioni_per_pagina)
    if slug == "index":
        nav = nav.replace('<ul class="tree">', '<ul class="tree">', 1)
    briciole_extra = "" if slug == "index" else f'<li><a href="index.html">Approfondimenti</a></li>'
    pager = []
    if prec:
        pager.append(f'<a class="pager-prev" href="{prec[0]}.html"><span>Capitolo precedente</span>{esc(prec[1])}</a>')
    if succ:
        pager.append(f'<a class="pager-next" href="{succ[0]}.html"><span>Capitolo successivo</span>{esc(succ[1])}</a>')
    lead = f'<p class="lead">{meta["lead"]}</p>' if meta.get("lead") else ""
    return (testa(f"{titolo} – Pseudomania", meta.get("description", titolo), p, f"approfondimenti/{slug}.html")
            + intestazione(p, False, "approfondimenti")
            + f"""<div class="wrap docs-layout">
  <button type="button" class="tree-toggle" id="tree-toggle" aria-expanded="false" aria-controls="docs-nav">{ICON_MENU}<span>Indice degli approfondimenti</span></button>
  <nav class="docs-nav" id="docs-nav" aria-label="Indice degli approfondimenti">
    <p class="docs-nav-title">Approfondimenti</p>
    <div class="tree-tools"><button type="button" data-tree="open">Espandi tutto</button><button type="button" data-tree="close">Comprimi tutto</button></div>
    {nav}
  </nav>
  <main class="docs-main" id="contenuto" tabindex="-1">
    <nav aria-label="Percorso" class="breadcrumb"><ol><li><a href="../index.html">Pseudomania</a></li>{briciole_extra}<li aria-current="page">{esc(titolo)}</li></ol></nav>
    <h1>{esc(titolo)}</h1>
    {lead}
    {corpo}
    <nav class="pager" aria-label="Capitoli">{''.join(pager)}</nav>
  </main>
</div>
""" + piede(p))


def carosello(sez):
    sid = sez["id"]
    n = len(sez["schede"])
    voci = []
    for i, s in enumerate(sez["schede"], 1):
        voci.append(f"""        <li class="car-slide" role="group" aria-roledescription="scheda" aria-label="{i} di {n}">
          <div class="car-card">
            <span class="car-num" aria-hidden="true">{i:02d}</span>
            <h3><a href="{esc(s['href'])}">{esc(s['titolo'])}</a></h3>
            <p>{s['testo']}</p>
            <span class="car-more" aria-hidden="true">Approfondisci</span>
          </div>
        </li>""")
    alt = " alt" if sez.get("alt") else ""
    return f"""  <section id="{sid}" class="home-sec{alt}" aria-labelledby="h-{sid}">
    <div class="wrap">
      <span class="eyebrow">{esc(sez['eyebrow'])}</span>
      <h2 id="h-{sid}">{esc(sez['titolo'])}</h2>
      <p class="section-intro">{sez['intro']}</p>
      <div class="carousel" role="region" aria-roledescription="carosello" aria-label="{esc(sez['titolo'])}: punti principali">
        <div class="car-controls">
          <button type="button" class="car-btn car-prev" aria-controls="car-{sid}" aria-label="Schede precedenti">{ICON_PREV}</button>
          <span class="car-status" aria-hidden="true"></span>
          <button type="button" class="car-btn car-next" aria-controls="car-{sid}" aria-label="Schede successive">{ICON_NEXT}</button>
        </div>
        <ul class="car-track" id="car-{sid}">
{chr(10).join(voci)}
        </ul>
        <p class="car-hint">Usa i pulsanti, le frecce della tastiera o scorri lateralmente.</p>
      </div>
      {sez.get('dopo', '')}
    </div>
  </section>
"""


def genera_home():
    dati = json.loads((BUILD / "home.json").read_text(encoding="utf-8"))
    _, hero = leggi_pagina("home-hero")
    corpo = hero + "\n".join(carosello(s) for s in dati["sezioni"])
    out = (testa(dati["titolo"], dati["descrizione"], "", "")
           + intestazione("", True, "home")
           + f'<main id="contenuto" tabindex="-1">\n{corpo}\n</main>\n'
           + piede(""))
    (SITE / "index.html").write_text(out, encoding="utf-8")


def genera_privacy():
    meta, corpo = leggi_pagina("privacy")
    out = (testa(meta["title"], meta["description"], "", "privacy.html")
           + intestazione("", False, "privacy").replace('href="index.html#', 'href="index.html#')
           + f'<main id="contenuto" tabindex="-1">\n{corpo}\n</main>\n'
           + piede(""))
    (SITE / "privacy.html").write_text(out, encoding="utf-8")


def genera_approfondimenti():
    pagine = {}
    sezioni = {}
    for slug, _ in CAPITOLI:
        meta, corpo = leggi_pagina(slug)
        pagine[slug] = (meta, corpo)
        sezioni[slug] = sottosezioni(corpo)
    cartella = SITE / "approfondimenti"
    cartella.mkdir(exist_ok=True)
    for i, (slug, titolo) in enumerate(CAPITOLI):
        meta, corpo = pagine[slug]
        prec = CAPITOLI[i - 1] if i > 0 else None
        succ = CAPITOLI[i + 1] if i + 1 < len(CAPITOLI) else None
        (cartella / f"{slug}.html").write_text(
            pagina_approfondimento(slug, titolo, meta, corpo, sezioni, prec, succ), encoding="utf-8")
    # Indice degli approfondimenti
    voci = []
    for slug, titolo in CAPITOLI:
        meta = pagine[slug][0]
        sub = "".join(f'<li><a href="{slug}.html#{a}">{esc(n)}</a></li>' for a, n in sezioni[slug])
        voci.append(f'<article class="card chapter-card"><h2 id="cap-{slug}"><a href="{slug}.html">{esc(titolo)}</a></h2>'
                    f'<p>{meta.get("summary", "")}</p><ul>{sub}</ul></article>')
    corpo = '<div class="grid grid-2">' + "\n".join(voci) + '</div>'
    # Ancora usata dall'estensione: /approfondimenti/#recupero-chiavi (non rinominare)
    corpo += (BUILD / "pagine" / "recupero-chiavi.html").read_text(encoding="utf-8")
    meta = {"description": "Indice degli approfondimenti su Pseudomania: problema, funzionamento, scelte di progetto, edizioni, guida, FAQ, licenza e note legali.",
            "lead": "Ogni capitolo spiega un aspetto di Pseudomania in dettaglio. Usa il menu laterale per spostarti tra capitoli e sezioni."}
    (cartella / "index.html").write_text(
        pagina_approfondimento("index", "Approfondimenti", meta, corpo, sezioni, None, CAPITOLI[0]), encoding="utf-8")


def controlla_collegamenti():
    errori = []
    file_html = [SITE / "index.html", SITE / "privacy.html"] + sorted((SITE / "approfondimenti").glob("*.html"))
    ids = {}
    for f in file_html:
        ids[f.resolve()] = set(re.findall(r'\sid="([^"]+)"', f.read_text(encoding="utf-8")))
    for f in file_html:
        testo = f.read_text(encoding="utf-8")
        for href in re.findall(r'href="([^"]+)"', testo):
            if re.match(r"(https?:|mailto:)", href):
                continue
            percorso, _, ancora = href.partition("#")
            dest = (f.parent / percorso).resolve() if percorso else f.resolve()
            if not dest.exists():
                errori.append(f"{f.name}: file mancante {href}")
                continue
            if ancora and dest.suffix == ".html" and ancora not in ids.get(dest, set()):
                errori.append(f"{f.name}: ancora mancante {href}")
    return errori


if __name__ == "__main__":
    genera_home()
    genera_privacy()
    genera_approfondimenti()
    errori = controlla_collegamenti()
    for e in errori:
        print("ERRORE", e)
    print(f"Generato. Collegamenti interni non validi: {len(errori)}")
    sys.exit(1 if errori else 0)
