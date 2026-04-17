"""Convenience re-export so ``from paygate.django import PayGateMiddleware`` works."""

from paygate.middleware.django import PayGateMiddleware

__all__ = ["PayGateMiddleware"]
