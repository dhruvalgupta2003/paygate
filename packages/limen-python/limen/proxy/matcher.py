"""Compile path-matching rules for the configured endpoints.

First match wins. Globs support ``**`` (any path including slashes),
``*`` (any single segment), and ``:param`` placeholders.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Callable, Iterable

from ..config import EndpointConfig

# Special regex metacharacters we must escape literally (excluding the ones
# we handle specially: ``*`` and ``:``).
_METACHARS = r".+?^${}()|[]\\"
_PARAM_RE = re.compile(r"[A-Za-z0-9_]")


def _glob_to_regex(glob: str) -> re.Pattern[str]:
    buf: list[str] = []
    i = 0
    while i < len(glob):
        ch = glob[i]
        if ch == "*" and i + 1 < len(glob) and glob[i + 1] == "*":
            buf.append(".*")
            i += 2
            continue
        if ch == "*":
            buf.append("[^/]*")
            i += 1
            continue
        if ch == ":":
            j = i + 1
            while j < len(glob) and _PARAM_RE.match(glob[j]):
                j += 1
            buf.append("[^/]+")
            i = j
            continue
        if ch in _METACHARS:
            buf.append("\\" + ch)
        else:
            buf.append(ch)
        i += 1
    return re.compile("^" + "".join(buf) + "$")


@dataclass(frozen=True)
class MatchedEndpoint:
    endpoint: EndpointConfig
    price_micros: int


@dataclass(frozen=True)
class _CompiledEntry:
    endpoint: EndpointConfig
    regex: re.Pattern[str]
    methods: frozenset[str]
    price_micros: int


@dataclass(frozen=True)
class CompiledMatcher:
    """First-match-wins endpoint matcher."""

    _entries: tuple[_CompiledEntry, ...]

    def find_match(self, path: str, method: str) -> MatchedEndpoint | None:
        method_upper = method.upper()
        for entry in self._entries:
            if entry.methods and method_upper not in entry.methods:
                continue
            if entry.regex.match(path):
                return MatchedEndpoint(
                    endpoint=entry.endpoint, price_micros=entry.price_micros
                )
        return None


def compile_matcher(
    endpoints: Iterable[EndpointConfig],
    price_to_micros: Callable[[str], int],
) -> CompiledMatcher:
    """Compile endpoints into a matcher. ``price_to_micros`` converts a
    USDC decimal string to integer micros (normally ``usdc_to_micros``)."""
    compiled = []
    for endpoint in endpoints:
        raw_price = (
            endpoint.price_usdc
            if endpoint.price_usdc is not None
            else (endpoint.price.base_usdc if endpoint.price is not None else "0")
        )
        methods = (
            frozenset(m.upper() for m in endpoint.method) if endpoint.method else frozenset()
        )
        compiled.append(
            _CompiledEntry(
                endpoint=endpoint,
                regex=_glob_to_regex(endpoint.path),
                methods=methods,
                price_micros=price_to_micros(raw_price),
            )
        )
    return CompiledMatcher(_entries=tuple(compiled))


__all__ = ["CompiledMatcher", "MatchedEndpoint", "compile_matcher"]
