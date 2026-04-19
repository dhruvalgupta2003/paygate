"""Compliance screens — local blocklist + optional Circle API.

Mirrors ``packages/limen-node/src/verification/compliance.ts``.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import httpx

from ..constants import ChainIdLiteral
from ..types import ComplianceDecision


@dataclass(frozen=True)
class FileBlocklist:
    addresses: frozenset[str]
    source: str


def load_blocklist(path: str | Path) -> FileBlocklist:
    """Read a JSON blocklist with shape ``{"addresses": [...], "source": str}``.

    EVM addresses (``0x`` prefix) are lowercased; Solana addresses are kept
    verbatim (they are case-sensitive base58).
    """
    p = Path(path)
    raw = p.read_text(encoding="utf-8")
    parsed = json.loads(raw)
    if not isinstance(parsed, dict) or not isinstance(parsed.get("addresses"), list):
        raise ValueError("blocklist must have {'addresses': [...]}")
    normalised = (
        addr.lower() if isinstance(addr, str) and addr.startswith("0x") else str(addr).strip()
        for addr in parsed["addresses"]
    )
    return FileBlocklist(
        addresses=frozenset(normalised),
        source=parsed.get("source") or str(p),
    )


class DefaultComplianceScreen:
    """Screen wallets against a local blocklist with optional Circle API
    augmentation for EVM chains."""

    def __init__(
        self,
        *,
        blocklist: FileBlocklist | None = None,
        allowlist: Iterable[str] | None = None,
        geo_blocklist: Iterable[str] | None = None,
        circle_api_key: str | None = None,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        self._blocklist = blocklist
        self._allowlist: frozenset[str] = frozenset(allowlist or ())
        self._geo: frozenset[str] = frozenset(
            code.upper() for code in (geo_blocklist or ())
        )
        self._circle_api_key = circle_api_key
        self._http_client = http_client
        self._owns_client = http_client is None

    async def aclose(self) -> None:
        if self._owns_client and self._http_client is not None:
            await self._http_client.aclose()
            self._http_client = None

    async def screen_wallet(
        self, wallet: str, chain: ChainIdLiteral
    ) -> ComplianceDecision:
        key = wallet.lower() if chain.startswith("base") else wallet
        if key in self._allowlist:
            return ComplianceDecision(allowed=True)
        if self._blocklist is not None and key in self._blocklist.addresses:
            return ComplianceDecision(
                allowed=False,
                reason="sanctions_list_match",
                list=self._blocklist.source,
            )
        if self._circle_api_key and chain.startswith("base"):
            decision = await self._circle_lookup(key)
            if not decision.allowed:
                return decision
        return ComplianceDecision(allowed=True)

    async def screen_geo(self, ip_or_country: str) -> ComplianceDecision:
        code = ip_or_country.upper()
        if len(code) == 2 and code in self._geo:
            return ComplianceDecision(
                allowed=False, reason="geo_blocklist", list="geo"
            )
        return ComplianceDecision(allowed=True)

    async def _circle_lookup(self, address: str) -> ComplianceDecision:
        try:
            client = self._http_client or httpx.AsyncClient(timeout=2.5)
            try:
                res = await client.post(
                    "https://api.circle.com/v1/w3s/compliance/screen",
                    headers={
                        "Content-Type": "application/json",
                        "Authorization": f"Bearer {self._circle_api_key}",
                    },
                    json={"address": address, "blockchain": "BASE"},
                )
            finally:
                if self._http_client is None:
                    await client.aclose()
        except httpx.HTTPError:
            return ComplianceDecision(allowed=True)
        if not res.is_success:
            return ComplianceDecision(allowed=True)
        try:
            body = res.json()
        except ValueError:
            return ComplianceDecision(allowed=True)
        result = body.get("data", {}).get("result") if isinstance(body, dict) else None
        if result == "APPROVED":
            return ComplianceDecision(allowed=True)
        return ComplianceDecision(
            allowed=False,
            reason=f"circle_{result or 'denied'}",
            list="circle",
        )


class NullComplianceScreen:
    """A screen that allows everything. Use in development or when
    ``compliance.sanctions_screening`` is disabled."""

    async def screen_wallet(
        self, wallet: str, chain: ChainIdLiteral  # noqa: ARG002
    ) -> ComplianceDecision:
        return ComplianceDecision(allowed=True)

    async def screen_geo(self, ip_or_country: str) -> ComplianceDecision:  # noqa: ARG002
        return ComplianceDecision(allowed=True)


__all__ = [
    "DefaultComplianceScreen",
    "FileBlocklist",
    "NullComplianceScreen",
    "load_blocklist",
]
