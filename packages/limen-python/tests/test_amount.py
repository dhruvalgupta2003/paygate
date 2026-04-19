"""Parity with the TypeScript amount utilities."""

from __future__ import annotations

import pytest

from limen.utils.amount import micros_to_usdc, usdc_to_micros


class TestUsdcToMicros:
    def test_whole_number(self) -> None:
        assert usdc_to_micros("1") == 1_000_000
        assert usdc_to_micros("1.000000") == 1_000_000

    def test_fractions(self) -> None:
        assert usdc_to_micros("0.001") == 1_000
        assert usdc_to_micros("0.000001") == 1
        assert usdc_to_micros("0") == 0

    @pytest.mark.parametrize("bad", ["-1", "1.0000001", "not a number", "1e10"])
    def test_invalid(self, bad: str) -> None:
        with pytest.raises(ValueError):
            usdc_to_micros(bad)


class TestMicrosToUsdc:
    def test_roundtrip(self) -> None:
        assert micros_to_usdc(0) == "0.000000"
        assert micros_to_usdc(1) == "0.000001"
        assert micros_to_usdc(1_000_000) == "1.000000"
        assert micros_to_usdc(1_234_560) == "1.234560"
