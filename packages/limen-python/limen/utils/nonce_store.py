"""Nonce store implementations — Redis for production, in-memory for tests."""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from redis.asyncio import Redis


class InMemoryNonceStore:
    """Process-local store. Good for tests / single-node development.

    Does not coordinate across processes; production deployments should use
    :class:`RedisNonceStore`.
    """

    def __init__(self) -> None:
        self._nonces: dict[str, float] = {}
        self._requirements: dict[str, _Entry] = {}
        self._lock = asyncio.Lock()

    async def claim(self, nonce: str, ttl_seconds: int) -> bool:
        async with self._lock:
            self._sweep()
            if nonce in self._nonces:
                return False
            self._nonces[nonce] = time.time() + ttl_seconds
            return True

    async def put_requirement(
        self, nonce: str, digest: str, ttl_seconds: int
    ) -> None:
        async with self._lock:
            self._requirements[nonce] = _Entry(
                value=digest, expires_at=time.time() + ttl_seconds
            )

    async def get_requirement(self, nonce: str) -> str | None:
        async with self._lock:
            entry = self._requirements.get(nonce)
            if entry is None:
                return None
            if time.time() > entry.expires_at:
                self._requirements.pop(nonce, None)
                return None
            return entry.value

    def _sweep(self) -> None:
        now = time.time()
        expired_nonces = [k for k, exp in self._nonces.items() if exp <= now]
        for key in expired_nonces:
            self._nonces.pop(key, None)
        expired_reqs = [
            k for k, entry in self._requirements.items() if entry.expires_at <= now
        ]
        for key in expired_reqs:
            self._requirements.pop(key, None)


@dataclass
class _Entry:
    value: str
    expires_at: float


class RedisNonceStore:
    """Redis-backed nonce store. Uses ``SET NX EX`` for atomic claim."""

    def __init__(self, redis: Redis, key_prefix: str = "limen:") -> None:
        self._redis = redis
        self._prefix = key_prefix

    async def claim(self, nonce: str, ttl_seconds: int) -> bool:
        key = f"{self._prefix}nonce:{nonce}"
        result = await self._redis.set(key, "1", ex=ttl_seconds, nx=True)
        return bool(result)

    async def put_requirement(
        self, nonce: str, digest: str, ttl_seconds: int
    ) -> None:
        key = f"{self._prefix}req:{nonce}"
        await self._redis.set(key, digest, ex=ttl_seconds, nx=True)

    async def get_requirement(self, nonce: str) -> str | None:
        key = f"{self._prefix}req:{nonce}"
        value = await self._redis.get(key)
        if value is None:
            return None
        if isinstance(value, bytes):
            return value.decode("utf-8")
        return str(value)


__all__ = ["InMemoryNonceStore", "RedisNonceStore"]
