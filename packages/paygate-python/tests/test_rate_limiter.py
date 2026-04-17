from __future__ import annotations

import pytest

from paygate.utils.rate_limiter import InMemoryRateLimiter, RateLimitSpec


@pytest.mark.asyncio
async def test_limit_then_deny() -> None:
    rl = InMemoryRateLimiter()
    spec = RateLimitSpec(scope="wallet", limit=5, window_seconds=60)
    denied = 0
    for _ in range(10):
        d = await rl.check_and_consume("k", spec)
        if not d.allowed:
            denied += 1
    assert denied >= 4


@pytest.mark.asyncio
async def test_scope_separation() -> None:
    rl = InMemoryRateLimiter()
    a = await rl.check_and_consume("k", RateLimitSpec(scope="wallet", limit=1, window_seconds=60))
    b = await rl.check_and_consume("k", RateLimitSpec(scope="ip", limit=1, window_seconds=60))
    assert a.allowed and b.allowed
