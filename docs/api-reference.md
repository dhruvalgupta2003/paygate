# API reference

PayGate has three public interfaces:

1. **Proxy HTTP** — what agents see.
2. **Admin HTTP** — what operators call from the dashboard or scripts.
3. **CLI** — `paygate` command line.

An OpenAPI document (`docs/reference/openapi.yaml`) and a generated client
for TypeScript and Python live under `packages/paygate-*/client/`.

---

## 1. Proxy HTTP

### `ANY /<upstream path>`

- Untouched request/response, modulo the x402 handshake layer.
- Response headers added:
  - `x402-version: 1`
  - `X-PAYMENT-RESPONSE: t=…,tx=…,block=…,settled=…,signature=…`
  - `X-Request-Id: <ulid>`
  - `Server-Timing: verify;dur=…, settle;dur=…, upstream;dur=…`

### 402 response body

```json
{
  "error": "PAYMENT_REQUIRED",
  "paymentRequirements": {
    "scheme": "exact",
    "chain": "base",
    "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "amount": "1000",
    "payTo": "0xYourWallet",
    "nonce": "01J...",
    "digest": "sha256:...",
    "validUntil": 1718640300,
    "facilitator": "https://x402.org/facilitator",
    "description": "Weather lookup"
  },
  "requestId": "01J...",
  "retryable": true
}
```

### 402 response with specific error

```json
{
  "error": "AMOUNT_INSUFFICIENT",
  "detail": "required 1000 micros USDC, got 800 micros USDC",
  "requestId": "01J...",
  "retryable": true,
  "retryAfterMs": 2000
}
```

---

## 2. Admin HTTP (base: `/_paygate/v1`)

All requests require one of:

- `Authorization: Bearer <session-jwt>` (dashboard)
- `X-PayGate-Admin: ed25519:<pubkey>:<sig>` (operator script)

Rate limits: 60 rps per key, 1,000 rpm.

---

### `GET /health`

Liveness. Always 200 if the process can serve.

### `GET /readyz`

Readiness. 200 only if Redis, RPC and config all healthy.

### `GET /metrics`

Prometheus exposition format. No auth; expose internally only.

### `GET /analytics/summary?range=24h`

```json
{
  "range": "24h",
  "revenueUsdc": "12.345600",
  "requests": 14230,
  "unique_wallets": 182,
  "top_endpoints": [
    { "path": "/api/v1/weather/*", "requests": 9012, "revenue_usdc": "9.012000" }
  ]
}
```

### `GET /analytics/timeseries?metric=revenue&step=1h&range=24h`

Returns `{ points: [{t, v}] }`. Metric names:
`revenue_usdc`, `requests_total`, `verify_failures_total`,
`rate_limit_drops_total`.

### `GET /transactions?status=settled&limit=50&cursor=…`

```json
{
  "items": [
    {
      "id": "01J...",
      "chain": "base",
      "tx_hash": "0x...",
      "from_wallet": "0x...",
      "to_wallet": "0x...",
      "amount_usdc": "0.001000",
      "endpoint": "/api/v1/weather/sf",
      "status": "settled",
      "observed_at": "2026-04-17T12:00:00Z"
    }
  ],
  "next_cursor": null
}
```

### `POST /refunds`

Request body:

```json
{ "tx_hash": "0x...", "reason": "duplicate charge" }
```

Returns a refund record id. Operator then sends USDC back and calls:

### `POST /refunds/:id/confirm`

```json
{ "refund_tx_hash": "0x..." }
```

### `POST /webhooks`

Create a webhook subscription:

```json
{
  "url": "https://example.com/paygate/webhook",
  "events": ["payment.settled", "payment.reorged", "compliance.blocked"],
  "secret": "..."
}
```

### `GET /webhooks/deliveries?status=failed`

Inspect deliveries; redeliver via `POST /webhooks/deliveries/:id/redeliver`.

### `POST /config/reload`

Reload `paygate.config.yml` without restarting (validated against schema
first; rejects with a diff if invalid).

### `GET /directory/listing`

Your current directory entry.

### `POST /directory/submit`

Opt into the public directory. Body:

```json
{
  "project": { "name": "...", "slug": "..." },
  "signed_challenge": "ed25519:...:..."
}
```

### `POST /dsr/redact`

Data-subject redaction request:

```json
{ "wallet": "0x...", "scope": "analytics" }
```

### `GET /evidence/pack?since=2026-01-01`

Streams a ZIP of SOC 2 evidence bundles.

---

## 3. CLI

Installed via `npx @paygate/node` or `pip install paygate`.

```
paygate start        Run the proxy.
paygate doctor       Check config, RPC, Redis, and ports.
paygate verify       Verify a transaction against config.
paygate simulate     Replay a captured request locally.
paygate config       lint | migrate | print | explain
paygate directory    submit | update | unlist
paygate keys         generate-webhook-secret | generate-admin-keypair
paygate audit        verify | tail | pack
paygate dsr          redact | export
paygate evidence     pack
```

### `paygate start`

```
Usage: paygate start [options]

Options:
  -c, --config <path>       Path to paygate.config.yml (default: ./paygate.config.yml)
  -u, --upstream <url>      Upstream URL to proxy to
  -p, --port <port>         Listen port (default: 4021)
  -H, --host <host>         Listen host (default: 0.0.0.0)
      --dev                 Enable dev mode (skip on-chain verify)
      --trace               Enable request tracing
      --dry-run             Validate config + exit
```

### `paygate verify`

```
Usage: paygate verify [options]

Options:
  --chain <chain>           base | base-sepolia | solana | solana-devnet
  --tx <hash>               Transaction hash or signature
  --expected-amount <usdc>  e.g. 0.001
  --expected-to <address>   Receiver wallet
```

Prints a detailed verification report.

### `paygate doctor`

Checks:
- Config loads and validates.
- Receiving wallets are well-formed for each chain.
- RPC endpoints are reachable and returning sane data.
- Redis is reachable; can SET/GET.
- Postgres reachable (if configured).
- Facilitator reachable (if configured).
- Listening port is free.

Exit code: 0 if all green, 1 otherwise.

---

## OpenAPI

A strict OpenAPI 3.1 document is generated from the Zod / Pydantic models
and lives at `docs/reference/openapi.yaml`. Import into Swagger UI or
`redocly` to browse.

To keep it up to date, `pnpm build` runs `pnpm generate:openapi` which
writes the YAML from source of truth.
