"""Convenience re-export so ``from paygate.fastapi import PayGateMiddleware`` works."""

from paygate.middleware.fastapi import PayGateMiddleware

__all__ = ["PayGateMiddleware"]
