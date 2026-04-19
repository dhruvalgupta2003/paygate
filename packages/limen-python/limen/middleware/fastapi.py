"""FastAPI adapter.

FastAPI is a Starlette superset, so the Starlette middleware works as-is.
We re-export it here for import ergonomics::

    from limen.fastapi import LimenMiddleware

    app.add_middleware(LimenMiddleware, wallets={...}, endpoints=[...])
"""

from __future__ import annotations

from limen.middleware.starlette import LimenMiddleware

__all__ = ["LimenMiddleware"]
