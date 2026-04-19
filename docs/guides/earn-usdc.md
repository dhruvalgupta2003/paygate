# Earn USDC from your existing API in 5 minutes

You have an API. You want agents to pay you per call. Here's the fastest
path.

---

## Prerequisites

- Your API is running (anywhere; we just point at it).
- You have a receiving wallet on **Base** (any EVM address will do).
- `node ≥ 20.10` or `python ≥ 3.11` installed.

---

## Step 1 — Pick a price

`0.0005` USDC per call is a good starting point for most text APIs.
`0.01`+ works for scraping, image gen, or heavier work.

Check the [directory](https://limen.dev/directory) to see what similar
APIs charge.

---

## Step 2 — Write a config

Create `limen.config.yml`:

```yaml
version: 1
project: { name: my-api, slug: my-api }
wallets: { base: "0xYOUR_RECEIVING_ADDRESS" }
defaults: { chain: base, facilitator: coinbase }
endpoints:
  - path: /api/v1/**
    price_usdc: 0.0005
```

That's the whole config. Everything else is sane defaults.

---

## Step 3 — Run Limen in front of your API

```bash
# Your API is on :3000.  Limen listens on :4021.
npx @limen/node start \
  --config limen.config.yml \
  --upstream http://localhost:3000 \
  --port 4021
```

Or, via Docker:

```bash
docker run --rm -p 4021:4021 \
  -v $(pwd)/limen.config.yml:/app/limen.config.yml:ro \
  -e LIMEN_WALLET_BASE=0xYourAddress \
  ghcr.io/limen/proxy:latest \
  start --config /app/limen.config.yml --upstream http://host.docker.internal:3000
```

---

## Step 4 — Try it

```bash
curl -i http://localhost:4021/api/v1/anything
```

You'll see:

```
HTTP/1.1 402 Payment Required
Content-Type: application/vnd.x402+json

{
  "error": "PAYMENT_REQUIRED",
  "paymentRequirements": {
    "scheme": "exact",
    "chain": "base",
    "amount": "500",
    ...
  }
}
```

x402-compatible agents now know how to pay.

---

## Step 5 — Watch the dashboard

```
open http://localhost:5173
```

Revenue, requests, agents. Tick tick tick.

---

## Bumps

- Change DNS to point your public domain at Limen (port 4021). Limen
  terminates TLS or trusts your LB if `advanced.trust_proxy: true`.
- Add `wallets.solana` for sub-cent payments.
- Add `rate_limits` if an agent is noisy.
- Add `webhooks` to log every settled payment to your CRM.

Full reference: [docs/api-reference.md](../api-reference.md).
