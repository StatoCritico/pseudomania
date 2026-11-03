#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 gli autori di Pseudomania
"""Converte le regole del server (server/config/allowlist.yml e special_categories.yml) in
src/shared/policy-data.js per la Personal edition (estensione autonoma, senza server).

Uso:  python3 scripts/genera-policy.py [cartella-config]   (predefinita: ../server/config)
Rieseguire dopo ogni modifica delle regole e aggiornare i test."""
import json
import pathlib
import sys

import yaml

here = pathlib.Path(__file__).resolve().parent
src = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else here.parent.parent / "server" / "config"
allow = yaml.safe_load((src / "allowlist.yml").read_text(encoding="utf-8")) or {}
special = yaml.safe_load((src / "special_categories.yml").read_text(encoding="utf-8")) or {}

data = {
    "allowlist": {
        "version": str(allow.get("version", "0")),
        "terms": [str(t) for t in allow.get("terms") or []],
        "patterns": [str(p) for p in allow.get("patterns") or []],
        "never_mask_types": [str(t) for t in allow.get("never_mask_types") or []],
    },
    "special": {
        "version": str(special.get("version", "0")),
        "message": str(special.get("message") or ""),
        "categories": [
            {
                "id": str(c["id"]),
                "article": str(c.get("article", "9")),
                "label": str(c.get("label", c["id"])),
                "action": str(c.get("action", "block")),
                "terms": [str(t) for t in c.get("terms") or []],
                "patterns": [str(p) for p in c.get("patterns") or []],
            }
            for c in special.get("categories") or []
            if c.get("enabled", True) is not False
        ],
    },
}
out = here.parent / "src" / "shared" / "policy-data.js"
out.write_text(
    "// SPDX-License-Identifier: AGPL-3.0-or-later\n"
    "// FILE GENERATO da scripts/genera-policy.py a partire da server/config/*.yml: non modificarlo a mano.\n"
    "// Regole della Personal edition (allowlist e categorie particolari, artt. 9-10 GDPR) - BOZZA da\n"
    "// validare come le regole del server.\n"
    "(function (root) {\n  'use strict';\n  const PG = (root.PG = root.PG || {});\n"
    f"  PG.policyData = {json.dumps(data, ensure_ascii=False, indent=2)};\n"
    "  if (typeof module === 'object' && module.exports) module.exports = PG.policyData;\n"
    "})(typeof globalThis !== 'undefined' ? globalThis : this);\n",
    encoding="utf-8",
)
print(f"scritto {out} ({len(data['allowlist']['terms'])} termini, {len(data['special']['categories'])} categorie)")
