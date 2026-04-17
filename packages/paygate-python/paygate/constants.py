"""Canonical constants. These are the source of truth for chain + asset
addresses. Do NOT read chain constants from user input.

Mirror of ``packages/paygate-node/src/constants.ts``. If you change a value
here you must change it there too.
"""

from __future__ import annotations

from typing import Final, Literal

PAYGATE_VERSION: Final[str] = "0.1.0"
X402_VERSION: Final[str] = "1"

USDC_DECIMALS: Final[int] = 6

# Chain identifiers match the TypeScript ``ChainId`` string union exactly.
ChainIdLiteral = Literal["base", "base-sepolia", "solana", "solana-devnet"]


class ChainId:
    """Enum-like namespace mirroring the TS ``ChainId`` record."""

    BASE: Final[ChainIdLiteral] = "base"
    BASE_SEPOLIA: Final[ChainIdLiteral] = "base-sepolia"
    SOLANA: Final[ChainIdLiteral] = "solana"
    SOLANA_DEVNET: Final[ChainIdLiteral] = "solana-devnet"


ALL_CHAINS: Final[tuple[ChainIdLiteral, ...]] = (
    "base",
    "base-sepolia",
    "solana",
    "solana-devnet",
)


class EvmChainId:
    BASE: Final[int] = 8453
    BASE_SEPOLIA: Final[int] = 84532


USDC_ADDRESSES: Final[dict[ChainIdLiteral, str]] = {
    "base": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "base-sepolia": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "solana": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "solana-devnet": "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
}


EIP712_DOMAIN: Final[dict[str, dict[str, object]]] = {
    "base": {
        "name": "USD Coin",
        "version": "2",
        "chainId": EvmChainId.BASE,
        "verifyingContract": USDC_ADDRESSES["base"],
    },
    "base-sepolia": {
        "name": "USDC",
        "version": "2",
        "chainId": EvmChainId.BASE_SEPOLIA,
        "verifyingContract": USDC_ADDRESSES["base-sepolia"],
    },
}


DEFAULT_FACILITATOR_URL: Final[str] = "https://x402.org/facilitator"

DEFAULT_RPC_URLS: Final[dict[ChainIdLiteral, str]] = {
    "base": "https://mainnet.base.org",
    "base-sepolia": "https://sepolia.base.org",
    "solana": "https://api.mainnet-beta.solana.com",
    "solana-devnet": "https://api.devnet.solana.com",
}

DEFAULT_PAYMENT_TTL_SECONDS: Final[int] = 300
DEFAULT_NONCE_OVERLAP_SECONDS: Final[int] = 60
DEFAULT_CONFIRMATIONS_BASE: Final[int] = 2
DEFAULT_CONFIRMATIONS_SOLANA: Final[str] = "confirmed"

MAX_X_PAYMENT_HEADER_BYTES: Final[int] = 16 * 1024
MAX_REQUEST_BODY_MB: Final[int] = 5
DEFAULT_UPSTREAM_TIMEOUT_MS: Final[int] = 15_000
DEFAULT_VERIFIER_TIMEOUT_MS: Final[int] = 4_000


class SolanaPrograms:
    TOKEN: Final[str] = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    TOKEN_2022: Final[str] = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
    ASSOCIATED_TOKEN: Final[str] = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
    MEMO_V2: Final[str] = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
    COMPUTE_BUDGET: Final[str] = "ComputeBudget111111111111111111111111111111"


SOLANA_PROGRAMS: Final[dict[str, str]] = {
    "TOKEN": SolanaPrograms.TOKEN,
    "TOKEN_2022": SolanaPrograms.TOKEN_2022,
    "ASSOCIATED_TOKEN": SolanaPrograms.ASSOCIATED_TOKEN,
    "MEMO_V2": SolanaPrograms.MEMO_V2,
    "COMPUTE_BUDGET": SolanaPrograms.COMPUTE_BUDGET,
}
