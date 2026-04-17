"""Convenience re-export so ``from paygate.flask import paygate_middleware`` works."""

from paygate.middleware.flask import paygate_middleware

__all__ = ["paygate_middleware"]
