"""FastAPI adapter.

FastAPI is a Starlette superset, so the Starlette middleware works as-is.
We re-export it here for import ergonomics::

    from paygate.fastapi import PayGateMiddleware

    app.add_middleware(PayGateMiddleware, wallets={...}, endpoints=[...])
"""

from __future__ import annotations

from paygate.middleware.starlette import PayGateMiddleware

__all__ = ["PayGateMiddleware"]
