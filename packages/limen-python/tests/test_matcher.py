from __future__ import annotations

import pytest

from limen.config import EndpointConfig
from limen.proxy.matcher import compile_matcher


@pytest.fixture
def matcher() -> object:
    eps = [
        EndpointConfig(path="/api/v1/weather/*", price_usdc="0.001"),
        EndpointConfig(path="/api/v1/premium/**", price_usdc="0.05"),
        EndpointConfig(path="/api/v1/bulk", method=["POST"], price_usdc="1"),
    ]
    return compile_matcher(eps, lambda s: int(float(s) * 1_000_000))


def test_single_segment_glob(matcher: object) -> None:
    m = matcher.find_match("/api/v1/weather/sf", "GET")  # type: ignore[attr-defined]
    assert m is not None and m.endpoint.path == "/api/v1/weather/*"


def test_multi_segment_glob(matcher: object) -> None:
    m = matcher.find_match("/api/v1/premium/a/b/c", "GET")  # type: ignore[attr-defined]
    assert m is not None and m.endpoint.path == "/api/v1/premium/**"


def test_method_filter(matcher: object) -> None:
    assert matcher.find_match("/api/v1/bulk", "GET") is None  # type: ignore[attr-defined]
    m = matcher.find_match("/api/v1/bulk", "POST")  # type: ignore[attr-defined]
    assert m is not None and m.endpoint.path == "/api/v1/bulk"


def test_no_match(matcher: object) -> None:
    assert matcher.find_match("/unpaywalled", "GET") is None  # type: ignore[attr-defined]
