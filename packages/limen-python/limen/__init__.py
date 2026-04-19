"""Limen — x402 paywall for AI agent traffic.

Public API.  Anything consumers should reach for is exported here.
"""

from __future__ import annotations

from limen._version import __version__
from limen.config import LimenConfig, load_config, parse_config
from limen.constants import (
    ALL_CHAINS,
    ChainId,
    DEFAULT_FACILITATOR_URL,
    DEFAULT_PAYMENT_TTL_SECONDS,
    USDC_ADDRESSES,
    USDC_DECIMALS,
)
from limen.errors import ErrorCode, LimenError, is_limen_error
from limen.proxy.core import CoreProxy
from limen.types import (
    ChainAdapter,
    ComplianceDecision,
    ComplianceScreen,
    EvmPaymentAuth,
    NonceStore,
    PaymentAuth,
    PaymentRequirements,
    LimenRequest,
    LimenResponse,
    SettlementProof,
    SolanaPaymentAuth,
    VerifyResult,
)

__all__ = [
    "__version__",
    "LimenConfig",
    "load_config",
    "parse_config",
    "ALL_CHAINS",
    "ChainId",
    "DEFAULT_FACILITATOR_URL",
    "DEFAULT_PAYMENT_TTL_SECONDS",
    "USDC_ADDRESSES",
    "USDC_DECIMALS",
    "ErrorCode",
    "LimenError",
    "is_limen_error",
    "CoreProxy",
    "ChainAdapter",
    "ComplianceDecision",
    "ComplianceScreen",
    "EvmPaymentAuth",
    "NonceStore",
    "PaymentAuth",
    "PaymentRequirements",
    "LimenRequest",
    "LimenResponse",
    "SettlementProof",
    "SolanaPaymentAuth",
    "VerifyResult",
]
