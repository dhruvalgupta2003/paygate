"""Structured logging via structlog.

Use :func:`get_logger` instead of ``logging.getLogger`` so log output stays
consistent and the redaction policy applies. See ``docs/security.md`` for
what must be redacted.
"""

from __future__ import annotations

import logging
import os
import sys
from typing import Any

import structlog
from structlog.stdlib import BoundLogger

_REDACT_PATHS: tuple[str, ...] = (
    "authorization",
    "cookie",
    "x-payment",
    "x-limen-admin",
    "set-cookie",
    "r",
    "s",
    "transaction",
    "signedMessage",
    "privateKey",
    "secret",
)
_REDACT_TOKEN = "[redacted]"


def _redact_event(
    _logger: object, _method: str, event_dict: dict[str, Any]
) -> dict[str, Any]:
    """Recursively redact sensitive keys in the log record."""

    def walk(value: Any) -> Any:
        if isinstance(value, dict):
            out: dict[str, Any] = {}
            for k, v in value.items():
                lower = k.lower() if isinstance(k, str) else ""
                if any(lower == path or lower.endswith("." + path) for path in _REDACT_PATHS):
                    out[k] = _REDACT_TOKEN
                else:
                    out[k] = walk(v)
            return out
        if isinstance(value, (list, tuple)):
            return [walk(item) for item in value]
        return value

    return walk(event_dict)


_configured = False


def _configure_once(level: str, *, pretty: bool) -> None:
    global _configured
    if _configured:
        return
    std_level = getattr(logging, level.upper(), logging.INFO)
    logging.basicConfig(format="%(message)s", stream=sys.stdout, level=std_level)

    processors: list[Any] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        _redact_event,
    ]
    processors.append(
        structlog.dev.ConsoleRenderer(colors=pretty)
        if pretty
        else structlog.processors.JSONRenderer()
    )
    structlog.configure(
        processors=processors,
        wrapper_class=structlog.stdlib.BoundLogger,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )
    _configured = True


def get_logger(name: str | None = None, **initial_values: Any) -> BoundLogger:
    """Return a process-wide structured logger.

    Safe to call many times. The first call configures the global structlog
    pipeline using env vars:

    - ``LIMEN_LOG_LEVEL`` (default ``INFO``)
    - ``LIMEN_LOG_PRETTY`` (``1`` to enable human-readable output)
    """
    level = os.environ.get("LIMEN_LOG_LEVEL", "INFO")
    pretty = os.environ.get("LIMEN_LOG_PRETTY", "0") == "1"
    _configure_once(level, pretty=pretty)
    logger = structlog.get_logger(name) if name else structlog.get_logger()
    if initial_values:
        logger = logger.bind(**initial_values)
    return logger  # type: ignore[return-value]


def wallet_mask(addr: str) -> str:
    """Truncate a wallet address to its first 6 and last 4 chars."""
    if not addr or len(addr) <= 12:
        return addr
    return f"{addr[:6]}\u2026{addr[-4:]}"


def nonce_mask(nonce: str) -> str:
    """Truncate a nonce to the first 8 chars for log correlation."""
    if not nonce or len(nonce) <= 8:
        return nonce
    return f"{nonce[:8]}\u2026"


__all__ = ["get_logger", "nonce_mask", "wallet_mask"]
