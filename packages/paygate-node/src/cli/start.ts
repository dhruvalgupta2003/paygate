import { createServer } from 'node:http';
import Redis from 'ioredis';
import { Hono } from 'hono';
import { loadConfigFromFile } from '../config.js';
import { createLogger } from '../utils/logger.js';
import { DEFAULT_FACILITATOR_URL } from '../constants.js';
import { BaseAdapter } from '../chains/base.js';
import { SolanaAdapter } from '../chains/solana.js';
import { RedisNonceStore, InMemoryNonceStore } from '../utils/nonce-store.js';
import { RedisRateLimiter, InMemoryRateLimiter } from '../utils/rate-limiter.js';
import { DefaultComplianceScreen, NullComplianceScreen } from '../verification/compliance.js';
import { CoreProxy } from '../proxy/core.js';
import { FacilitatorClient } from '../facilitator/client.js';
import { collectMetricsText } from '../analytics/metrics.js';
import type { ChainAdapter } from '../types.js';

export interface StartOptions {
  readonly config: string;
  readonly upstream?: string;
  readonly port: string;
  readonly host: string;
  readonly dev?: boolean;
  readonly dryRun?: boolean;
}

export async function startServer(opts: StartOptions): Promise<void> {
  const logger = createLogger();
  const cfg = loadConfigFromFile(opts.config);
  if (opts.dryRun) {
    logger.info({ config: opts.config }, 'config OK');
    return;
  }

  const upstream = opts.upstream ?? process.env['PAYGATE_UPSTREAM_URL'];
  if (!upstream) {
    throw new Error('upstream URL is required (--upstream or PAYGATE_UPSTREAM_URL)');
  }

  const redisUrl = process.env['PAYGATE_REDIS_URL'];
  const redis = redisUrl
    ? new Redis(redisUrl, { maxRetriesPerRequest: 2, enableReadyCheck: true })
    : undefined;
  const nonceStore = redis ? new RedisNonceStore(redis) : new InMemoryNonceStore();
  const rateLimiter = redis ? new RedisRateLimiter(redis) : new InMemoryRateLimiter();

  const compliance = cfg.compliance.sanctions_screening
    ? new DefaultComplianceScreen({
        circleApiKey: process.env['PAYGATE_CIRCLE_API_KEY'] ?? undefined,
        geoBlocklist: cfg.compliance.geo_blocklist,
      })
    : new NullComplianceScreen();

  const facilitator =
    cfg.defaults.facilitator === 'coinbase'
      ? new FacilitatorClient({
          url: cfg.advanced.facilitator_url ?? DEFAULT_FACILITATOR_URL,
          ...(process.env['PAYGATE_FACILITATOR_API_KEY']
            ? { apiKey: process.env['PAYGATE_FACILITATOR_API_KEY'] }
            : {}),
        })
      : undefined;

  const adapters: Record<string, ChainAdapter> = {};
  if (cfg.wallets.base) {
    adapters['base'] = new BaseAdapter({
      chainId: 'base',
      rpcUrl: process.env['PAYGATE_BASE_RPC_URL'] ?? 'https://mainnet.base.org',
      receivingWallet: cfg.wallets.base,
      ...(cfg.advanced.facilitator_url
        ? { facilitatorUrl: cfg.advanced.facilitator_url }
        : {}),
    });
  }
  if (cfg.wallets['base-sepolia']) {
    adapters['base-sepolia'] = new BaseAdapter({
      chainId: 'base-sepolia',
      rpcUrl: process.env['PAYGATE_BASE_SEPOLIA_RPC_URL'] ?? 'https://sepolia.base.org',
      receivingWallet: cfg.wallets['base-sepolia'],
    });
  }
  if (cfg.wallets.solana) {
    adapters['solana'] = new SolanaAdapter({
      chainId: 'solana',
      rpcUrl: process.env['PAYGATE_SOLANA_RPC_URL'] ?? 'https://api.mainnet-beta.solana.com',
      receivingWallet: cfg.wallets.solana,
    });
  }
  if (cfg.wallets['solana-devnet']) {
    adapters['solana-devnet'] = new SolanaAdapter({
      chainId: 'solana-devnet',
      rpcUrl:
        process.env['PAYGATE_SOLANA_DEVNET_RPC_URL'] ?? 'https://api.devnet.solana.com',
      receivingWallet: cfg.wallets['solana-devnet'],
    });
  }

  const proxy = new CoreProxy({
    config: cfg,
    adapters,
    nonceStore,
    rateLimiter,
    compliance,
    logger,
    upstream,
    ...(facilitator !== undefined ? { facilitator } : {}),
  });

  const app = new Hono();
  app.get('/livez', (c) => c.text('ok'));
  app.get('/readyz', async (c) => {
    try {
      if (redis) await redis.ping();
      return c.text('ok');
    } catch {
      return c.text('degraded', 503);
    }
  });
  app.get('/metrics', async (c) => {
    const text = await collectMetricsText();
    c.header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    return c.body(text);
  });

  app.all('*', async (c) => {
    const req = c.req;
    const url = new URL(req.url);
    const buf =
      req.method === 'GET' || req.method === 'HEAD'
        ? undefined
        : new Uint8Array(await req.raw.arrayBuffer());
    const result = await proxy.handle({
      method: req.method,
      url: req.url,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      headers: Object.fromEntries(req.raw.headers) as never,
      ip: req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined,
      body: buf,
    });
    return c.body(
      result.response.body ?? null,
      result.response.status as never,
      result.response.headers,
    );
  });

  const port = Number(opts.port);
  const server = createServer(async (req, res) => {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const body = Buffer.concat(chunks);
      const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
      const webReq = new Request(url, {
        method: req.method,
        headers: req.headers as never,
        body: body.length > 0 ? body : undefined,
      });
      const webRes = await app.fetch(webReq);
      res.statusCode = webRes.status;
      webRes.headers.forEach((v, k) => res.setHeader(k, v));
      const payload = await webRes.arrayBuffer();
      res.end(Buffer.from(payload));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'internal error';
      res.statusCode = 500;
      res.end(message);
    }
  });

  server.listen(port, opts.host, () => {
    logger.info({ host: opts.host, port, upstream }, 'paygate listening');
  });

  const shutdown = (signal: NodeJS.Signals): void => {
    logger.info({ signal }, 'shutting down');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
