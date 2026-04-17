from __future__ import annotations

import pytest

from paygate.config import load_config_from_string


def test_minimum_viable_config() -> None:
    cfg = load_config_from_string(
        """
version: 1
wallets:
  base: "0x0000000000000000000000000000000000000001"
endpoints:
  - path: /api/v1/*
    price_usdc: 0.001
"""
    )
    assert cfg.endpoints[0].price_usdc == "0.001"
    assert cfg.defaults.chain == "base"


def test_rejects_endpoint_without_price() -> None:
    with pytest.raises(Exception, match=r"price"):
        load_config_from_string(
            """
version: 1
wallets:
  base: "0x0000000000000000000000000000000000000001"
endpoints:
  - path: /foo
"""
        )


def test_rejects_malformed_address() -> None:
    with pytest.raises(Exception):
        load_config_from_string(
            """
version: 1
wallets:
  base: "not-an-address"
endpoints:
  - path: /foo
    price_usdc: 0.001
"""
        )


def test_rejects_no_wallets() -> None:
    with pytest.raises(Exception, match=r"wallet"):
        load_config_from_string(
            """
version: 1
wallets: {}
endpoints:
  - path: /foo
    price_usdc: 0.001
"""
        )
