"""Typed DTOs that match the TypeScript ``types.ts`` shapes.

All models are frozen — treat them as value objects. Build new ones with
``model_copy(update={...})`` instead of mutating in place.
"""

from __future__ import annotations

from typing import Any, Literal, Protocol, Union, runtime_checkable

from pydantic import BaseModel, ConfigDict, Field

from .constants import ChainIdLiteral


class _FrozenModel(BaseModel):
    """Base class enforcing immutability + strict field validation."""

    model_config = ConfigDict(
        frozen=True,
        str_strip_whitespace=False,
        populate_by_name=True,
        extra="forbid",
    )


# ---------------------------------------------------------------------------
# Payment requirements — what the server advertises in a 402 response.
# ---------------------------------------------------------------------------
class OperatorInfo(_FrozenModel):
    name: str
    url: str | None = None


class PaymentRequirements(_FrozenModel):
    """The payment contract the server advertises in a 402 response."""

    scheme: Literal["exact"] = "exact"
    chain: ChainIdLiteral
    asset: str
    # Base-10 string in smallest units (e.g. USDC micros).
    amount: str
    payTo: str
    nonce: str
    digest: str
    validUntil: int
    facilitator: str | None = None
    description: str | None = None
    operator: OperatorInfo | None = None


# ---------------------------------------------------------------------------
# Payment auth — what the client sends in the X-PAYMENT header.
# ---------------------------------------------------------------------------
class EvmAuthorization(_FrozenModel):
    from_: str = Field(alias="from")
    to: str
    value: str
    validAfter: int
    validBefore: int
    nonce: str
    v: int
    r: str
    s: str


class EvmPaymentAuth(_FrozenModel):
    v: Literal["1"] = "1"
    chain: Literal["base", "base-sepolia"]
    scheme: Literal["exact"] = "exact"
    nonce: str
    validUntil: int
    payTo: str
    asset: str
    amount: str
    authorization: EvmAuthorization
    settlementTxHash: str | None = None


class SolanaPaymentAuth(_FrozenModel):
    v: Literal["1"] = "1"
    chain: Literal["solana", "solana-devnet"]
    scheme: Literal["exact"] = "exact"
    nonce: str
    validUntil: int
    payTo: str
    mint: str
    amount: str
    # base64 versioned transaction, signed by the payer.
    transaction: str
    settlementSignature: str | None = None


PaymentAuth = Union[EvmPaymentAuth, SolanaPaymentAuth]


# ---------------------------------------------------------------------------
# Verification + settlement result.
# ---------------------------------------------------------------------------
class VerifyOk(_FrozenModel):
    ok: Literal[True] = True
    settledAmount: str
    payer: str
    recipient: str
    chain: ChainIdLiteral
    asset: str
    observedAt: int


class VerifyFail(_FrozenModel):
    ok: Literal[False] = False
    code: str
    detail: str
    retryable: bool


VerifyResult = Union[VerifyOk, VerifyFail]


class SettlementProof(_FrozenModel):
    chain: ChainIdLiteral
    txHash: str
    block: int | None = None
    slot: int | None = None
    amount: str
    payer: str
    recipient: str
    observedAt: int


class PriceSpec(_FrozenModel):
    chain: ChainIdLiteral
    asset: str
    amount: str


class RequirementOpts(_FrozenModel):
    payTo: str
    validUntilSeconds: int | None = None
    description: str | None = None
    operator: OperatorInfo | None = None
    facilitator: str | None = None


# ---------------------------------------------------------------------------
# Framework-agnostic request/response shapes used by the core proxy.
# ---------------------------------------------------------------------------
class PayGateRequest(_FrozenModel):
    method: str
    url: str
    path: str
    query: dict[str, Any] = Field(default_factory=dict)
    headers: dict[str, Any] = Field(default_factory=dict)
    ip: str | None = None
    body: bytes | None = None

    model_config = ConfigDict(
        frozen=True,
        arbitrary_types_allowed=True,
        extra="forbid",
    )


class PayGateResponse(BaseModel):
    """Mutable so adapters can decorate responses before returning. Keep the
    mutation surface narrow — production code should construct a new instance
    rather than reassign fields."""

    status: int
    headers: dict[str, str] = Field(default_factory=dict)
    body: bytes | str | None = None

    model_config = ConfigDict(
        frozen=False,
        arbitrary_types_allowed=True,
        extra="forbid",
    )


class ForwardOptions(_FrozenModel):
    upstream: str
    timeoutMs: int | None = None


# ---------------------------------------------------------------------------
# ChainAdapter protocol — each chain plugs in via this shape.
# ---------------------------------------------------------------------------
@runtime_checkable
class ChainAdapter(Protocol):
    id: ChainIdLiteral

    def build_payment_requirements(
        self, spec: PriceSpec, opts: RequirementOpts
    ) -> PaymentRequirements: ...

    async def verify_payment(
        self, req: PaymentRequirements, x_payment: str
    ) -> VerifyResult: ...

    async def confirm_payment(self, proof: SettlementProof) -> VerifyResult: ...


# ---------------------------------------------------------------------------
# Compliance surface.
# ---------------------------------------------------------------------------
class ComplianceDecision(_FrozenModel):
    allowed: bool
    reason: str | None = None
    list: str | None = None


@runtime_checkable
class ComplianceScreen(Protocol):
    async def screen_wallet(
        self, wallet: str, chain: ChainIdLiteral
    ) -> ComplianceDecision: ...

    async def screen_geo(self, ip_or_country: str) -> ComplianceDecision: ...


# ---------------------------------------------------------------------------
# Replay / nonce guard interface.
# ---------------------------------------------------------------------------
@runtime_checkable
class NonceStore(Protocol):
    async def claim(self, nonce: str, ttl_seconds: int) -> bool:
        """Set if absent; return True on successful first claim."""

    async def put_requirement(
        self, nonce: str, digest: str, ttl_seconds: int
    ) -> None:
        """Store the digest tied to a nonce for later verification."""

    async def get_requirement(self, nonce: str) -> str | None: ...


__all__ = [
    "ChainAdapter",
    "ComplianceDecision",
    "ComplianceScreen",
    "EvmAuthorization",
    "EvmPaymentAuth",
    "ForwardOptions",
    "NonceStore",
    "OperatorInfo",
    "PayGateRequest",
    "PayGateResponse",
    "PaymentAuth",
    "PaymentRequirements",
    "PriceSpec",
    "RequirementOpts",
    "SettlementProof",
    "SolanaPaymentAuth",
    "VerifyFail",
    "VerifyOk",
    "VerifyResult",
]
