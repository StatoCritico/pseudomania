# SPDX-License-Identifier: AGPL-3.0-or-later
"""Blocco per autorità giudiziaria: sospende la cancellazione SOLO dei dati indicati
(un utente, oppure un suo scope), fino a revoca. Ogni operazione va nel registro
amministrativo (admin_log, append-only con catena di hash)."""

from __future__ import annotations

from sqlalchemy import select, update

from .db import judicial_holds, utcnow
from .errors import BadRequest
from .registri import log_admin


class Holds:
    def __init__(self, engine):
        self.engine = engine

    def active(self) -> list[dict]:
        with self.engine.connect() as conn:
            return [dict(r) for r in conn.execute(select(judicial_holds).where(
                judicial_holds.c.revoked_at.is_(None)).order_by(judicial_holds.c.id)).mappings()]

    def all(self) -> list[dict]:
        with self.engine.connect() as conn:
            return [dict(r) for r in conn.execute(select(judicial_holds)
                                                  .order_by(judicial_holds.c.id)).mappings()]

    def add(self, *, owner: str, reference: str, actor: str, scope_type: str | None = None,
            scope_id: str | None = None, note: str | None = None) -> int:
        if not reference.strip():
            raise BadRequest("Indicare il riferimento (protocollo) della richiesta dell'autorità.")
        if bool(scope_type) != bool(scope_id):
            raise BadRequest("Per limitare il blocco a uno scope servono tipo e id.")
        with self.engine.begin() as conn:
            hid = conn.execute(judicial_holds.insert().values(
                created_at=utcnow(), reference=reference, owner_pseudonym=owner,
                scope_type=scope_type, scope_id=scope_id, note=note, created_by=actor)).inserted_primary_key[0]
        log_admin(self.engine, actor, "blocco_aggiunto", hold_id=int(hid), reference=reference,
                  owner_pseudonym=owner, scope_type=scope_type, scope_id=scope_id)
        return int(hid)

    def revoke(self, hold_id: int, *, actor: str, reference: str) -> None:
        with self.engine.begin() as conn:
            n = conn.execute(update(judicial_holds).where(judicial_holds.c.id == hold_id,
                                                          judicial_holds.c.revoked_at.is_(None))
                             .values(revoked_at=utcnow(), revoked_by=actor,
                                     revoke_reference=reference)).rowcount
        if not n:
            raise BadRequest(f"Blocco {hold_id} inesistente o già revocato.")
        log_admin(self.engine, actor, "blocco_revocato", hold_id=hold_id, reference=reference)

    @staticmethod
    def covers(holds: list[dict], owner: str, scope_type: str | None = None,
               scope_id: str | None = None) -> bool:
        """True se un blocco attivo riguarda l'utente (intero) o lo scope indicato.
        Con scope_type=None si chiede se l'utente ha QUALSIASI blocco (es. per gli escrow)."""
        for h in holds:
            if h["owner_pseudonym"] != owner:
                continue
            if h["scope_type"] is None or scope_type is None:
                return True
            if h["scope_type"] == scope_type and h["scope_id"] == scope_id:
                return True
        return False
