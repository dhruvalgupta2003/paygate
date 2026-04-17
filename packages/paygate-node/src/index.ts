/**
 * @paygate/node — public exports.  Everything consumers should reach for
 * should be here.  Internal utilities remain module-private.
 */

export {
  PAYGATE_VERSION,
  X402_VERSION,
  USDC_DECIMALS,
  ChainId,
  USDC_ADDRESSES,
  DEFAULT_FACILITATOR_URL,
  DEFAULT_PAYMENT_TTL_SECONDS,
} from './constants.js';

export { PayGateError, ErrorCode, isPayGateError } from './errors.js';
export { loadConfigFromFile, loadConfigFromString, parseConfig, configSchema } from './config.js';
export type { PayGateConfig, EndpointConfig } from './config.js';

export type {
  PaymentRequirements,
  PaymentAuth,
  EvmPaymentAuth,
  SolanaPaymentAuth,
  VerifyResult,
  SettlementProof,
  ChainAdapter,
  Logger,
  ComplianceScreen,
  ComplianceDecision,
  NonceStore,
  PayGateRequest,
  PayGateResponse,
} from './types.js';

export { BaseAdapter } from './chains/base.js';
export { SolanaAdapter } from './chains/solana.js';
export { FacilitatorClient } from './facilitator/client.js';
export { CoreProxy } from './proxy/core.js';
export { compileMatcher } from './proxy/matcher.js';
export { decodePaymentHeader, encodeRequirements, isEvmAuth, isSolanaAuth } from './proxy/handshake.js';
export { createLogger, walletMask, nonceMask } from './utils/logger.js';
export { usdcToMicros, microsToUsdc } from './utils/amount.js';
export { digestRequirements, canonicalJson } from './utils/digest.js';
export { generateNonce, epochSeconds } from './utils/nonce.js';
export { RedisNonceStore, InMemoryNonceStore } from './utils/nonce-store.js';
export { RedisRateLimiter, InMemoryRateLimiter } from './utils/rate-limiter.js';
export { DefaultComplianceScreen, NullComplianceScreen, loadBlocklist } from './verification/compliance.js';
export { AuditLogger } from './analytics/audit-log.js';
export { registry as metricsRegistry, collectMetricsText, metrics } from './analytics/metrics.js';
