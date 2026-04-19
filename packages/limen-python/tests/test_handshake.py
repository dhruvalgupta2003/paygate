from __future__ import annotations

import base64
import json

import pytest

from limen.errors import LimenError
from limen.proxy.handshake import decode_payment_header


EVM_AUTH = {
    "v": "1",
    "chain": "base",
    "scheme": "exact",
    "nonce": "01J2E3F4C5K6P7Q8R9S0T1U2V3.aaaaaaaaaaaaaaaa",
    "validUntil": 1_718_640_300,
    "payTo": "0x0000000000000000000000000000000000000001",
    "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "amount": "1000",
    "authorization": {
        "from": "0x0000000000000000000000000000000000000002",
        "to": "0x0000000000000000000000000000000000000001",
        "value": "1000",
        "validAfter": 0,
        "validBefore": 9_999_999_999,
        "nonce": "0x" + "a" * 64,
        "v": 27,
        "r": "0x" + "b" * 64,
        "s": "0x" + "c" * 64,
    },
}


def test_decodes_valid_header() -> None:
    header = base64.b64encode(json.dumps(EVM_AUTH).encode()).decode()
    auth = decode_payment_header(header)
    assert auth.chain == "base"


def test_rejects_non_base64() -> None:
    with pytest.raises(LimenError):
        decode_payment_header("not_base64_$$$")


def test_rejects_malformed_schema() -> None:
    bad = {**EVM_AUTH, "chain": "ethereum"}
    header = base64.b64encode(json.dumps(bad).encode()).decode()
    with pytest.raises(LimenError):
        decode_payment_header(header)


def test_rejects_oversized_header() -> None:
    huge = "A" * 20_000
    with pytest.raises(LimenError, match=r"(?i)header"):
        decode_payment_header(huge)
