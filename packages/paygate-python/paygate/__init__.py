"""PayGate — x402 paywall for AI agent traffic.

Public API.  Anything consumers should reach for is exported here.
"""

from __future__ import annotations

from paygate._version import __version__
from paygate.config import PayGateConfig, load_config, parse_config
from paygate.constants import (
    ALL_CHAINS,
    ChainId,
    DEFAULT_FACILITATOR_URL,
    DEFAULT_PAYMENT_TTL_SECONDS,
    USDC_ADDRESSES,
    USDC_DECIMALS,
)
from paygate.errors import ErrorCode, PayGateError, is_paygate_error
from paygate.proxy.core import CoreProxy
from paygate.types import (
    ChainAdapter,
    ComplianceDecision,
    ComplianceScreen,
    EvmPaymentAuth,
    NonceStore,
    PaymentAuth,
    PaymentRequirements,
    PayGateRequest,
    PayGateResponse,
    SettlementProof,
    SolanaPaymentAuth,
    VerifyResult,
)

__all__ = [
    "__version__",
    "PayGateConfig",
    "load_config",
    "parse_config",
    "ALL_CHAINS",
    "ChainId",
    "DEFAULT_FACILITATOR_URL",
    "DEFAULT_PAYMENT_TTL_SECONDS",
    "USDC_ADDRESSES",
    "USDC_DECIMALS",
    "ErrorCode",
    "PayGateError",
    "is_paygate_error",
    "CoreProxy",
    "ChainAdapter",
    "ComplianceDecision",
    "ComplianceScreen",
    "EvmPaymentAuth",
    "NonceStore",
    "PaymentAuth",
    "PaymentRequirements",
    "PayGateRequest",
    "PayGateResponse",
    "SettlementProof",
    "SolanaPaymentAuth",
    "VerifyResult",
]
