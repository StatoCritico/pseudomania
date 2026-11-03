# SPDX-License-Identifier: AGPL-3.0-or-later
"""Errori applicativi: risposta JSON {"error": code, "message": str} (SPEC)."""

from __future__ import annotations


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


class Unauthorized(ApiError):
    def __init__(self, message: str = "Token di accesso non valido o scaduto."):
        super().__init__(401, "unauthorized", message)


class PayloadTooLarge(ApiError):
    def __init__(self, max_mb: int):
        super().__init__(413, "file_too_large",
                         f"Il file supera la dimensione massima consentita ({max_mb} MB).")


class DetectorUnavailable(ApiError):
    def __init__(self, message: str = "Il servizio di rilevamento dei dati personali non è "
                                      "disponibile. Riprova tra qualche minuto."):
        super().__init__(503, "detector_unavailable", message)


class KeyServiceUnavailable(ApiError):
    def __init__(self, message: str = "Il servizio di cifratura del dizionario non è "
                                      "disponibile. Contatta l'assistenza."):
        super().__init__(503, "keyservice_unavailable", message)


class BadRequest(ApiError):
    def __init__(self, message: str, code: str = "invalid_request"):
        super().__init__(400, code, message)


class NotFound(ApiError):
    def __init__(self, message: str = "Risorsa non trovata."):
        super().__init__(404, "not_found", message)


class Conflict(ApiError):
    def __init__(self, message: str, code: str = "conflict"):
        super().__init__(409, code, message)
