from __future__ import annotations

from limen.errors import LimenError, is_limen_error


def test_stable_status_and_retry() -> None:
    e = LimenError(code="RATE_LIMITED", detail="slow down", retry_after_ms=2000)
    assert e.http == 429
    assert e.retryable is True
    assert e.retry_after_ms == 2000


def test_serialization() -> None:
    e = LimenError(code="AMOUNT_INSUFFICIENT", detail="short")
    body = e.to_json()
    assert body["error"] == "AMOUNT_INSUFFICIENT"
    assert body["retryable"] is True
    assert "amount_insufficient" in body["docs"]


def test_type_guard() -> None:
    assert is_limen_error(LimenError(code="INTERNAL"))
    assert not is_limen_error(ValueError("nope"))
