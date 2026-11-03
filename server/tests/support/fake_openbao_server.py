# SPDX-License-Identifier: AGPL-3.0-or-later
"""Finto OpenBao (solo /v1/sys/health e transit/hmac) per prove locali senza container.
SOLO SVILUPPO: chiave HMAC casuale in memoria, nessuna autenticazione reale.

    python tests/support/fake_openbao_server.py 8200
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import http.server
import json
import os
import sys

KEY = os.urandom(32)


class H(http.server.BaseHTTPRequestHandler):
    def _send(self, code: int, body: dict) -> None:
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path.startswith("/v1/sys/health"):
            return self._send(200, {"initialized": True, "sealed": False})
        self._send(404, {"errors": []})

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
        if self.path.startswith("/v1/transit/hmac/"):
            res = [{"hmac": "vault:v1:" + base64.b64encode(hmac.new(
                KEY, base64.b64decode(i["input"]), hashlib.sha256).digest()).decode()}
                for i in body["batch_input"]]
            return self._send(200, {"data": {"batch_results": res}})
        self._send(404, {"errors": []})

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    http.server.ThreadingHTTPServer(("127.0.0.1", int(sys.argv[1])), H).serve_forever()
