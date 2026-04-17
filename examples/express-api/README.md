# PayGate Example — Express API

Minimal Express app protected by the `@paygate/node/express` middleware.
Charges **$0.001 USDC per call** on **Base Sepolia** (testnet).

## 3-step quickstart

```bash
cp .env.example .env                       # fill PAYGATE_WALLET_BASE_SEPOLIA
docker compose up                          # redis + express + (optional) proxy sidecar
bash pay.sh                                # walk through the 402 -> sign -> retry loop
```

Or run without Docker (requires a local Redis):

```bash
pnpm install
pnpm --filter paygate-example-express-api dev
```

## Endpoints

| Route                         | Method | Price   | Notes                    |
|-------------------------------|--------|---------|--------------------------|
| `GET /healthz`                | GET    | free    | Liveness probe.          |
| `GET /api/v1/weather/:city`   | GET    | $0.001  | Stub weather response.   |
| `POST /api/v1/score`          | POST   | $0.001  | Averages a feature vec.  |

## Reproduce a 402

```bash
curl -i http://localhost:3000/api/v1/weather/sf
# HTTP/1.1 402 Payment Required
# Content-Type: application/json
# x-payment-requirements: { ... }
# { "accepts": [{ "scheme": "exact", "chain": "base-sepolia", ... }] }
```

An x402-compatible agent then signs an EIP-3009 `transferWithAuthorization`
for 1000 USDC micros to `payTo`, base64-encodes the PaymentAuth, and retries
with `X-PAYMENT`. See `pay.sh` for the full walkthrough and
[`docs/payment-flow.md`](../../docs/payment-flow.md) for spec details.

## Files

- `src/server.ts` — Express wiring with `paygate(...)` from `@paygate/node/express`.
- `paygate.config.yml` — YAML config consumed by the sidecar proxy.
- `docker-compose.yml` — redis + the Express app + an optional proxy sidecar.
- `Dockerfile` — multi-stage build using the workspace `@paygate/node` package.
