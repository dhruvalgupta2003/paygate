"""Canonical JSON + SHA-256 requirement digest.

The digest is a cross-language contract: the TypeScript SDK uses the same
algorithm (sorted keys, no whitespace, UTF-8, JSON scalar encoding). A
requirement digest produced in one language must verify in the other.
"""

from __future__ import annotations

import hashlib
import hmac
import json
from typing import Any

from ..types import PaymentRequirements


def _encode_scalar(value: Any) -> str:
    """Encode a JSON scalar the way ``JSON.stringify`` does.

    - ``None`` -> "null"
    - ``bool`` -> "true" / "false"
    - ``int`` -> integer literal (TS ``JSON.stringify`` emits integers as
      integers; we must not add ``.0`` here).
    - ``float`` -> shortest round-trip string. We forbid non-finite values.
    - ``str`` -> JSON-escaped double-quoted string, UTF-8 safe.
    """
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        if value != value or value in (float("inf"), float("-inf")):  # NaN/inf
            raise ValueError("canonical_json does not accept NaN / inf")
        # json.dumps gives us the shortest JS-compatible representation.
        return json.dumps(value)
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False)
    raise TypeError(f"canonical_json: unsupported scalar type {type(value).__name__}")


def canonical_json(value: Any) -> str:
    """Produce a deterministic JSON string (sorted keys, no whitespace).

    This matches the TypeScript ``canonicalJson`` byte-for-byte so that
    :func:`digest_requirements` produces the same SHA-256 hex across both
    SDKs for the same input.
    """
    if value is None or not isinstance(value, (dict, list, tuple)):
        return _encode_scalar(value)
    if isinstance(value, (list, tuple)):
        return "[" + ",".join(canonical_json(v) for v in value) + "]"
    # Dict: sort keys, serialise in sorted order.
    keys = sorted(value.keys())
    parts = [f"{json.dumps(k, ensure_ascii=False)}:{canonical_json(value[k])}" for k in keys]
    return "{" + ",".join(parts) + "}"


def _requirements_to_dict(req: PaymentRequirements | dict[str, Any]) -> dict[str, Any]:
    """Normalise a ``PaymentRequirements`` (or dict) to a plain dict, dropping
    ``digest`` before hashing and pruning ``None`` fields that never appear
    in the TypeScript requirement payload."""
    if isinstance(req, PaymentRequirements):
        raw = req.model_dump(by_alias=True, exclude_none=True)
    else:
        raw = {k: v for k, v in dict(req).items() if v is not None}
    raw.pop("digest", None)
    return raw


def digest_requirements(req: PaymentRequirements | dict[str, Any]) -> str:
    """Compute the canonical SHA-256 digest for a payment requirement.

    Returns a string like ``sha256:<64 hex chars>``.
    """
    payload = _requirements_to_dict(req)
    canon = canonical_json(payload)
    digest = hashlib.sha256(canon.encode("utf-8")).hexdigest()
    return f"sha256:{digest}"


def constant_time_equal(a: str, b: str) -> bool:
    """Constant-time string comparison. Returns False on length mismatch."""
    ab = a.encode("utf-8")
    bb = b.encode("utf-8")
    if len(ab) != len(bb):
        return False
    return hmac.compare_digest(ab, bb)


# Backwards-compatible alias — matches the TS export name.
constant_time_equal_string = constant_time_equal


__all__ = [
    "canonical_json",
    "constant_time_equal",
    "constant_time_equal_string",
    "digest_requirements",
]
