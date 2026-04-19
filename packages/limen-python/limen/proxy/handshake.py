"""X-PAYMENT header decoder + 402 response encoder.

Mirrors ``packages/limen-node/src/proxy/handshake.ts``.
"""

from __future__ import annotations

import base64
import binascii
import json
import re
from typing import Any

from pydantic import ValidationError

from ..constants import MAX_X_PAYMENT_HEADER_BYTES, X402_VERSION
from ..errors import ErrorCode, LimenError
from ..types import (
    EvmAuthorization,
    EvmPaymentAuth,
    PaymentAuth,
    PaymentRequirements,
    SolanaPaymentAuth,
)

# -- 402 encoder ------------------------------------------------------------


def encode_requirements(req: PaymentRequirements) -> dict[str, Any]:
    """Build the 402 body + headers for a given PaymentRequirements object.

    Returns a dict of ``status``, ``headers``, ``body`` — the caller is
    responsible for serialising ``body`` as JSON before sending.
    """
    return {
        "status": 402,
        "headers": {
            "Content-Type": "application/vnd.x402+json",
            "x402-version": X402_VERSION,
            "Cache-Control": "no-store",
        },
        "body": {
            "error": ErrorCode.PAYMENT_REQUIRED.value,
            "paymentRequirements": req.model_dump(by_alias=True, exclude_none=True),
            "retryable": True,
            "docs": "https://limen.dev/docs/errors#payment_required",
        },
    }


# -- X-PAYMENT header schemas ----------------------------------------------
_HEX40 = re.compile(r"^0x[0-9a-fA-F]{40}$")
_HEX64 = re.compile(r"^0x[0-9a-fA-F]{64}$")
_SOLANA_ADDR = re.compile(r"^[1-9A-HJ-NP-Za-km-z]{32,44}$")
_DIGITS = re.compile(r"^\d+$")


def _check_regex(value: str, pattern: re.Pattern[str], name: str) -> None:
    if not isinstance(value, str) or not pattern.match(value):
        raise ValueError(f"{name} does not match required shape")


def _validate_evm(data: dict[str, Any]) -> EvmPaymentAuth:
    required_auth = {"from", "to", "value", "validAfter", "validBefore", "nonce", "v", "r", "s"}
    missing = required_auth - data.get("authorization", {}).keys()
    if missing:
        raise ValueError(f"authorization missing fields: {sorted(missing)}")
    auth_block = data["authorization"]
    _check_regex(data["payTo"], _HEX40, "payTo")
    _check_regex(data["asset"], _HEX40, "asset")
    _check_regex(data["amount"], _DIGITS, "amount")
    _check_regex(auth_block["from"], _HEX40, "authorization.from")
    _check_regex(auth_block["to"], _HEX40, "authorization.to")
    _check_regex(auth_block["value"], _DIGITS, "authorization.value")
    _check_regex(auth_block["nonce"], _HEX64, "authorization.nonce")
    _check_regex(auth_block["r"], _HEX64, "authorization.r")
    _check_regex(auth_block["s"], _HEX64, "authorization.s")
    if not isinstance(data.get("validUntil"), int) or data["validUntil"] <= 0:
        raise ValueError("validUntil must be a positive integer")
    if not isinstance(auth_block.get("validBefore"), int) or auth_block["validBefore"] <= 0:
        raise ValueError("authorization.validBefore must be a positive integer")
    if not isinstance(auth_block.get("validAfter"), int) or auth_block["validAfter"] < 0:
        raise ValueError("authorization.validAfter must be >= 0")

    normalised_auth = {**auth_block, "from": auth_block["from"]}
    payload = {**data, "authorization": normalised_auth}

    try:
        auth_model = EvmAuthorization.model_validate(
            {
                **{k: v for k, v in normalised_auth.items() if k != "from"},
                "from": normalised_auth["from"],
            }
        )
    except ValidationError as err:
        raise ValueError(f"evm authorization invalid: {err}") from err

    return EvmPaymentAuth(
        v=payload["v"],
        chain=payload["chain"],
        scheme=payload["scheme"],
        nonce=payload["nonce"],
        validUntil=payload["validUntil"],
        payTo=payload["payTo"],
        asset=payload["asset"],
        amount=payload["amount"],
        authorization=auth_model,
        settlementTxHash=payload.get("settlementTxHash"),
    )


def _validate_solana(data: dict[str, Any]) -> SolanaPaymentAuth:
    _check_regex(data["payTo"], _SOLANA_ADDR, "payTo")
    _check_regex(data["mint"], _SOLANA_ADDR, "mint")
    _check_regex(data["amount"], _DIGITS, "amount")
    if not isinstance(data.get("transaction"), str) or not data["transaction"]:
        raise ValueError("transaction must be a non-empty base64 string")
    if not isinstance(data.get("validUntil"), int) or data["validUntil"] <= 0:
        raise ValueError("validUntil must be a positive integer")
    return SolanaPaymentAuth(
        v=data["v"],
        chain=data["chain"],
        scheme=data["scheme"],
        nonce=data["nonce"],
        validUntil=data["validUntil"],
        payTo=data["payTo"],
        mint=data["mint"],
        amount=data["amount"],
        transaction=data["transaction"],
        settlementSignature=data.get("settlementSignature"),
    )


def decode_payment_header(header_value: str) -> PaymentAuth:
    """Decode the X-PAYMENT header. Raises :class:`LimenError` with
    ``INVALID_PAYMENT_HEADER`` on any schema failure, oversized input, or
    malformed base64/JSON.
    """
    if not isinstance(header_value, str):
        raise LimenError(
            code=ErrorCode.INVALID_PAYMENT_HEADER,
            detail="X-PAYMENT header must be a string",
        )
    if len(header_value) > MAX_X_PAYMENT_HEADER_BYTES:
        raise LimenError(
            code=ErrorCode.INVALID_PAYMENT_HEADER,
            detail=f"X-PAYMENT header exceeds {MAX_X_PAYMENT_HEADER_BYTES} bytes",
        )

    try:
        raw_bytes = base64.b64decode(header_value, validate=True)
    except (binascii.Error, ValueError) as err:
        raise LimenError(
            code=ErrorCode.INVALID_PAYMENT_HEADER,
            detail="X-PAYMENT header must be valid base64",
            cause=err,
        ) from err

    try:
        json_str = raw_bytes.decode("utf-8")
    except UnicodeDecodeError as err:
        raise LimenError(
            code=ErrorCode.INVALID_PAYMENT_HEADER,
            detail="X-PAYMENT body must be valid UTF-8",
            cause=err,
        ) from err

    try:
        parsed = json.loads(json_str)
    except json.JSONDecodeError as err:
        raise LimenError(
            code=ErrorCode.INVALID_PAYMENT_HEADER,
            detail="X-PAYMENT body must be valid JSON",
            cause=err,
        ) from err

    if not isinstance(parsed, dict):
        raise LimenError(
            code=ErrorCode.INVALID_PAYMENT_HEADER,
            detail="X-PAYMENT body must be a JSON object",
        )

    try:
        _require_literal(parsed, "v", "1")
        _require_literal(parsed, "scheme", "exact")
        if not isinstance(parsed.get("nonce"), str) or not parsed["nonce"]:
            raise ValueError("nonce must be a non-empty string")
        chain = parsed.get("chain")
        if chain in ("base", "base-sepolia"):
            return _validate_evm(parsed)
        if chain in ("solana", "solana-devnet"):
            return _validate_solana(parsed)
        raise ValueError(f"unknown chain: {chain!r}")
    except (ValueError, KeyError, ValidationError) as err:
        raise LimenError(
            code=ErrorCode.INVALID_PAYMENT_HEADER,
            detail=f"X-PAYMENT schema validation failed: {err}",
            cause=err,
        ) from err


def _require_literal(data: dict[str, Any], key: str, expected: str) -> None:
    if data.get(key) != expected:
        raise ValueError(f"{key} must be {expected!r}, got {data.get(key)!r}")


def is_evm_auth(auth: PaymentAuth) -> bool:
    return isinstance(auth, EvmPaymentAuth)


def is_solana_auth(auth: PaymentAuth) -> bool:
    return isinstance(auth, SolanaPaymentAuth)


__all__ = [
    "decode_payment_header",
    "encode_requirements",
    "is_evm_auth",
    "is_solana_auth",
]
