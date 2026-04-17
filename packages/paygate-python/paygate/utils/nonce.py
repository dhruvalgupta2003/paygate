"""Nonce + short token helpers. All nonces are bound to a requirements
digest so a client cannot replay a nonce against a different requirement.
"""

from __future__ import annotations

import hashlib
import secrets
import time

try:
    import ulid  # type: ignore[import-not-found]
except ImportError:  # pragma: no cover — ulid-py is a runtime dependency.
    ulid = None  # type: ignore[assignment]


def generate_nonce(digest: str) -> str:
    """Generate a server-issued nonce bound to the requirements digest.

    The ULID prefix gives us sortable, monotonic IDs; the hex suffix binds
    the nonce to the exact digest we signed, so a client cannot swap the
    requirement they're paying for.
    """
    if ulid is None:  # pragma: no cover
        raise RuntimeError(
            "ulid-py is required for generate_nonce; install `paygate[all]`"
        )
    nonce_id = ulid.new().str  # type: ignore[attr-defined]
    random_bytes = secrets.token_hex(8)
    suffix = hashlib.sha256(
        f"{nonce_id}|{digest}|{random_bytes}".encode("utf-8")
    ).hexdigest()[:16]
    return f"{nonce_id}.{suffix}"


def epoch_seconds() -> int:
    """Epoch seconds — safe for cross-process TTL comparisons."""
    return int(time.time())


def short_token() -> str:
    """Short, log-safe token for request correlation."""
    return secrets.token_hex(6)


__all__ = ["epoch_seconds", "generate_nonce", "short_token"]
