# Limen Example — Hono

Hono app running on `@hono/node-server`, protected by `@limen/node/hono`.
Charges **$0.001 USDC per call** on **Base Sepolia**.

## 3-step quickstart

```bash
cp .env.example .env                # set LIMEN_WALLET_BASE_SEPOLIA
docker compose up                   # redis + hono + optional proxy sidecar
bash pay.sh                         # walk through the 402 -> sign -> retry
```

Local without Docker:

```bash
pnpm install
pnpm --filter limen-example-hono-api dev
```

## Endpoints

| Route                         | Method | Price   |
|-------------------------------|--------|---------|
| `GET /healthz`                | GET    | free    |
| `GET /api/v1/weather/:city`   | GET    | $0.001  |
| `POST /api/v1/score`          | POST   | $0.001  |

## Reproduce a 402

```bash
curl -i http://localhost:3000/api/v1/weather/sf
```

See [`docs/payment-flow.md`](../../docs/payment-flow.md) for the full x402
handshake and `src/index.ts` for the middleware wiring.
