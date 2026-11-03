# SPDX-License-Identifier: AGPL-3.0-or-later
"""Avvia il VERO server Flask di Rizzo-PII (src/app/app.py) senza il modello neurale:
torch/transformers sono sostituiti da stub e il modello non trova entità, quindi resta
attiva solo la rete regex+checksum di Rizzo. Serve a verificare il formato reale di
/analyze e /health quando l'immagine Docker non si può costruire (niente rete verso
Hugging Face o i registri).

Uso:  python tests/support/run_rizzo_stub.py /percorso/rizzo-pii [porta]
"""

from __future__ import annotations

import os
import sys
import tempfile
import types


def main() -> None:
    repo = os.path.abspath(sys.argv[1])
    port = int(sys.argv[2]) if len(sys.argv) > 2 else 5005

    torch = types.ModuleType("torch")
    torch.cuda = types.SimpleNamespace(is_available=lambda: False)
    sys.modules["torch"] = torch

    transformers = types.ModuleType("transformers")

    def pipeline(*_a, **_kw):
        def run(inputs):
            return [[] for _ in inputs] if isinstance(inputs, list) else []
        return run

    transformers.pipeline = pipeline
    sys.modules["transformers"] = transformers
    try:
        import fitz  # noqa: F401
    except ImportError:
        sys.modules["fitz"] = types.ModuleType("fitz")

    os.environ["PII_MODEL_DIR"] = tempfile.mkdtemp(prefix="rizzo-stub-model-")
    os.environ["HOME"] = tempfile.mkdtemp(prefix="rizzo-stub-home-")
    sys.path.insert(0, os.path.join(repo, "src", "app"))
    import app as rizzo_app  # noqa: E402

    rizzo_app.app.run(host="127.0.0.1", port=port)


if __name__ == "__main__":
    main()
