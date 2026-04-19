"""Canonical JSON + digest — must match the TypeScript implementation byte-for-byte."""

from __future__ import annotations

from limen.utils.digest import canonical_json, constant_time_equal, digest_requirements


class TestCanonicalJson:
    def test_key_order_independence(self) -> None:
        assert canonical_json({"b": 1, "a": 2}) == canonical_json({"a": 2, "b": 1})

    def test_escapes(self) -> None:
        assert canonical_json('a"b') == '"a\\"b"'

    def test_nested(self) -> None:
        x = {"z": [3, {"y": 1, "x": 0}], "a": None}
        y = {"a": None, "z": [3, {"x": 0, "y": 1}]}
        assert canonical_json(x) == canonical_json(y)


class TestDigest:
    def test_stable_format(self) -> None:
        d = digest_requirements(
            {
                "scheme": "exact",
                "chain": "base",
                "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
                "amount": "1000",
                "payTo": "0x0000000000000000000000000000000000000001",
                "nonce": "N",
                "validUntil": 1,
            },
        )
        assert d.startswith("sha256:") and len(d) == 71

    def test_stable_regardless_of_order(self) -> None:
        a = digest_requirements(
            {
                "scheme": "exact",
                "chain": "base",
                "asset": "X",
                "amount": "1",
                "payTo": "P",
                "nonce": "N",
                "validUntil": 1,
            },
        )
        b = digest_requirements(
            {
                "validUntil": 1,
                "nonce": "N",
                "payTo": "P",
                "amount": "1",
                "asset": "X",
                "chain": "base",
                "scheme": "exact",
            },
        )
        assert a == b


class TestConstantTime:
    def test_equal(self) -> None:
        assert constant_time_equal("abc", "abc")

    def test_differ(self) -> None:
        assert not constant_time_equal("abc", "abd")
        assert not constant_time_equal("abc", "ab")
