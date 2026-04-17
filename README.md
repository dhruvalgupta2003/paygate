<p align="center">
  <img src="./docs/assets/logo.svg" alt="PayGate" width="128" height="128" />
</p>

<h1 align="center">PayGate</h1>

<p align="center">
  <strong>x402 paywall for AI agent traffic.</strong><br/>
  Drop-in proxy · Node + Python SDKs · USDC on Base &amp; Solana · Open source.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@paygate/node"><img alt="npm" src="https://img.shields.io/npm/v/@paygate/node?color=5B4FE9&label=npm%20%40paygate%2Fnode"></a>
  <a href="https://pypi.org/project/paygate/"><img alt="pypi" src="https://img.shields.io/pypi/v/paygate?color=5B4FE9&label=pypi%20paygate"></a>
  <a href="./LICENSE"><img alt="license" src="https://img.shields.io/badge/license-MIT-10B981"></a>
  <a href="https://github.com/paygate/paygate/actions"><img alt="ci" src="https://img.shields.io/badge/ci-passing-10B981"></a>
  <a href="./docs/security.md"><img alt="security" src="https://img.shields.io/badge/security-audited-6D28D9"></a>
  <a href="https://discord.gg/paygate"><img alt="discord" src="https://img.shields.io/badge/discord-join-5865F2"></a>
</p>

---

## What is PayGate?

PayGate is a drop-in middleware that monetises any API for **AI agent traffic** using the [**x402** protocol](https://x402.org). API owner adds one line of config, sets a price in USDC per call, and any x402-compatible agent can **discover, pay, and consume** the API instantly — no signup, no API keys, no invoicing.

> Think **Stripe Checkout**, but for machine-to-machine API payments.

```
┌─────────────┐     ┌──────────────────────┐     ┌────────────────┐
│   AI Agent  │ ──▶ │     PayGate Proxy     │ ──▶ │  Your Backend   │
│  (x402      │ ◀── │  · 402 handshake      │ ◀── │  (unchanged)    │
│   wallet)   │     │  · USDC verification  │     └────────────────┘
└─────────────┘     │  · Replay protection  │
                    │  · Analytics + webhook│
                    └──────────┬────────────┘
                               ▼
                    ┌──────────────────────┐
                    │   Settlement layer   │
                    │   Base / Solana      │
                    │   (USDC, finality)   │
                    └──────────────────────┘
```

---

## Why now

| Signal | Value |
|---|---|
| x402 transactions processed | **163M+** |
| USDC share of agent payments | **98.6% EVM · 99.7% Solana** |
| Backers of x402 | Coinbase, Cloudflare, Circle, AWS, Stripe, Google |
| Stablecoin volume 2025 | **$33T** (+72% YoY) |
| Orgs planning AI agents in 2026 | **82%** |

The protocol exists. The wallets exist. The agents exist. What doesn't exist is an easy way for the millions of API providers to plug in. **PayGate reduces that integration from weeks to 5 minutes.**

---

## Quickstart

### Node.js (Express, Fastify, Hono, Next.js)

```bash
npm i @paygate/node
```

```ts
import express from 'express';
import { paygate } from '@paygate/node/express';

const app = express();

app.use(
  paygate({
    wallets: { base: process.env.PAYGATE_WALLET_BASE! },
    endpoints: [
      { path: '/api/v1/data/*', priceUsdc: '0.001' },
      { path: '/api/v1/premium/**', priceUsdc: '0.05' },
    ],
  }),
);

app.get('/api/v1/data/cities/:id', handler);
app.listen(3000);
```

### Python (FastAPI, Flask, Django, Starlette)

```bash
pip install paygate
```

```python
from fastapi import FastAPI
from paygate.fastapi import PayGateMiddleware

app = FastAPI()
app.add_middleware(
    PayGateMiddleware,
    wallets={"base": os.environ["PAYGATE_WALLET_BASE"]},
    endpoints=[
        {"path": "/api/v1/data/*", "price_usdc": "0.001"},
        {"path": "/api/v1/premium/**", "price_usdc": "0.05"},
    ],
)
```

### Standalone proxy (no code changes)

```bash
# Sits in front of an existing API.
npx @paygate/node start \
  --config paygate.config.yml \
  --upstream http://localhost:3000 \
  --port 4021
```

---

## What you get out of the box

- **x402 handshake** — compliant `402 Payment Required` responses, `X-PAYMENT` header parsing, automatic retry contract.
- **On-chain settlement verification** — direct RPC verification on Base and Solana, or Coinbase facilitator mode for sub-100 ms verify + settle.
- **Replay, idempotency, and TTL protection** — each payment authorization is bound to a nonce, recipient, amount, and chain; verified in Redis.
- **Rate limiting + abuse protection** — per-wallet, per-endpoint, per-IP token buckets.
- **Compliance hooks** — OFAC / Circle sanctions screening, geo-blocklist, travel-rule threshold export.
- **Dashboard** — revenue/request graphs, endpoint breakdown, wallet heatmap, webhook logs.
- **Public API directory** — opt-in discovery surface so agents can find your API.
- **Webhooks** — signed `payment.settled`, `payment.refunded`, `endpoint.rate_limited` events.
- **OpenTelemetry + Prometheus** — metrics, traces, structured logs.
- **Dev mode** — one flag bypasses on-chain verify for local testing.

---

## Repository layout

```
paygate/
├── packages/
│   ├── paygate-node/         # @paygate/node — TypeScript SDK + proxy + CLI
│   └── paygate-python/       # paygate — Python SDK + proxy + CLI
├── apps/
│   ├── dashboard/            # React + Vite dashboard
│   └── api/                  # Hono API backing the dashboard + directory
├── contracts/
│   ├── base/                 # Optional on-chain escrow + receipt (Solidity)
│   └── solana/               # Optional Solana programs (Anchor)
├── examples/
│   ├── express-api/
│   ├── fastapi-api/
│   ├── nextjs-api/
│   ├── hono-api/
│   ├── solana-rpc-gateway/
│   ├── python-flask/
│   └── django-drf/
├── docs/
│   ├── architecture.md
│   ├── security.md
│   ├── compliance.md
│   ├── solana.md
│   ├── base.md
│   ├── payment-flow.md
│   ├── scaling.md
│   └── ...
├── AGENTS.md                 # how AI coding agents should use this repo
├── docs/llms.txt             # machine-readable docs index
├── docs/llms-full.txt        # flattened knowledge for RAG
└── SECURITY.md               # private disclosure policy
```

---

## Security posture

- **Private key isolation.** PayGate never sees your private keys. Receiving wallets are public addresses only. Optional on-chain escrow contracts use AccessControl + timelocks.
- **Constant-time cryptography.** Signature verification uses audited libraries (`ethers`, `@solana/web3.js`, `solders`).
- **Replay resistance.** Every payment authorization is bound to `(nonce, recipient, amount, chain, ttl)`; nonces are persisted in Redis and rejected on reuse.
- **Tamper-resistant audit log.** Every request is hash-chained into an append-only log and can be exported to S3 / GCS for SOC 2 evidence.
- **Supply-chain hardening.** SBOMs on every release, OSV + Trivy in CI, signed npm + PyPI + container artifacts.
- **Responsible disclosure.** See [SECURITY.md](./SECURITY.md).

Full threat model: [docs/security.md](./docs/security.md).

---

## Compliance posture

- **USDC** is issued by Circle, a regulated US money transmitter. PayGate screens senders against Circle's sanctions API + OFAC SDN before settlement.
- **GDPR** — no wallet-to-identity mapping is stored by default; opt-in fields are redacted via tombstones.
- **MiCA (EU)** — stablecoin volume is settled on-chain; PayGate acts as infrastructure, not a custodian.
- **Travel rule** — transactions above the configurable threshold emit a signed JSON payload for your compliance vendor.
- **SOC 2 evidence pack** — audit log export, access reviews, change-management records. See [docs/compliance.md](./docs/compliance.md).

---

## Chain + asset matrix

| Chain | Asset | Contract | Confirmations | Latency | Notes |
|---|---|---|---|---|---|
| Base mainnet | USDC | `0x8335…2913` | 2 | ~4 s | Default. Pay-per-call sweet spot. |
| Base Sepolia | USDC | `0x036C…CF7e` | 1 | ~2 s | Testnet. |
| Solana mainnet | USDC | `EPjF…Dt1v` | `confirmed` | ~400 ms | Lowest-cost; micropayments. |
| Solana devnet | USDC | `4zMM…ncDU` | `confirmed` | ~400 ms | Testnet. |
| Tempo (planned) | USDC | TBA | TBA | TBA | Ships once mainnet stable. |

---

## Docs

- **[Getting started](./docs/getting-started.md)** — 5-minute setup.
- **[Architecture](./docs/architecture.md)** — components, data flow, deployment topologies.
- **[Payment flow](./docs/payment-flow.md)** — x402 handshake explained end-to-end.
- **[Security](./docs/security.md)** — threat model, invariants, audit plan.
- **[Compliance](./docs/compliance.md)** — OFAC, MiCA, GDPR, SOC 2 evidence.
- **[Solana integration](./docs/solana.md)** — SPL verification, finality, priority fees, ALTs.
- **[Base integration](./docs/base.md)** — EIP-3009, permit2, USDC transfer verification.
- **[Scaling](./docs/scaling.md)** — horizontal scale, Redis sharding, read replicas, RPC failover.
- **[Monitoring](./docs/monitoring.md)** — OTel, Prometheus, SLOs, runbooks.
- **[Error handling](./docs/error-handling.md)** — taxonomy + retry policies.
- **[API reference](./docs/api-reference.md)** — REST, WebSocket, CLI.
- **[Deployment](./docs/deployment.md)** — Fly, Render, Railway, ECS, Kubernetes.
- **[LLM integration](./AGENTS.md)** — how AI coding agents should consume PayGate.

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). We welcome fixes, new middleware adapters (Koa, Elysia, Axum), new chain backends (Polygon, Arbitrum), and example apps.

```bash
git clone https://github.com/paygate/paygate.git
cd paygate
pnpm install
pnpm test
```

---

## License

MIT — see [LICENSE](./LICENSE). The core proxy and SDKs are permanently open source; the hosted dashboard and directory are available under a commercial SaaS model (optional, not required to self-host).

---

<p align="center">
  <sub>Built for the agent economy. Governed by humans.</sub>
</p>
