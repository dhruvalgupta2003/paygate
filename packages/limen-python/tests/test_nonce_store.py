from __future__ import annotations

import pytest

from limen.utils.nonce_store import InMemoryNonceStore


@pytest.mark.asyncio
async def test_claims_nonce_once() -> None:
    s = InMemoryNonceStore()
    assert await s.claim("n1", 60) is True
    assert await s.claim("n1", 60) is False


@pytest.mark.asyncio
async def test_stores_requirement() -> None:
    s = InMemoryNonceStore()
    await s.put_requirement("n2", "sha256:xx", 60)
    assert await s.get_requirement("n2") == "sha256:xx"
    assert await s.get_requirement("missing") is None
