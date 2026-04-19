<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./docs/assets/logo-inverted.svg">
    <img src="./docs/assets/logo.svg" alt="Limen" width="120" height="120" />
  </picture>
</p>

<h1 align="center">limen</h1>

<p align="center">
  <strong>The threshold for agent payments.</strong><br/>
  x402 paywall middleware · Node + Python SDKs · USDC on Base &amp; Solana · MIT-licensed.
</p>

<p align="center">
  <a href="./LICENSE"><img alt="license" src="https://img.shields.io/badge/license-MIT-2856B3"></a>
  <img alt="status" src="https://img.shields.io/badge/status-developer%20alpha-B86E3C">
  <img alt="chain" src="https://img.shields.io/badge/base--sepolia-verified-059669">
  <a href="./docs/brand/STORY.md"><img alt="brand" src="https://img.shields.io/badge/brand-story-0A0A0C"></a>
</p>

> **Alpha notice.** Public developer alpha. The core x402 handshake works end-to-end on Base Sepolia (verified with real USDC settlements — see [docs/testnet-demo.md](./docs/testnet-demo.md)). Several adjacent features are documented but not fully wired — see [What works today](#what-works-today) and [Known gaps](#known-gaps). Not production-ready.

---

## What is Limen?

**Limen** is the Latin word for *threshold* — the strip of stone at the bottom of a doorway. The exact instant when something crosses from one state to another.

Every API request is a transition. Untrusted on one side. Authorized on the other. **Limen sits at the threshold and decides whether the request crosses.**

It's drop-in middleware that monetises any API for AI agent traffic using the [x402 protocol](https://x402.org). One line of config, a price in USDC per call. Any x402-compatible agent can discover, pay, and consume the API instantly — no signup, no API keys, no invoicing.

```
                ╭───────────╮
   AI agent  →  │   limen   │  →  your backend (unchanged)
   (x402)    ←  │           │  ←
                ╰─────┬─────╯
                      │
                      ↓
                ┌───────────┐
                │ settlement│   USDC, finality
                │ base/sol  │   ~5s round-trip, ~$0.0001 gas
                └───────────┘
```

The proxy speaks the protocol. Your backend doesn't change. The agent doesn't need an account.

---

## Why now

| Signal | Value |
|---|---|
| x402 transactions processed | **163M+** |
| USDC share of agent payments | **98.6% EVM · 99.7% Solana** |
| Backers of x402 | Coinbase, Cloudflare, Circle, AWS, Stripe, Google |
| Stablecoin volume 2025 | **$33T** (+72% YoY) |
| Orgs planning AI agents in 2026 | **82%** |

The protocol exists. The wallets exist. The agents exist. What doesn't exist is an easy way for the millions of API providers to plug in. **Limen reduces that integration from weeks to five minutes.**

---

## Quickstart

### Node.js (Express, Fastify, Hono, Next.js)

```bash
npm i @limen/node
```

```ts
import express from 'express';
import { limen } from '@limen/node/express';

const app = express();

app.use(
  limen({
    wallets: { base: process.env.LIMEN_WALLET_BASE! },
    endpoints: [
      { path: '/api/v1/data/*',     priceUsdc: '0.001' },
      { path: '/api/v1/premium/**', priceUsdc: '0.05'  },
    ],
  }),
);

app.get('/api/v1/data/cities/:id', handler);
app.listen(3000);
```

### Python (FastAPI, Flask, Django, Starlette)

```bash
pip install limen
```

```python
from fastapi import FastAPI
from limen.fastapi import LimenMiddleware

app = FastAPI()
app.add_middleware(
    LimenMiddleware,
    wallets={"base": os.environ["LIMEN_WALLET_BASE"]},
    endpoints=[
        {"path": "/api/v1/data/*",     "price_usdc": "0.001"},
        {"path": "/api/v1/premium/**", "price_usdc": "0.05"},
    ],
)
```

### Standalone proxy (no code changes)

```bash
# Sits in front of an existing API.
npx @limen/node start \
  --config limen.config.yml \
  --upstream http://localhost:3000 \
  --port 4021
```

---

## What works today

Real, demonstrable, unit-tested, validated end-to-end on Base Sepolia:

- **x402 handshake** — compliant `402 Payment Required` responses, `X-PAYMENT` header parsing, retry contract. 32/32 unit tests green.
- **On-chain settlement verification on Base Sepolia** — agent signs EIP-3009, submits `transferWithAuthorization`, proxy verifies the Transfer event matches `(amount, from, to)`, forwards to upstream. Round-trip ~5 s, gas ~$0.0001. Receipts on [sepolia.basescan.org](https://sepolia.basescan.org).
- **Replay + TTL protection** — server-issued nonce bound to a canonical-JSON digest of the PaymentRequirements. Reuse → `NONCE_REUSED`. Expired → `EXPIRED_AUTHORIZATION`. In-memory + Redis-backed stores.
- **Rate limiting** — token bucket by wallet/ip/endpoint scope. Atomic via Redis Lua.
- **Dashboard live against real data** — React + Vite + Tailwind. Overview, Transactions, Endpoints, Agents, Compliance, Webhooks query a real Postgres via the admin API. Boots in ~90 s.
- **Backend API** — Hono + Drizzle + Postgres. Ingest endpoint lets the proxy POST settlements automatically; dashboard reflects them in <500 ms. Bearer-token auth.
- **Webhook delivery worker** — Fibonacci-ish 12-attempt retry over ~24 h. HMAC-SHA256 signed (`X-Limen-Signature: t=…,v1=…`). Single-flight scheduler with graceful shutdown.
- **`limen demo` CLI** — one command, full x402 round-trip against your running proxy. `--dev` (no on-chain) and `--submit` (real testnet).
- **MIT license. Open source. No account required.**

## Known gaps

Honesty over polish. Production users should know:

- **Solana SPL verification is coded but not yet validated end-to-end on devnet.** Only Base / Base Sepolia have live proof.
- **Coinbase facilitator mode** is wired but has not been tested against the live `x402.org/facilitator`. Direct-RPC mode is the validated path.
- **Python SDK** mirrors the Node SDK API; first-boot tests pass (34/34) but no integration tests against a live chain yet.
- **Audit log shipper, refund flow, DSR (GDPR) redact/export, evidence ZIP export** — endpoint contracts exist; worker logic is TODO.
- **Dashboard auth** is unauthenticated in local dev (`LIMEN_API_AUTH=on` flips it back on; the SIWE/SIWS login flow is stubbed).
- **Smart contracts** (`contracts/base/LimenReceipts.sol`) — Foundry libraries not vendored; run `forge install foundry-rs/forge-std openzeppelin/openzeppelin-contracts` before `forge build`. No audit, no deployment.
- **Public directory** submission requires a wallet-signed challenge that isn't wired yet.
- **CI workflows** exist but haven't been triggered against a real org / repo (needs `NPM_TOKEN` / `PYPI_TOKEN` / `GHCR` secrets).
- **Demo is currently self-pay** — no end-to-end proof of stranger-pays-operator. Roadmap item before public beta.

Roadmap: [docs/roadmap.md](./docs/roadmap.md).

---

## The mark

Two horizontal beams stacked vertically with a generous gap between them.

The top beam is the **lintel**. The bottom block is the **paid domain**. The gap between them is the **limen** — the moment of crossing. The mark draws a doorway without drawing a doorway. The negative space carries the meaning.

Full brand story: [docs/brand/STORY.md](./docs/brand/STORY.md).

---

## Repository layout

```
limen/
├── packages/
│   ├── limen-node/             # @limen/node — TypeScript SDK + proxy + CLI
│   └── limen-python/           # limen — Python SDK + proxy + CLI
├── apps/
│   ├── dashboard/              # React + Vite operator console
│   └── api/                    # Hono API: dashboard, ingest, directory, webhooks
├── contracts/
│   ├── base/                   # Optional on-chain receipt (Solidity, Foundry)
│   └── solana/                 # Optional Solana programs (Anchor — placeholder)
├── examples/
│   ├── express-api/
│   ├── fastapi-api/
│   ├── nextjs-api/
│   ├── hono-api/
│   ├── solana-rpc-gateway/
│   ├── python-flask/
│   └── django-drf/
├── docs/
│   ├── brand/STORY.md          # name, mark, voice, palette
│   ├── architecture.md
│   ├── security.md
│   ├── compliance.md
│   ├── solana.md
│   ├── base.md
│   ├── payment-flow.md
│   └── ...
├── AGENTS.md                   # how AI coding agents should consume this repo
├── docs/llms.txt               # machine-readable docs index
├── docs/llms-full.txt          # flattened knowledge for RAG
└── SECURITY.md                 # private disclosure policy
```

---

## Security posture

- **Private key isolation.** Limen never sees operator private keys. Receiving wallets are public addresses only.
- **Constant-time cryptography.** Signature verification uses audited libraries (`viem` for EIP-3009/712, `@solana/web3.js` + `tweetnacl` for ed25519). No homemade crypto.
- **Replay resistance.** Payment authorizations bound to `(nonce, recipient, amount, chain, ttl)`; nonces consumed one-shot via Redis `SET NX`.
- **Hash-chained audit log** — append-only, each row bound to the previous via SHA-256. Tamper-evident on replay.
- **Webhook signing** — `X-Limen-Signature: t=<unix>,v1=<hex>` over `${t}.<raw_body>`, HMAC-SHA256, secret rotates with 10-minute overlap.
- **Responsible disclosure** — see [SECURITY.md](./SECURITY.md).

The nine invariants the code enforces are documented in [docs/security.md](./docs/security.md). **No external security audit yet — scheduled before v1.0, not alpha.**

---

## Compliance posture

Designed so operators can meet their own compliance obligations. Limen is infrastructure, not a custodian.

- **USDC** is issued by Circle, a regulated US money transmitter. Sanctions screening hooks exist; live integration with Circle's API is coded but not yet validated end-to-end.
- **GDPR** — wallet addresses are pseudonymous. The DSR redact endpoint exists at the route level; service implementation is TODO.
- **MiCA / travel rule** — threshold export + signed-JSON hooks documented; full TRISA/IVMS-101 vendor integration is the operator's call.
- **SOC 2 path** — hash-chained audit log is live; nightly S3/GCS shipper + evidence ZIP are TODO.

Full write-up: [docs/compliance.md](./docs/compliance.md). Nothing here is a compliance guarantee — work with your counsel.

---

## Chain + asset matrix

| Chain | Asset | Contract | Confirmations | Latency | Notes |
|---|---|---|---|---|---|
| Base mainnet | USDC | `0x8335…2913` | 2 | ~4 s | Default. Pay-per-call sweet spot. |
| Base Sepolia | USDC | `0x036C…CF7e` | 1 | ~2 s | Testnet — validated path. |
| Solana mainnet | USDC | `EPjF…Dt1v` | `confirmed` | ~400 ms | Lowest cost; micropayments. |
| Solana devnet | USDC | `4zMM…ncDU` | `confirmed` | ~400 ms | Testnet — verification coded, devnet round-trip pending. |
| Tempo (planned) | USDC | TBA | TBA | TBA | Ships once mainnet stable. |

---

## Docs

- **[Brand story](./docs/brand/STORY.md)** — name, mark, voice, palette.
- **[Getting started](./docs/getting-started.md)** — five-minute setup.
- **[Architecture](./docs/architecture.md)** — components, data flow, deployment topologies.
- **[Payment flow](./docs/payment-flow.md)** — x402 handshake, end-to-end.
- **[Security](./docs/security.md)** — threat model, invariants, audit plan.
- **[Compliance](./docs/compliance.md)** — OFAC, MiCA, GDPR, SOC 2 evidence.
- **[Solana integration](./docs/solana.md)** — SPL verification, finality, priority fees, ALTs.
- **[Base integration](./docs/base.md)** — EIP-3009, permit2, USDC transfer verification.
- **[Scaling](./docs/scaling.md)** — horizontal scale, Redis sharding, RPC failover.
- **[Monitoring](./docs/monitoring.md)** — OTel, Prometheus, SLOs, runbooks.
- **[Error handling](./docs/error-handling.md)** — taxonomy + retry policies.
- **[API reference](./docs/api-reference.md)** — REST, WebSocket, CLI.
- **[Deployment](./docs/deployment.md)** — Fly, Render, Railway, ECS, Kubernetes.
- **[For LLMs / coding agents](./AGENTS.md)** — how AI coding agents should consume Limen.

---

## Contributing

Fixes welcome. New middleware adapters (Koa, Elysia, Axum), new chain backends (Polygon, Arbitrum), and example apps especially welcome.

```bash
git clone https://github.com/dhruvalgupta2003/limen.git
cd limen
pnpm install
pnpm test
```

See [CONTRIBUTING.md](./CONTRIBUTING.md).

---

## License

MIT — see [LICENSE](./LICENSE). The proxy and SDKs are permanently open source. The hosted dashboard and directory will be available under a commercial SaaS model (optional, not required to self-host).

---

<p align="center">
  <sub>The threshold for the agent economy. Built for machines. Governed by humans.</sub>
</p>
