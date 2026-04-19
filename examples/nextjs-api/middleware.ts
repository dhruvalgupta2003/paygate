/**
 * Next.js middleware — Limen guard for /api/premium/*.
 *
 * All env vars must be set at build time or provided via `.env.local`.
 * See `.env.example`. The middleware issues a 402 with x402
 * PaymentRequirements when no valid X-PAYMENT is present.
 */
import { limenEdge } from '@limen/node/next';
import {
  BaseAdapter,
  RedisNonceStore,
  RedisRateLimiter,
  DefaultComplianceScreen,
  FacilitatorClient,
  createLogger,
} from '@limen/node';
import Redis from 'ioredis';

const receivingWallet = process.env.LIMEN_WALLET_BASE_SEPOLIA;
if (!receivingWallet) {
  throw new Error('LIMEN_WALLET_BASE_SEPOLIA is required.');
}

const redis = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379');

export const middleware = limenEdge({
  config: {
    version: 1,
    wallets: { base: receivingWallet },
    defaults: {
      chain: 'base-sepolia',
      currency: 'USDC',
      confirmations: 1,
      payment_ttl_seconds: 300,
      facilitator: 'coinbase',
    },
    endpoints: [{ path: '/api/premium/*', price_usdc: '0.001' }],
    rate_limits: [{ scope: 'wallet', limit: 600, window_seconds: 60 }],
    cache: { enabled: false, driver: 'memory', default_ttl_seconds: 0, rules: [] },
    compliance: {
      sanctions_screening: true,
      geo_blocklist: [],
      travel_rule_threshold_usd: 3000,
    },
    webhooks: [],
    discovery: { listed: false, categories: [] },
    advanced: {
      upstream_timeout_ms: 15_000,
      verifier_timeout_ms: 4_000,
      max_request_body_mb: 5,
      trust_proxy: true,
      proxy_protocol: false,
      log_bodies: false,
      facilitator_url: 'https://x402.org/facilitator',
      facilitator_failover_seconds: 300,
      solana: {
        priority_fee_percentile: 75,
        use_lookup_table: false,
        commitment_finalized_threshold_usd: 100,
      },
      base: { gas_multiplier: 1.25, high_value_threshold_usd: 1000 },
    },
  },
  adapters: {
    base: new BaseAdapter({
      chainId: 'base-sepolia',
      rpcUrl: process.env.LIMEN_BASE_SEPOLIA_RPC_URL ?? 'https://sepolia.base.org',
      receivingWallet,
    }),
  },
  nonceStore: new RedisNonceStore(redis),
  rateLimiter: new RedisRateLimiter(redis),
  compliance: new DefaultComplianceScreen({ geoBlocklist: [] }),
  logger: createLogger(),
  facilitator: new FacilitatorClient(),
});

export const config = {
  matcher: ['/api/premium/:path*'],
  runtime: 'nodejs',
};
