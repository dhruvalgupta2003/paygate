from __future__ import annotations

from paygate.errors import PayGateError, is_paygate_error


def test_stable_status_and_retry() -> None:
    e = PayGateError(code="RATE_LIMITED", detail="slow down", retry_after_ms=2000)
    assert e.http == 429
    assert e.retryable is True
    assert e.retry_after_ms == 2000


def test_serialization() -> None:
    e = PayGateError(code="AMOUNT_INSUFFICIENT", detail="short")
    body = e.to_json()
    assert body["error"] == "AMOUNT_INSUFFICIENT"
    assert body["retryable"] is True
    assert "amount_insufficient" in body["docs"]


def test_type_guard() -> None:
    assert is_paygate_error(PayGateError(code="INTERNAL"))
    assert not is_paygate_error(ValueError("nope"))
