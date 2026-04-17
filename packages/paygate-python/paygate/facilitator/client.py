"""HTTP client for the Coinbase x402 facilitator.

Mirrors ``packages/paygate-node/src/facilitator/client.ts``.
"""

from __future__ import annotations

import json
from typing import Any

import httpx

from .._version import __version__
from ..constants import DEFAULT_FACILITATOR_URL
from ..errors import ErrorCode, PayGateError
from ..types import PaymentRequirements, VerifyFail, VerifyOk, VerifyResult


class FacilitatorClient:
    """Thin async client for the x402 facilitator endpoints."""

    def __init__(
        self,
        *,
        url: str | None = None,
        api_key: str | None = None,
        timeout_ms: int = 4_000,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        self._url = (url or DEFAULT_FACILITATOR_URL).rstrip("/")
        self._headers: dict[str, str] = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": f"paygate-python/{__version__}",
        }
        if api_key is not None:
            self._headers["Authorization"] = f"Bearer {api_key}"
        self._timeout = timeout_ms / 1000
        self._http_client = http_client
        self._owns_client = http_client is None

    async def aclose(self) -> None:
        if self._owns_client and self._http_client is not None:
            await self._http_client.aclose()
            self._http_client = None

    def _client(self) -> httpx.AsyncClient:
        if self._http_client is None:
            self._http_client = httpx.AsyncClient(timeout=self._timeout)
        return self._http_client

    async def verify(self, req: PaymentRequirements, x_payment: str) -> VerifyResult:
        return await self._post(
            "/verify",
            {
                "paymentRequirements": req.model_dump(by_alias=True, exclude_none=True),
                "xPayment": x_payment,
            },
        )

    async def settle(self, req: PaymentRequirements, x_payment: str) -> VerifyResult:
        return await self._post(
            "/settle",
            {
                "paymentRequirements": req.model_dump(by_alias=True, exclude_none=True),
                "xPayment": x_payment,
            },
        )

    async def health(self) -> bool:
        try:
            res = await self._client().get(
                f"{self._url}/health",
                headers=self._headers,
                timeout=self._timeout,
            )
        except httpx.HTTPError:
            return False
        return res.is_success

    async def _post(self, path: str, body: dict[str, Any]) -> VerifyResult:
        try:
            res = await self._client().post(
                f"{self._url}{path}",
                headers=self._headers,
                content=json.dumps(body).encode("utf-8"),
                timeout=self._timeout,
            )
        except httpx.HTTPError as err:
            raise PayGateError(
                code=ErrorCode.RPC_UNAVAILABLE,
                detail=f"facilitator {path} unreachable: {err}",
                cause=err,
            ) from err

        text = res.text or ""
        try:
            payload: Any = json.loads(text) if text else {}
        except json.JSONDecodeError as err:
            raise PayGateError(
                code=ErrorCode.RPC_UNAVAILABLE,
                detail=f"facilitator returned non-json at {path}: {text[:120]}",
                cause=err,
            ) from err

        if not isinstance(payload, dict):
            raise PayGateError(
                code=ErrorCode.RPC_UNAVAILABLE,
                detail=f"facilitator returned unexpected payload at {path}",
            )

        if not res.is_success:
            code = payload.get("error")
            detail = payload.get("detail") or f"facilitator {res.status_code}"
            retryable = res.status_code >= 500 or res.status_code in (408, 429)
            return VerifyFail(
                code=code if isinstance(code, str) else ErrorCode.RPC_UNAVAILABLE.value,
                detail=detail,
                retryable=retryable,
            )

        if payload.get("ok") is True:
            return VerifyOk.model_validate(payload)
        return VerifyFail.model_validate(payload)


__all__ = ["FacilitatorClient"]
