"""Limen — placeholder release.

The actual SDK ships at 0.1+. Track progress and install from source:
https://github.com/dhruvalgupta2003/limen
"""

from __future__ import annotations

import warnings

__version__ = "0.0.1"
__placeholder__ = True
__homepage__ = "https://github.com/dhruvalgupta2003/limen"

warnings.warn(
    "limen 0.0.1 is a placeholder release. The real SDK ships at 0.1+. "
    f"See {__homepage__}",
    UserWarning,
    stacklevel=2,
)
