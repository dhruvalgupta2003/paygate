"""Config schema + loader. Mirrors ``packages/paygate-node/src/config.ts``.

The config file is YAML or JSON. Load via :func:`load_config_from_file` or
:func:`load_config_from_string`. Unknown keys are rejected.
"""

from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Literal, Union

import yaml
from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    HttpUrl,
    ValidationError,
    field_validator,
    model_validator,
)

from .constants import (
    DEFAULT_FACILITATOR_URL,
    DEFAULT_PAYMENT_TTL_SECONDS,
    ChainIdLiteral,
)
from .errors import ErrorCode, PayGateError

# ---------------------------------------------------------------------------
# Shared validators / regexes
# ---------------------------------------------------------------------------

_HEX40_RE = re.compile(r"^0x[0-9a-fA-F]{40}$")
_SOLANA_ADDR_RE = re.compile(r"^[1-9A-HJ-NP-Za-km-z]{32,44}$")
_PROJECT_SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{2,62}[a-z0-9]$")
_USDC_DECIMAL_RE = re.compile(r"^\d+(\.\d{1,6})?$")


def _normalise_price(value: str | int | float | Decimal) -> str:
    """Coerce a price value to a canonical 6-dp USDC decimal string."""
    if isinstance(value, bool):  # bool is an int subclass; reject.
        raise ValueError(f"price must be a decimal, got bool {value!r}")
    if isinstance(value, (int, float)):
        candidate = f"{Decimal(str(value)):.6f}"
    elif isinstance(value, Decimal):
        try:
            candidate = f"{value:.6f}"
        except InvalidOperation as err:
            raise ValueError(f"price {value!r} is not a finite decimal") from err
    else:
        candidate = str(value).strip()
    if not _USDC_DECIMAL_RE.match(candidate):
        raise ValueError(
            f"price must be a non-negative decimal with <=6 places, got {value!r}"
        )
    return candidate


class _SchemaModel(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
        str_strip_whitespace=False,
    )


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------


class EndpointSurge(_SchemaModel):
    header: str | None = None
    query: str | None = None
    values: dict[str, float]

    @field_validator("values")
    @classmethod
    def _values_positive(cls, v: dict[str, float]) -> dict[str, float]:
        for key, val in v.items():
            if val <= 0:
                raise ValueError(f"surge multiplier for {key!r} must be positive")
        return v


class EndpointPrice(_SchemaModel):
    base_usdc: str
    surge: EndpointSurge | None = None

    @field_validator("base_usdc", mode="before")
    @classmethod
    def _coerce_base_usdc(cls, v: object) -> str:
        return _normalise_price(v)  # type: ignore[arg-type]


class EndpointConfig(_SchemaModel):
    path: str = Field(min_length=1)
    method: list[str] | None = None
    price_usdc: str | None = None
    price: EndpointPrice | None = None
    chain: ChainIdLiteral | None = None
    description: str | None = None
    tags: list[str] | None = None

    @field_validator("price_usdc", mode="before")
    @classmethod
    def _coerce_price_usdc(cls, v: object) -> str | None:
        if v is None:
            return None
        return _normalise_price(v)  # type: ignore[arg-type]

    @model_validator(mode="after")
    def _require_price(self) -> EndpointConfig:
        if self.price_usdc is None and self.price is None:
            raise ValueError("endpoint must specify price_usdc or price")
        return self


# ---------------------------------------------------------------------------
# Top-level sections
# ---------------------------------------------------------------------------


class Project(_SchemaModel):
    name: str = Field(min_length=1)
    slug: str
    description: str | None = None
    contact: EmailStr | None = None
    homepage: HttpUrl | None = None

    @field_validator("slug")
    @classmethod
    def _slug_shape(cls, v: str) -> str:
        if not _PROJECT_SLUG_RE.match(v):
            raise ValueError("slug must be lowercase kebab-case 4-64 chars")
        return v


class Wallets(_SchemaModel):
    base: str | None = None
    base_sepolia: str | None = Field(default=None, alias="base-sepolia")
    solana: str | None = None
    solana_devnet: str | None = Field(default=None, alias="solana-devnet")

    @field_validator("base", "base_sepolia")
    @classmethod
    def _evm_shape(cls, v: str | None) -> str | None:
        if v is not None and not _HEX40_RE.match(v):
            raise ValueError("expected an EVM address (0x + 40 hex chars)")
        return v

    @field_validator("solana", "solana_devnet")
    @classmethod
    def _sol_shape(cls, v: str | None) -> str | None:
        if v is not None and not _SOLANA_ADDR_RE.match(v):
            raise ValueError("expected a Solana base58 address")
        return v

    @model_validator(mode="after")
    def _at_least_one(self) -> Wallets:
        if not any([self.base, self.base_sepolia, self.solana, self.solana_devnet]):
            raise ValueError("at least one receiving wallet must be configured")
        return self

    def get(self, chain: ChainIdLiteral) -> str | None:
        if chain == "base":
            return self.base
        if chain == "base-sepolia":
            return self.base_sepolia
        if chain == "solana":
            return self.solana
        if chain == "solana-devnet":
            return self.solana_devnet
        return None


ConfirmationSetting = Union[int, Literal["confirmed", "finalized"]]


class Defaults(_SchemaModel):
    chain: ChainIdLiteral = "base"
    currency: Literal["USDC"] = "USDC"
    confirmations: ConfirmationSetting = 2
    payment_ttl_seconds: int = DEFAULT_PAYMENT_TTL_SECONDS
    facilitator: Literal["coinbase", "self"] = "coinbase"

    @field_validator("payment_ttl_seconds")
    @classmethod
    def _ttl_bounds(cls, v: int) -> int:
        if not (30 <= v <= 3600):
            raise ValueError("payment_ttl_seconds must be between 30 and 3600")
        return v

    @field_validator("confirmations")
    @classmethod
    def _confirmations_bounds(cls, v: ConfirmationSetting) -> ConfirmationSetting:
        if isinstance(v, int) and v < 0:
            raise ValueError("confirmations must be >= 0")
        return v


class CacheRule(_SchemaModel):
    path: str
    ttl_seconds: int = Field(ge=0)


class Cache(_SchemaModel):
    enabled: bool = True
    driver: Literal["redis", "memory"] = "redis"
    default_ttl_seconds: int = Field(default=60, ge=0)
    rules: list[CacheRule] = Field(default_factory=list)


class RateLimit(_SchemaModel):
    scope: Literal["wallet", "ip", "endpoint", "global"]
    limit: int = Field(gt=0)
    window_seconds: int = Field(gt=0)


class Compliance(_SchemaModel):
    sanctions_screening: bool = True
    geo_blocklist: list[str] = Field(default_factory=list)
    travel_rule_threshold_usd: float = Field(default=3000.0, ge=0)
    travel_rule_webhook: HttpUrl | None = None
    blocklist_path: str | None = None

    @field_validator("geo_blocklist")
    @classmethod
    def _countries(cls, v: list[str]) -> list[str]:
        for code in v:
            if len(code) != 2:
                raise ValueError("geo_blocklist must contain ISO-2 country codes")
        return v


class Webhook(_SchemaModel):
    url: HttpUrl
    secret_env: str | None = None
    secret: str | None = None
    events: list[str] = Field(min_length=1)


class Discovery(_SchemaModel):
    listed: bool = False
    categories: list[str] = Field(default_factory=list)
    openapi_url: str | None = None
    example_agent_prompt: str | None = None


class AllowFreeTier(_SchemaModel):
    requests_per_day: int = Field(default=0, gt=0)


class AdvancedSolana(_SchemaModel):
    priority_fee_percentile: int = Field(default=75, ge=1, le=99)
    use_lookup_table: bool = False
    commitment_finalized_threshold_usd: float = Field(default=100.0, ge=0)


class AdvancedBase(_SchemaModel):
    gas_multiplier: float = Field(default=1.25, gt=0)
    high_value_threshold_usd: float = Field(default=1000.0, ge=0)


class Advanced(_SchemaModel):
    upstream_timeout_ms: int = Field(default=15_000, gt=0)
    verifier_timeout_ms: int = Field(default=4_000, gt=0)
    max_request_body_mb: float = Field(default=5.0, gt=0)
    trust_proxy: bool = True
    proxy_protocol: bool = False
    allow_free_tier: AllowFreeTier | None = None
    log_bodies: bool = False
    facilitator_url: str = DEFAULT_FACILITATOR_URL
    facilitator_failover_seconds: int = Field(default=300, ge=0)
    solana: AdvancedSolana = Field(default_factory=AdvancedSolana)
    base: AdvancedBase = Field(default_factory=AdvancedBase)


class PayGateConfig(_SchemaModel):
    """Top-level PayGate configuration. Load via :func:`parse_config`."""

    version: Literal[1]
    project: Project | None = None
    wallets: Wallets
    defaults: Defaults = Field(default_factory=Defaults)
    endpoints: list[EndpointConfig] = Field(default_factory=list)
    cache: Cache = Field(default_factory=Cache)
    rate_limits: list[RateLimit] = Field(default_factory=list)
    compliance: Compliance = Field(default_factory=Compliance)
    webhooks: list[Webhook] = Field(default_factory=list)
    discovery: Discovery = Field(default_factory=Discovery)
    advanced: Advanced = Field(default_factory=Advanced)


# ---------------------------------------------------------------------------
# Loaders
# ---------------------------------------------------------------------------


def parse_config(data: Any) -> PayGateConfig:
    """Validate a raw mapping against the PayGate schema.

    Raises :class:`PayGateError` (BAD_CONFIG) on validation errors so the
    caller sees the stable error surface.
    """
    try:
        return PayGateConfig.model_validate(data)
    except ValidationError as err:
        issues = "; ".join(
            f"{'.'.join(str(p) for p in issue['loc'])}: {issue['msg']}"
            for issue in err.errors()
        )
        raise PayGateError(
            code=ErrorCode.BAD_CONFIG,
            detail=f"config validation failed: {issues}",
            cause=err,
        ) from err


def load_config_from_string(raw: str) -> PayGateConfig:
    stripped = raw.lstrip()
    if stripped.startswith("{"):
        import json

        parsed: Any = json.loads(raw)
    else:
        parsed = yaml.safe_load(raw)
    if parsed is None:
        raise PayGateError(
            code=ErrorCode.BAD_CONFIG, detail="config is empty"
        )
    return parse_config(parsed)


def load_config_from_file(path: str | Path) -> PayGateConfig:
    p = Path(path)
    try:
        raw = p.read_text(encoding="utf-8")
    except FileNotFoundError as err:
        raise PayGateError(
            code=ErrorCode.BAD_CONFIG,
            detail=f"config file not found: {p}",
            cause=err,
        ) from err
    return load_config_from_string(raw)


def load_config(path: str | Path) -> PayGateConfig:
    """Friendlier public alias for :func:`load_config_from_file`."""
    return load_config_from_file(path)


__all__ = [
    "Advanced",
    "AdvancedBase",
    "AdvancedSolana",
    "AllowFreeTier",
    "Cache",
    "CacheRule",
    "Compliance",
    "Defaults",
    "Discovery",
    "EndpointConfig",
    "EndpointPrice",
    "EndpointSurge",
    "PayGateConfig",
    "Project",
    "RateLimit",
    "Wallets",
    "Webhook",
    "load_config_from_file",
    "load_config_from_string",
    "parse_config",
]
