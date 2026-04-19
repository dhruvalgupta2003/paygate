"""CoreProxy — the framework-agnostic request pipeline.

Framework adapters (FastAPI, Flask, Django, Starlette) translate their
request/response primitives into :class:`LimenRequest` /
:class:`LimenResponse` and hand the work to :class:`CoreProxy`.

This mirrors ``packages/limen-node/src/proxy/core.ts`` step-for-step so
the two SDKs stay in parity.
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass
from typing import Any, Callable, Mapping

import httpx

from ..analytics.metrics import metrics
from ..config import LimenConfig
from ..errors import ErrorCode, LimenError
from ..facilitator.client import FacilitatorClient
from ..types import (
    ChainAdapter,
    ComplianceScreen,
    NonceStore,
    OperatorInfo,
    LimenRequest,
    LimenResponse,
    PaymentAuth,
    PaymentRequirements,
    PriceSpec,
    RequirementOpts,
    VerifyFail,
    VerifyResult,
)
from ..utils.amount import usdc_to_micros
from ..utils.logger import get_logger, nonce_mask, wallet_mask
from ..utils.nonce import epoch_seconds, short_token
from ..utils.rate_limiter import (
    InMemoryRateLimiter,
    RateLimitDecision,
    RateLimitSpec,
    RedisRateLimiter,
)
from .handshake import decode_payment_header, encode_requirements
from .matcher import CompiledMatcher, compile_matcher


RateLimiter = RedisRateLimiter | InMemoryRateLimiter


@dataclass
class CoreProxyDeps:
    config: LimenConfig
    adapters: Mapping[str, ChainAdapter]
    nonce_store: NonceStore
    rate_limiter: RateLimiter
    compliance: ComplianceScreen
    upstream: str
    logger: Any | None = None
    facilitator: FacilitatorClient | None = None
    now: Callable[[], int] | None = None


@dataclass
class CoreProxyResult:
    response: LimenResponse
    auth: PaymentAuth | None = None
    requirements: PaymentRequirements | None = None
    verify_result: VerifyResult | None = None


class CoreProxy:
    """Paywall pipeline — validate, verify, settle, forward."""

    def __init__(self, deps: CoreProxyDeps) -> None:
        self._cfg = deps.config
        self._adapters = dict(deps.adapters)
        self._nonce_store = deps.nonce_store
        self._rate_limiter = deps.rate_limiter
        self._compliance = deps.compliance
        self._upstream = deps.upstream
        self._facilitator = deps.facilitator
        self._now = deps.now or epoch_seconds
        self._logger = deps.logger or get_logger("limen.proxy")
        self._matcher: CompiledMatcher = compile_matcher(
            self._cfg.endpoints, usdc_to_micros
        )
        self._http_client = httpx.AsyncClient(
            timeout=httpx.Timeout(self._cfg.advanced.upstream_timeout_ms / 1000),
            follow_redirects=False,
        )

    async def aclose(self) -> None:
        """Release the upstream HTTP client."""
        await self._http_client.aclose()

    async def handle(self, request: LimenRequest) -> CoreProxyResult:
        """Process a single request through the paywall pipeline."""
        req_id = short_token()
        log = self._logger.bind(reqId=req_id, path=request.path, method=request.method)

        try:
            metrics.requests_total.labels(endpoint="matched", outcome="received").inc()
            matched = self._matcher.find_match(request.path, request.method)
            if matched is None:
                # Unpaywalled path — pass straight through.
                return CoreProxyResult(response=await self._forward(request))

            chain = matched.endpoint.chain or self._cfg.defaults.chain
            adapter = self._adapters.get(chain)
            if adapter is None:
                raise LimenError(
                    code=ErrorCode.BAD_CONFIG,
                    detail=f"no chain adapter configured for {chain}",
                )

            if matched.price_micros == 0:
                metrics.requests_total.labels(
                    endpoint=matched.endpoint.path, outcome="free"
                ).inc()
                return CoreProxyResult(response=await self._forward(request))

            x_payment = _get_single_header(request.headers, "x-payment")
            if x_payment is None:
                req = self._build_requirements(adapter, chain, matched.price_micros)
                await self._nonce_store.put_requirement(
                    req.nonce,
                    req.digest,
                    self._cfg.defaults.payment_ttl_seconds + 60,
                )
                encoded = encode_requirements(req)
                log.info(
                    "issued 402",
                    outcome="payment_required",
                    nonce=nonce_mask(req.nonce),
                    amount=str(matched.price_micros),
                )
                metrics.requests_total.labels(
                    endpoint=matched.endpoint.path, outcome="payment_required"
                ).inc()
                response = LimenResponse(
                    status=encoded["status"],
                    headers=dict(encoded["headers"]),
                    body=json.dumps(encoded["body"]).encode("utf-8"),
                )
                return CoreProxyResult(response=response, requirements=req)

            # Decode + re-bind to stored requirements.
            try:
                auth = decode_payment_header(x_payment)
            except LimenError as err:
                return CoreProxyResult(response=self._error_response(err))

            stored_digest = await self._nonce_store.get_requirement(auth.nonce)
            if stored_digest is None:
                return CoreProxyResult(
                    response=self._error_response(
                        LimenError(
                            code=ErrorCode.NONCE_UNKNOWN,
                            detail=(
                                "requirements have expired or were never issued "
                                "here; request a fresh 402"
                            ),
                        )
                    )
                )

            payer = _extract_payer(auth)
            if payer:
                log = log.bind(wallet=wallet_mask(payer))

            # Rate limit (wallet + ip + endpoint).
            for rl in self._cfg.rate_limits:
                key = _rate_limit_key(rl.scope, payer, request.ip, matched.endpoint.path)
                decision: RateLimitDecision = await self._rate_limiter.check_and_consume(
                    key,
                    RateLimitSpec(
                        scope=rl.scope,
                        limit=rl.limit,
                        window_seconds=rl.window_seconds,
                    ),
                )
                if not decision.allowed:
                    metrics.rate_limit_drops_total.labels(scope=rl.scope).inc()
                    return CoreProxyResult(
                        response=self._error_response(
                            LimenError(
                                code=ErrorCode.RATE_LIMITED,
                                detail=(
                                    f"scope={rl.scope} exhausted; "
                                    f"retry in {decision.reset_in_seconds}s"
                                ),
                                retry_after_ms=decision.reset_in_seconds * 1000,
                            )
                        ),
                        auth=auth,
                    )

            # Compliance (sanctions screening).
            if self._cfg.compliance.sanctions_screening and payer:
                result = await self._compliance.screen_wallet(payer, chain)
                if not result.allowed:
                    return CoreProxyResult(
                        response=self._error_response(
                            LimenError(
                                code=ErrorCode.COMPLIANCE_BLOCKED,
                                detail=result.reason or "sanctions match",
                                extra=(
                                    {"list": result.list}
                                    if result.list is not None
                                    else {}
                                ),
                            )
                        ),
                        auth=auth,
                    )

            # Replay guard — consume nonce exactly once.
            claimed = await self._nonce_store.claim(
                auth.nonce, self._cfg.defaults.payment_ttl_seconds + 60
            )
            if not claimed:
                metrics.replay_rejects_total.inc()
                return CoreProxyResult(
                    response=self._error_response(
                        LimenError(
                            code=ErrorCode.NONCE_REUSED,
                            detail="this payment authorisation has already been redeemed",
                        )
                    ),
                    auth=auth,
                )

            # Chain verify — facilitator preferred when configured.
            verify_start = time.perf_counter()
            verify = await self._verify(adapter, matched.price_micros, auth, chain, x_payment)
            metrics.verify_duration_seconds.labels(
                chain=chain, mode=self._cfg.defaults.facilitator
            ).observe(time.perf_counter() - verify_start)

            if not verify.ok:
                fail = verify  # type: ignore[assignment]
                assert isinstance(fail, VerifyFail)
                metrics.verify_failures_total.labels(chain=chain, reason=fail.code).inc()
                return CoreProxyResult(
                    response=self._error_response(
                        LimenError(code=fail.code, detail=fail.detail)
                    ),
                    auth=auth,
                )

            # Forward upstream.
            upstream_resp = await self._forward(request)
            receipt = _build_receipt(
                chain=chain, tx_hash="", settled=getattr(verify, "settledAmount", "0")
            )
            new_headers = dict(upstream_resp.headers)
            new_headers["X-PAYMENT-RESPONSE"] = receipt
            new_headers["X-Request-Id"] = req_id
            return CoreProxyResult(
                response=LimenResponse(
                    status=upstream_resp.status,
                    headers=new_headers,
                    body=upstream_resp.body,
                ),
                auth=auth,
                verify_result=verify,
            )
        except LimenError as err:
            return CoreProxyResult(response=self._error_response(err))
        except Exception as err:  # noqa: BLE001 — translate into structured error.
            log.error("unhandled error", err=str(err))
            wrapped = LimenError(
                code=ErrorCode.INTERNAL, detail="unexpected error", cause=err
            )
            return CoreProxyResult(response=self._error_response(wrapped))

    # ------------------------------------------------------------------ helpers

    def _build_requirements(
        self, adapter: ChainAdapter, chain: str, price_micros: int
    ) -> PaymentRequirements:
        pay_to = self._cfg.wallets.get(chain) or ""  # type: ignore[arg-type]
        operator: OperatorInfo | None = None
        if self._cfg.project is not None:
            homepage = str(self._cfg.project.homepage) if self._cfg.project.homepage else None
            operator = OperatorInfo(name=self._cfg.project.name, url=homepage)
        opts = RequirementOpts(
            payTo=pay_to,
            validUntilSeconds=self._cfg.defaults.payment_ttl_seconds,
            description=None,
            operator=operator,
            facilitator=self._cfg.advanced.facilitator_url,
        )
        spec = PriceSpec(chain=chain, asset="", amount=str(price_micros))  # type: ignore[arg-type]
        return adapter.build_payment_requirements(spec, opts)

    async def _verify(
        self,
        adapter: ChainAdapter,
        price_micros: int,
        auth: PaymentAuth,
        chain: str,
        x_payment: str,
    ) -> VerifyResult:
        requirements = self._rebuild_requirements(adapter, chain, price_micros, auth)
        if self._facilitator is not None and self._cfg.defaults.facilitator == "coinbase":
            verify = await self._facilitator.verify(requirements, x_payment)
            if verify.ok:
                return await self._facilitator.settle(requirements, x_payment)
            return verify
        return await adapter.verify_payment(requirements, x_payment)

    def _rebuild_requirements(
        self,
        adapter: ChainAdapter,
        chain: str,
        price_micros: int,
        auth: PaymentAuth,  # noqa: ARG002 — retained for parity with TS
    ) -> PaymentRequirements:
        pay_to = self._cfg.wallets.get(chain) or ""  # type: ignore[arg-type]
        opts = RequirementOpts(
            payTo=pay_to, validUntilSeconds=self._cfg.defaults.payment_ttl_seconds
        )
        spec = PriceSpec(chain=chain, asset="", amount=str(price_micros))  # type: ignore[arg-type]
        return adapter.build_payment_requirements(spec, opts)

    def _error_response(self, err: LimenError) -> LimenResponse:
        body = err.to_json()
        headers: dict[str, str] = {"Content-Type": "application/json"}
        if err.retry_after_ms is not None:
            headers["Retry-After"] = str(max(1, err.retry_after_ms // 1000 or 1))
        return LimenResponse(
            status=err.http,
            headers=headers,
            body=json.dumps(body).encode("utf-8"),
        )

    async def _forward(self, request: LimenRequest) -> LimenResponse:
        target = _build_target_url(self._upstream, request.url)
        headers = _headers_for_upstream(request.headers)
        body = (
            None
            if request.body is None or request.method in ("GET", "HEAD")
            else bytes(request.body)
        )
        try:
            upstream_resp = await self._http_client.request(
                request.method,
                target,
                headers=headers,
                content=body,
            )
        except httpx.TimeoutException as err:
            raise LimenError(
                code=ErrorCode.UPSTREAM_TIMEOUT,
                detail=f"upstream exceeded {self._cfg.advanced.upstream_timeout_ms}ms",
                cause=err,
            ) from err
        except httpx.HTTPError as err:
            raise LimenError(
                code=ErrorCode.UPSTREAM_FAILED, detail=str(err), cause=err
            ) from err
        out_headers = {k: v for k, v in upstream_resp.headers.items()}
        return LimenResponse(
            status=upstream_resp.status_code,
            headers=out_headers,
            body=upstream_resp.content,
        )


def _build_target_url(base: str, request_url: str) -> str:
    if request_url.startswith(("http://", "https://")):
        return request_url
    base_stripped = base.rstrip("/")
    if not request_url.startswith("/"):
        return f"{base_stripped}/{request_url}"
    return f"{base_stripped}{request_url}"


def _headers_for_upstream(headers: Mapping[str, Any]) -> dict[str, str]:
    out: dict[str, str] = {}
    for key, value in headers.items():
        lower = key.lower()
        if lower in ("host", "content-length"):
            continue
        if value is None:
            continue
        if isinstance(value, (list, tuple)):
            out[lower] = ", ".join(str(v) for v in value)
        else:
            out[lower] = str(value)
    return out


def _get_single_header(headers: Mapping[str, Any], name: str) -> str | None:
    for variant in (name, name.lower(), name.title()):
        value = headers.get(variant)
        if value is None:
            continue
        if isinstance(value, (list, tuple)):
            return str(value[0]) if value else None
        return str(value)
    return None


def _extract_payer(auth: PaymentAuth) -> str:
    # EVM auth binds payer to authorization.from; Solana uses payTo.
    from_field = getattr(getattr(auth, "authorization", None), "from_", None)
    if from_field:
        return str(from_field)
    return str(getattr(auth, "payTo", ""))


def _rate_limit_key(scope: str, payer: str, ip: str | None, endpoint_path: str) -> str:
    if scope == "wallet":
        return payer or "unknown"
    if scope == "ip":
        return ip or "unknown"
    if scope == "endpoint":
        return endpoint_path
    return "global"


def _build_receipt(*, chain: str, tx_hash: str, settled: str) -> str:
    return f"t={int(time.time())},chain={chain},tx={tx_hash},settled={settled}"


__all__ = ["CoreProxy", "CoreProxyDeps", "CoreProxyResult"]
