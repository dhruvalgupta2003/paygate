/**
 * Limen Example — Hono on @hono/node-server.
 *
 * Demonstrates the `@limen/node/hono` middleware charging $0.001 USDC per
 * call on Base Sepolia. Identical routes to the Express example so you can
 * A/B test handler frameworks side-by-side.
 */
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import Redis from 'ioredis';
import { limenHono } from '@limen/node/hono';
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
  throw new Error('LIMEN_WALLET_BASE_SEPOLIA is required.');
}

const redis = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379');

const app = new Hono();

app.use(
  '*',
  limenHono({
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
      endpoints: [
        { path: '/healthz', price_usdc: '0' },
        { path: '/api/v1/weather/*', method: ['GET'], price_usdc: '0.001' },
        { path: '/api/v1/score', method: ['POST'], price_usdc: '0.001' },
      ],
      rate_limits: [{ scope: 'wallet', limit: 600, window_seconds: 60 }],
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
  }),
);

app.get('/healthz', (c) => c.json({ ok: true }));

app.get('/api/v1/weather/:city', (c) => {
  const city = c.req.param('city');
  return c.json({
    city,
    tempC: 17,
    condition: 'partly cloudy',
    observed_at: new Date().toISOString(),
  });
});

interface ScoreBody {
  readonly features: readonly number[];
}

app.post('/api/v1/score', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Partial<ScoreBody>;
  const features = Array.isArray(body.features) ? body.features : [];
  if (features.some((f) => typeof f !== 'number')) {
    return c.json({ error: 'features must be an array of numbers' }, 400);
  }
  const score = features.reduce((acc, f) => acc + f, 0) / Math.max(features.length, 1);
  return c.json({ score: Number(score.toFixed(4)), n: features.length });
});

serve({ fetch: app.fetch, port: PORT }, (info) => {
  // eslint-disable-next-line no-console -- bootstrap banner only
  console.log(`[limen-hono] listening on :${info.port} (chain=base-sepolia)`);
});
