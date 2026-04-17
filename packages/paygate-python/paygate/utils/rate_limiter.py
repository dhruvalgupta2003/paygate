"""Rate limiter — token bucket, Redis Lua script for production, in-memory
fallback for tests / single-node deployments."""

from __future__ import annotations

import asyncio
import math
import time
from dataclasses import dataclass
from typing import TYPE_CHECKING, Literal

if TYPE_CHECKING:
    from redis.asyncio import Redis


RateLimitScope = Literal["wallet", "ip", "endpoint", "global"]


@dataclass(frozen=True)
class RateLimitSpec:
    scope: RateLimitScope
    limit: int
    window_seconds: int


@dataclass(frozen=True)
class RateLimitDecision:
    allowed: bool
    remaining: int
    reset_in_seconds: int


_LUA = """
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local refill = limit / window

local last = redis.call("HMGET", key, "tokens", "ts")
local tokens = tonumber(last[1])
local ts = tonumber(last[2])

if tokens == nil or ts == nil then
  tokens = limit
  ts = now
end

local delta = math.max(0, now - ts)
tokens = math.min(limit, tokens + delta * refill)

local allowed = 0
if tokens >= 1 then
  tokens = tokens - 1
  allowed = 1
end

redis.call("HMSET", key, "tokens", tokens, "ts", now)
redis.call("EXPIRE", key, window * 2)

local reset = math.ceil((1 - tokens) / refill)
if reset < 0 then reset = 0 end
return { allowed, math.floor(tokens), reset }
"""


class RedisRateLimiter:
    """Production rate limiter. Uses a Redis Lua script to atomically
    update a per-scope token bucket."""

    def __init__(self, redis: Redis, key_prefix: str = "paygate:rl:") -> None:
        self._redis = redis
        self._prefix = key_prefix
        self._script_sha: str | None = None

    async def check_and_consume(
        self, key: str, spec: RateLimitSpec
    ) -> RateLimitDecision:
        k = f"{self._prefix}{spec.scope}:{key}"
        now = time.time()
        res = await self._eval(k, spec.limit, spec.window_seconds, now)
        allowed, remaining, reset = int(res[0]), int(res[1]), int(res[2])
        return RateLimitDecision(
            allowed=allowed == 1,
            remaining=remaining,
            reset_in_seconds=reset,
        )

    async def _eval(
        self, key: str, limit: int, window_seconds: int, now: float
    ) -> list[int]:
        if self._script_sha is None:
            self._script_sha = await self._redis.script_load(_LUA)
        try:
            return await self._redis.evalsha(
                self._script_sha,
                1,
                key,
                str(limit),
                str(window_seconds),
                str(now),
            )
        except Exception as err:  # pragma: no cover — defensive retry
            if "NOSCRIPT" in str(err):
                self._script_sha = None
                return await self._eval(key, limit, window_seconds, now)
            raise


class InMemoryRateLimiter:
    """Process-local token bucket. Scope-separated."""

    def __init__(self) -> None:
        self._buckets: dict[str, tuple[float, float]] = {}
        self._lock = asyncio.Lock()

    async def check_and_consume(
        self, key: str, spec: RateLimitSpec
    ) -> RateLimitDecision:
        async with self._lock:
            now = time.time()
            bucket_key = f"{spec.scope}:{key}"
            refill = spec.limit / spec.window_seconds
            tokens, ts = self._buckets.get(bucket_key, (float(spec.limit), now))
            elapsed = max(0.0, now - ts)
            tokens = min(float(spec.limit), tokens + elapsed * refill)
            if tokens < 1:
                self._buckets[bucket_key] = (tokens, now)
                reset = math.ceil((1 - tokens) / refill) if refill > 0 else 1
                return RateLimitDecision(
                    allowed=False,
                    remaining=math.floor(tokens),
                    reset_in_seconds=reset,
                )
            next_tokens = tokens - 1
            self._buckets[bucket_key] = (next_tokens, now)
            return RateLimitDecision(
                allowed=True,
                remaining=math.floor(next_tokens),
                reset_in_seconds=0,
            )


__all__ = [
    "InMemoryRateLimiter",
    "RateLimitDecision",
    "RateLimitScope",
    "RateLimitSpec",
    "RedisRateLimiter",
]
