# PayGate Example — Next.js App Router

Next.js 14 app with a PayGate-guarded `/api/premium/*` route. Uses
`@paygate/node/next` in `middleware.ts` and runs on the Node runtime.
Charges **$0.001 USDC per call** on **Base Sepolia**.

## 3-step quickstart

```bash
cp .env.example .env.local          # set PAYGATE_WALLET_BASE_SEPOLIA
pnpm --filter paygate-example-nextjs-api dev
bash pay.sh                         # walk through the 402 -> sign -> retry loop
```

Requires a local Redis (`redis-server` or `docker run -p 6379:6379 redis:7`).

## Files

- `middleware.ts` — `paygateEdge(...)` guards `/api/premium/:path*`.
- `app/api/premium/route.ts` — the protected handler. Only reached after payment.
- `app/page.tsx`, `app/layout.tsx` — minimal landing shell.
- `paygate.config.yml` — shape-compatible config (used if you run a sidecar proxy).

## Reproduce a 402

```bash
curl -i http://localhost:3000/api/premium
# HTTP/1.1 402 Payment Required
# x-payment-requirements: { ... }
```

The agent signs an EIP-3009 authorization, base64-encodes the PaymentAuth,
and retries with `X-PAYMENT`. Full handshake:
[`docs/payment-flow.md`](../../docs/payment-flow.md).

## Deploying to Edge

This example runs on the Node runtime so it can use `ioredis`. For Vercel
Edge, swap `RedisNonceStore` / `RedisRateLimiter` for Upstash REST
equivalents and set `UPSTASH_REDIS_URL` / `UPSTASH_REDIS_TOKEN`.
