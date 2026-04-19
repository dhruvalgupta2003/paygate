/**
 * Limen Example — Monetised Solana RPC Gateway.
 *
 * A tiny Hono server that accepts a whitelist of JSON-RPC methods
 * (`getBlockHeight`, `getBalance`, `getTransaction`) and proxies them to an
 * upstream Solana RPC endpoint. Limen charges $0.00025 USDC per call (on
 * Solana devnet by default) before the request is forwarded.
 *
 * Use cases:
 *   - Sell excess RPC capacity without building auth / billing infra.
 *   - Front an expensive upstream (Helius, QuickNode) with a pay-per-call
 *     wrapper that agents discover via x402.
 */
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import Redis from 'ioredis';
import { request as undiciRequest } from 'undici';
import { limenHono } from '@limen/node/hono';
import {
  SolanaAdapter,
  RedisNonceStore,
  RedisRateLimiter,
  DefaultComplianceScreen,
  FacilitatorClient,
  createLogger,
} from '@limen/node';

const PORT = Number(process.env.PORT ?? 4022);

const receivingWallet = process.env.LIMEN_WALLET_SOLANA_DEVNET;
if (!receivingWallet) {
  throw new Error('LIMEN_WALLET_SOLANA_DEVNET is required.');
}

const upstream = process.env.SOLANA_UPSTREAM_URL ?? 'https://api.devnet.solana.com';
const redis = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379');

// Only these methods are billable. Everything else is rejected with 405.
const ALLOWED_METHODS: ReadonlySet<string> = new Set([
  'getBlockHeight',
  'getBalance',
  'getTransaction',
]);

const app = new Hono();

app.use(
  '/rpc',
  limenHono({
    config: {
      version: 1,
      wallets: { solana: receivingWallet },
      defaults: {
        chain: 'solana-devnet',
        currency: 'USDC',
        confirmations: 1,
        payment_ttl_seconds: 300,
        facilitator: 'coinbase',
      },
      endpoints: [{ path: '/rpc', method: ['POST'], price_usdc: '0.00025' }],
      rate_limits: [
        { scope: 'wallet', limit: 1200, window_seconds: 60 },
        { scope: 'ip', limit: 300, window_seconds: 60 },
      ],
      cache: { enabled: false, driver: 'memory', default_ttl_seconds: 0, rules: [] },
      compliance: {
        sanctions_screening: true,
        geo_blocklist: [],
        travel_rule_threshold_usd: 3000,
      },
      webhooks: [],
      discovery: { listed: false, categories: ['rpc', 'solana'] },
      advanced: {
        upstream_timeout_ms: 15_000,
        verifier_timeout_ms: 4_000,
        max_request_body_mb: 1,
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
      solana: new SolanaAdapter({
        chainId: 'solana-devnet',
        rpcUrl: process.env.LIMEN_SOLANA_DEVNET_RPC_URL ?? 'https://api.devnet.solana.com',
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

interface JsonRpcRequest {
  readonly jsonrpc: '2.0';
  readonly id: number | string;
  readonly method: string;
  readonly params?: readonly unknown[];
}

app.post('/rpc', async (c) => {
  const body = (await c.req.json().catch(() => null)) as JsonRpcRequest | null;
  if (!body || body.jsonrpc !== '2.0' || typeof body.method !== 'string') {
    return c.json({ error: 'malformed JSON-RPC 2.0 envelope' }, 400);
  }
  if (!ALLOWED_METHODS.has(body.method)) {
    return c.json(
      { error: `method not allowed on this gateway: ${body.method}` },
      405,
    );
  }

  const res = await undiciRequest(upstream, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.body.text();
  return c.body(text, res.statusCode as 200 | 400 | 500, {
    'content-type': res.headers['content-type']?.toString() ?? 'application/json',
  });
});

app.get('/healthz', (c) => c.json({ ok: true, upstream }));

serve({ fetch: app.fetch, port: PORT }, (info) => {
  // eslint-disable-next-line no-console -- bootstrap banner only
  console.log(`[limen-solana-rpc] listening on :${info.port} upstream=${upstream}`);
});
