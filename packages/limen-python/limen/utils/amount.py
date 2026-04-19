"""USDC amounts are integer ``int`` micros (6 decimal places).

We never use floats for money. :class:`decimal.Decimal` is used only at the
configuration edge when ingesting human-written values. The rest of the
pipeline operates on :class:`int` micros.
"""

from __future__ import annotations

import re

from ..constants import USDC_DECIMALS

_TEN_POW_USDC: int = 10**USDC_DECIMALS
_USDC_STR_RE = re.compile(r"^\d+(\.\d{1,6})?$")


def usdc_to_micros(usdc: str) -> int:
    """Parse a USDC decimal string into integer micros.

    ``usdc_to_micros("1")`` -> 1_000_000
    ``usdc_to_micros("0.001")`` -> 1_000

    Raises :class:`ValueError` on any invalid input. Floats are rejected at
    the string boundary to guarantee we never introduce binary rounding.
    """
    if not isinstance(usdc, str):
        raise ValueError(f"usdc_to_micros expected a str, got {type(usdc).__name__}")
    stripped = usdc.strip()
    if not _USDC_STR_RE.match(stripped):
        raise ValueError(f"invalid USDC amount: {usdc!r}")
    if "." in stripped:
        whole_raw, frac_raw = stripped.split(".", 1)
    else:
        whole_raw, frac_raw = stripped, ""
    whole = int(whole_raw) if whole_raw else 0
    frac_padded = (frac_raw + "000000")[:USDC_DECIMALS]
    frac = int(frac_padded) if frac_padded else 0
    return whole * _TEN_POW_USDC + frac


def micros_to_usdc(micros: int) -> str:
    """Render integer micros as a fixed-precision USDC decimal string."""
    if not isinstance(micros, int) or isinstance(micros, bool):
        raise ValueError(
            f"micros_to_usdc expected int micros, got {type(micros).__name__}"
        )
    sign = "-" if micros < 0 else ""
    absolute = -micros if micros < 0 else micros
    whole = absolute // _TEN_POW_USDC
    frac = absolute % _TEN_POW_USDC
    frac_str = str(frac).rjust(USDC_DECIMALS, "0")
    return f"{sign}{whole}.{frac_str}"


def int_max(a: int, b: int) -> int:
    return a if a > b else b


def int_min(a: int, b: int) -> int:
    return a if a < b else b


__all__ = ["int_max", "int_min", "micros_to_usdc", "usdc_to_micros"]
