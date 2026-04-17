"""Public error surface. Codes are stable strings; do not rename without a
major version bump. See docs/error-handling.md for semantics.

Mirror of ``packages/paygate-node/src/errors.ts`` — codes, HTTP statuses,
and retryability are identical.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any


class ErrorCode(str, Enum):
    """Stable machine-readable error codes. Do not rename."""

    PAYMENT_REQUIRED = "PAYMENT_REQUIRED"
    INVALID_PAYMENT_HEADER = "INVALID_PAYMENT_HEADER"
    INVALID_SIGNATURE = "INVALID_SIGNATURE"
    EXPIRED_AUTHORIZATION = "EXPIRED_AUTHORIZATION"
    NONCE_REUSED = "NONCE_REUSED"
    NONCE_UNKNOWN = "NONCE_UNKNOWN"
    DIGEST_MISMATCH = "DIGEST_MISMATCH"
    RECIPIENT_MISMATCH = "RECIPIENT_MISMATCH"
    CHAIN_MISMATCH = "CHAIN_MISMATCH"
    ASSET_MISMATCH = "ASSET_MISMATCH"
    AMOUNT_INSUFFICIENT = "AMOUNT_INSUFFICIENT"
    SETTLEMENT_PENDING = "SETTLEMENT_PENDING"
    SETTLEMENT_FAILED = "SETTLEMENT_FAILED"
    COMPLIANCE_BLOCKED = "COMPLIANCE_BLOCKED"
    RATE_LIMITED = "RATE_LIMITED"
    UPSTREAM_FAILED = "UPSTREAM_FAILED"
    UPSTREAM_TIMEOUT = "UPSTREAM_TIMEOUT"
    SERVICE_DEGRADED = "SERVICE_DEGRADED"
    RPC_UNAVAILABLE = "RPC_UNAVAILABLE"
    BAD_CONFIG = "BAD_CONFIG"
    INTERNAL = "INTERNAL"


@dataclass(frozen=True)
class _StatusRow:
    http: int
    retryable: bool


_STATUS: dict[ErrorCode, _StatusRow] = {
    ErrorCode.PAYMENT_REQUIRED: _StatusRow(http=402, retryable=True),
    ErrorCode.INVALID_PAYMENT_HEADER: _StatusRow(http=400, retryable=False),
    ErrorCode.INVALID_SIGNATURE: _StatusRow(http=402, retryable=False),
    ErrorCode.EXPIRED_AUTHORIZATION: _StatusRow(http=402, retryable=True),
    ErrorCode.NONCE_REUSED: _StatusRow(http=402, retryable=False),
    ErrorCode.NONCE_UNKNOWN: _StatusRow(http=402, retryable=True),
    ErrorCode.DIGEST_MISMATCH: _StatusRow(http=402, retryable=False),
    ErrorCode.RECIPIENT_MISMATCH: _StatusRow(http=402, retryable=False),
    ErrorCode.CHAIN_MISMATCH: _StatusRow(http=402, retryable=False),
    ErrorCode.ASSET_MISMATCH: _StatusRow(http=402, retryable=False),
    ErrorCode.AMOUNT_INSUFFICIENT: _StatusRow(http=402, retryable=True),
    ErrorCode.SETTLEMENT_PENDING: _StatusRow(http=202, retryable=True),
    ErrorCode.SETTLEMENT_FAILED: _StatusRow(http=402, retryable=True),
    ErrorCode.COMPLIANCE_BLOCKED: _StatusRow(http=451, retryable=False),
    ErrorCode.RATE_LIMITED: _StatusRow(http=429, retryable=True),
    ErrorCode.UPSTREAM_FAILED: _StatusRow(http=502, retryable=True),
    ErrorCode.UPSTREAM_TIMEOUT: _StatusRow(http=504, retryable=True),
    ErrorCode.SERVICE_DEGRADED: _StatusRow(http=503, retryable=True),
    ErrorCode.RPC_UNAVAILABLE: _StatusRow(http=503, retryable=True),
    ErrorCode.BAD_CONFIG: _StatusRow(http=500, retryable=False),
    ErrorCode.INTERNAL: _StatusRow(http=500, retryable=True),
}


class PayGateError(Exception):
    """Base exception. Every PayGate error carries:
    - ``code``: stable enum string
    - ``http``: HTTP status to return to the caller
    - ``retryable``: whether the caller should try again
    - ``detail``: human-readable free-form message
    - ``retry_after_ms``: optional delay hint for retryable errors
    - ``extra``: additional structured context

    Use ``to_json()`` to render the wire format. Never log the exception
    object directly — that can include untrusted cause chains.
    """

    code: ErrorCode
    http: int
    retryable: bool
    detail: str
    retry_after_ms: int | None
    extra: dict[str, Any]

    def __init__(
        self,
        code: ErrorCode | str,
        detail: str | None = None,
        *,
        cause: BaseException | None = None,
        retry_after_ms: int | None = None,
        extra: dict[str, Any] | None = None,
    ) -> None:
        resolved = code if isinstance(code, ErrorCode) else ErrorCode(code)
        self.code = resolved
        self.detail = detail if detail is not None else resolved.value
        row = _STATUS[resolved]
        self.http = row.http
        self.retryable = row.retryable
        self.retry_after_ms = retry_after_ms
        self.extra = dict(extra) if extra is not None else {}
        super().__init__(self.detail)
        if cause is not None:
            self.__cause__ = cause

    @property
    def name(self) -> str:
        return "PayGateError"

    def to_json(self) -> dict[str, Any]:
        """Serialise to the stable error envelope sent over the wire."""
        body: dict[str, Any] = {
            "error": self.code.value,
            "detail": self.detail,
            "retryable": self.retryable,
        }
        if self.retry_after_ms is not None:
            body["retryAfterMs"] = self.retry_after_ms
        body["docs"] = f"https://paygate.dev/docs/errors#{self.code.value.lower()}"
        body.update(self.extra)
        return body

    def __repr__(self) -> str:
        return f"PayGateError(code={self.code.value}, http={self.http}, detail={self.detail!r})"


def is_paygate_error(e: object) -> bool:
    return isinstance(e, PayGateError)


def err_http_status(code: ErrorCode | str) -> int:
    resolved = code if isinstance(code, ErrorCode) else ErrorCode(code)
    return _STATUS[resolved].http


def err_is_retryable(code: ErrorCode | str) -> bool:
    resolved = code if isinstance(code, ErrorCode) else ErrorCode(code)
    return _STATUS[resolved].retryable
