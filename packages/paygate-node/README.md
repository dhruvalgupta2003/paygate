# @paygate/node

> x402 paywall middleware + standalone proxy for Node.js. USDC on Base and
> Solana. Drop-in for Express, Fastify, Hono, and Next.js.

[![npm](https://img.shields.io/npm/v/@paygate/node?color=5B4FE9)](https://www.npmjs.com/package/@paygate/node)
[![license](https://img.shields.io/badge/license-MIT-10B981)](../../LICENSE)

---

## Install

```bash
npm i @paygate/node
# or
pnpm add @paygate/node
# or
yarn add @paygate/node
```

Runtime requirements: **Node.js 20.10+**.

---

## Quickstart (Express)

```ts
import express from 'express';
import Redis from 'ioredis';
import {
  BaseAdapter,
  RedisNonceStore,
  RedisRateLimiter,
  DefaultComplianceScreen,
  FacilitatorClient,
  createLogger,
} from '@paygate/node';
import { paygate } from '@paygate/node/express';

const redis = new Redis(process.env.REDIS_URL!);

const app = express();
app.use(
  paygate({
    config: {
      version: 1,
      wallets: { base: process.env.PAYGATE_WALLET_BASE! },
      defaults: {
        chain: 'base',
        currency: 'USDC',
        confirmations: 2,
        payment_ttl_seconds: 300,
        facilitator: 'coinbase',
      },
      endpoints: [{ path: '/api/v1/*', price_usdc: '0.001' }],
      rate_limits: [{ scope: 'wallet', limit: 600, window_seconds: 60 }],
      cache: { enabled: true, driver: 'redis', default_ttl_seconds: 60, rules: [] },
      compliance: { sanctions_screening: true, geo_blocklist: [], travel_rule_threshold_usd: 3000 },
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
        solana: { priority_fee_percentile: 75, use_lookup_table: false, commitment_finalized_threshold_usd: 100 },
        base: { gas_multiplier: 1.25, high_value_threshold_usd: 1000 },
      },
    },
    adapters: {
      base: new BaseAdapter({
        chainId: 'base',
        rpcUrl: process.env.PAYGATE_BASE_RPC_URL!,
        receivingWallet: process.env.PAYGATE_WALLET_BASE!,
      }),
    },
    nonceStore: new RedisNonceStore(redis),
    rateLimiter: new RedisRateLimiter(redis),
    compliance: new DefaultComplianceScreen({ geoBlocklist: [] }),
    logger: createLogger(),
    upstream: 'http://localhost:3000',
    facilitator: new FacilitatorClient(),
  }),
);

app.get('/api/v1/weather/:city', (req, res) => {
  res.json({ city: req.params.city, tempC: 17 });
});
app.listen(3000);
```

Config-file driven deployments are simpler:

```bash
npx paygate start --config ./paygate.config.yml --upstream http://localhost:3000
```

See [docs/getting-started.md](../../docs/getting-started.md) for every
framework and the [API reference](../../docs/api-reference.md).

---

## Exports

| Entry | Purpose |
|-------|---------|
| `@paygate/node` | Core types, `CoreProxy`, chain adapters, utilities. |
| `@paygate/node/express` | Express middleware. |
| `@paygate/node/fastify` | Fastify plugin. |
| `@paygate/node/hono` | Hono middleware. |
| `@paygate/node/next` | Next.js App Router handler. |

CLI: `paygate start`, `paygate doctor`, `paygate verify`,
`paygate config`, `paygate keys`, `paygate audit`.

---

## Security

This package enforces the nine invariants listed in
[docs/security.md § 4](../../docs/security.md#4-invariants-tested-and-monitored).
Report vulnerabilities privately — see [SECURITY.md](../../SECURITY.md).

---

## License

MIT.
