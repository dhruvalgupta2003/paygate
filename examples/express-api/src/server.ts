/**
 * Limen Example — Express API
 *
 * Demonstrates drop-in Limen middleware charging $0.001 USDC per call on
 * Base Sepolia (testnet). The middleware issues a 402 with x402-compliant
 * PaymentRequirements when no X-PAYMENT header is present, and lets the
 * request through once the facilitator has verified an on-chain payment.
 *
 * Run:
 *   LIMEN_WALLET_BASE_SEPOLIA=0xYourReceivingAddress \
 *   REDIS_URL=redis://127.0.0.1:6379 \
 *   npm run dev
 */
import express, { type Request, type Response } from 'express';
import Redis from 'ioredis';
import { limen } from '@limen/node/express';
import {
  BaseAdapter,
  RedisNonceStore,
  RedisRateLimiter,
  DefaultComplianceScreen,
  FacilitatorClient,
  createLogger,
} from '@limen/node';

const PORT = Number(process.env.PORT ?? 3000);

const receivingWallet = process.env.LIMEN_WALLET_BASE_SEPOLIA;
if (!receivingWallet) {
  throw new Error('LIMEN_WALLET_BASE_SEPOLIA is required (testnet receive-only address).');
}

const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const redis = new Redis(redisUrl, { lazyConnect: false, maxRetriesPerRequest: 2 });

const app = express();
app.use(express.json({ limit: '1mb' }));

app.use(
  limen({
    config: {
      version: 1,
      wallets: { 'base-sepolia': receivingWallet },
      defaults: {
        chain: 'base-sepolia',
        currency: 'USDC',
        confirmations: 1,
        payment_ttl_seconds: 300,
        facilitator: 'coinbase',
      },
      endpoints: [
        { path: '/healthz', price_usdc: '0' },
        { path: '/api/v1/weather/*', method: ['GET'], price_usdc: '0.001' },
        { path: '/api/v1/score', method: ['POST'], price_usdc: '0.001' },
      ],
      rate_limits: [
        { scope: 'wallet', limit: 600, window_seconds: 60 },
        { scope: 'ip', limit: 120, window_seconds: 60 },
      ],
      cache: { enabled: true, driver: 'redis', default_ttl_seconds: 60, rules: [] },
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
      'base-sepolia': new BaseAdapter({
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
  }),
);

// --- Business routes -------------------------------------------------------
app.get('/healthz', (_req: Request, res: Response) => {
  res.json({ ok: true });
});

app.get('/api/v1/weather/:city', (req: Request, res: Response) => {
  const city = String(req.params.city ?? 'unknown');
  // TODO(weather-upstream): replace with a real data source. Stubbed so the
  // example stays hermetic and doesn't charge agents for random 500s.
  res.json({
    city,
    tempC: 17,
    condition: 'partly cloudy',
    observed_at: new Date().toISOString(),
  });
});

interface ScoreBody {
  readonly features: readonly number[];
}

app.post('/api/v1/score', (req: Request, res: Response) => {
  const body = req.body as Partial<ScoreBody>;
  const features = Array.isArray(body.features) ? body.features : [];
  if (features.some((f) => typeof f !== 'number')) {
    res.status(400).json({ error: 'features must be an array of numbers' });
    return;
  }
  const score = features.reduce((acc, f) => acc + f, 0) / Math.max(features.length, 1);
  res.json({ score: Number(score.toFixed(4)), n: features.length });
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console -- bootstrap banner only
  console.log(`[limen-express] listening on :${PORT} (chain=base-sepolia)`);
});
