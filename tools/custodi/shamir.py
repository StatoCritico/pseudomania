# SPDX-License-Identifier: AGPL-3.0-or-later
"""Condivisione del segreto di Shamir su GF(2^8), byte per byte.

Campo GF(256) con il polinomio irriducibile di AES (x^8 + x^4 + x^3 + x + 1, 0x11B) e
generatore 3. Ogni byte del segreto è il termine noto di un polinomio casuale di grado
soglia-1; la quota i-esima contiene il valore del polinomio in x = i (1..255).
Con meno di `soglia` quote il segreto è indeterminato (sicurezza informazionale).
Implementazione senza dipendenze, coefficienti da `secrets` (CSPRNG del sistema).
"""

from __future__ import annotations

import secrets

_EXP = [0] * 512
_LOG = [0] * 256


def _init_tables() -> None:
    x = 1
    for i in range(255):
        _EXP[i] = x
        _LOG[x] = i
        # moltiplicazione per il generatore 3: x*2 xor x, ridotta modulo 0x11B
        x2 = x << 1
        if x2 & 0x100:
            x2 ^= 0x11B
        x = x2 ^ x
    for i in range(255, 512):
        _EXP[i] = _EXP[i - 255]


_init_tables()


def gf_mul(a: int, b: int) -> int:
    if a == 0 or b == 0:
        return 0
    return _EXP[_LOG[a] + _LOG[b]]


def gf_div(a: int, b: int) -> int:
    if b == 0:
        raise ZeroDivisionError("divisione per zero in GF(256)")
    if a == 0:
        return 0
    return _EXP[(_LOG[a] - _LOG[b]) % 255]


def split(secret: bytes, n: int, k: int) -> list[tuple[int, bytes]]:
    """-> [(x, quota)] con x = 1..n. Servono k quote per ricostruire."""
    if not (2 <= k <= n <= 255):
        raise ValueError("serve 2 <= soglia <= quote <= 255")
    shares = [bytearray() for _ in range(n)]
    for byte in secret:
        coeffs = [byte] + [secrets.randbelow(256) for _ in range(k - 1)]
        for i in range(n):
            x = i + 1
            # valutazione con lo schema di Horner
            y = 0
            for c in reversed(coeffs):
                y = gf_mul(y, x) ^ c
            shares[i].append(y)
    return [(i + 1, bytes(s)) for i, s in enumerate(shares)]


def combine(shares: list[tuple[int, bytes]]) -> bytes:
    """Interpolazione di Lagrange in x = 0. Le quote devono avere x distinti e stessa lunghezza."""
    if len(shares) < 2:
        raise ValueError("servono almeno 2 quote")
    xs = [x for x, _ in shares]
    if len(set(xs)) != len(xs) or any(not (1 <= x <= 255) for x in xs):
        raise ValueError("indici delle quote non validi o ripetuti")
    length = len(shares[0][1])
    if any(len(s) != length for _, s in shares):
        raise ValueError("quote di lunghezza diversa")
    out = bytearray(length)
    for i, (xi, si) in enumerate(shares):
        # coefficiente di Lagrange l_i(0) = prod_{j!=i} x_j / (x_j - x_i); in GF(2^8) "-" = xor
        num, den = 1, 1
        for j, (xj, _) in enumerate(shares):
            if j != i:
                num = gf_mul(num, xj)
                den = gf_mul(den, xj ^ xi)
        li = gf_div(num, den)
        for b in range(length):
            out[b] ^= gf_mul(si[b], li)
    return bytes(out)
