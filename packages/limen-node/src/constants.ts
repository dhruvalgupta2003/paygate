/**
 * Canonical constants.  These are the source of truth for chain + asset
 * addresses.  Do NOT read chain constants from user input.
 */

export const LIMEN_VERSION = '0.1.0' as const;
export const X402_VERSION = '1' as const;

export const USDC_DECIMALS = 6 as const;

export const ChainId = {
  BASE: 'base',
  BASE_SEPOLIA: 'base-sepolia',
  SOLANA: 'solana',
  SOLANA_DEVNET: 'solana-devnet',
} as const;
export type ChainId = (typeof ChainId)[keyof typeof ChainId];
export const ALL_CHAINS: readonly ChainId[] = Object.values(ChainId);

export const EvmChainId = {
  BASE: 8453,
  BASE_SEPOLIA: 84532,
} as const;

export const USDC_ADDRESSES = {
  base: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  'base-sepolia': '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  solana: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  'solana-devnet': '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
} as const satisfies Record<ChainId, string>;

export const EIP712_DOMAIN = {
  base: {
    name: 'USD Coin',
    version: '2',
    chainId: EvmChainId.BASE,
    verifyingContract: USDC_ADDRESSES.base,
  },
  'base-sepolia': {
    name: 'USDC',
    version: '2',
    chainId: EvmChainId.BASE_SEPOLIA,
    verifyingContract: USDC_ADDRESSES['base-sepolia'],
  },
} as const;

export const DEFAULT_FACILITATOR_URL = 'https://x402.org/facilitator' as const;

export const DEFAULT_RPC_URLS: Record<ChainId, string> = {
  base: 'https://mainnet.base.org',
  'base-sepolia': 'https://sepolia.base.org',
  solana: 'https://api.mainnet-beta.solana.com',
  'solana-devnet': 'https://api.devnet.solana.com',
};

export const DEFAULT_PAYMENT_TTL_SECONDS = 300;
export const DEFAULT_NONCE_OVERLAP_SECONDS = 60;
export const DEFAULT_CONFIRMATIONS_BASE = 2;
export const DEFAULT_CONFIRMATIONS_SOLANA = 'confirmed' as const;

export const MAX_X_PAYMENT_HEADER_BYTES = 16 * 1024;
export const MAX_REQUEST_BODY_MB = 5;
export const DEFAULT_UPSTREAM_TIMEOUT_MS = 15_000;
export const DEFAULT_VERIFIER_TIMEOUT_MS = 4_000;

export const SOLANA_PROGRAMS = {
  TOKEN: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  TOKEN_2022: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
  ASSOCIATED_TOKEN: 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
  MEMO_V2: 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr',
  COMPUTE_BUDGET: 'ComputeBudget111111111111111111111111111111',
} as const;
