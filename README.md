<p align="center">
  <img src="./docs/assets/logo.svg" alt="PayGate" width="128" height="128" />
</p>

<h1 align="center">PayGate</h1>

<p align="center">
  <strong>x402 paywall for AI agent traffic.</strong><br/>
  Drop-in proxy · Node + Python SDKs · USDC on Base &amp; Solana · Open source.
</p>

<p align="center">
  <a href="./LICENSE"><img alt="license" src="https://img.shields.io/badge/license-MIT-10B981"></a>
  <img alt="status" src="https://img.shields.io/badge/status-developer%20alpha-F59E0B">
  <img alt="chain" src="https://img.shields.io/badge/base--sepolia-verified-10B981">
</p>

> **Alpha notice.** This is a public developer alpha. The core x402 handshake works end-to-end on Base Sepolia (verified with real USDC settlements — see [docs/testnet-demo.md](./docs/testnet-demo.md)). Many adjacent features are documented but not fully wired yet — see [What works today](#what-works-today) and [Known gaps](#known-gaps) below. Not production-ready.

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

## What works today

Real, demonstrable, unit-tested, and validated end-to-end on Base Sepolia:

- **x402 handshake** — compliant `402 Payment Required` responses, `X-PAYMENT` header parsing, retry contract. 32/32 unit tests green.
- **Real on-chain settlement verification on Base Sepolia** — agent signs EIP-3009, submits `transferWithAuthorization`, proxy verifies the Transfer event matches amount/from/to, forwards to upstream. Round-trip in ~5s, gas cost ~$0.0001. Receipts linkable on [sepolia.basescan.org](https://sepolia.basescan.org).
- **Replay + TTL protection** — server-issued nonce bound to a canonical-JSON digest of the PaymentRequirements. Reuse → `NONCE_REUSED`. Expired → `EXPIRED_AUTHORIZATION`. In-memory + Redis-backed stores.
- **Rate limiting** — token bucket by wallet/ip/endpoint scope. Redis Lua script for atomic ops.
- **Dashboard live against real data** — React + Vite + Tailwind. Overview, Transactions, Endpoints, Agents, Compliance, Webhooks all query a real Postgres via the admin API. Dark-mode bento layout. Runs in ~90 seconds from clone.
- **Backend API** — Hono + Drizzle + Postgres. Ingest endpoint lets the proxy POST settlements automatically; dashboard reflects them in <500 ms. Bearer-token auth for server-to-server.
- **`paygate demo` CLI** — one command, fires a full x402 round-trip against your running proxy. Supports `--dev` (no on-chain) and `--submit` (real testnet).
- **MIT license, open source, no account required.**

## Known gaps

Be honest about what's stubbed or deferred. Production users should know:

- **Solana SPL verification is coded but not yet validated end-to-end on devnet.** Only Base / Base Sepolia have live proof.
- **Coinbase facilitator mode** is wired, the client exists, but has not been tested against the live `x402.org/facilitator`. Direct-RPC mode is the validated path.
- **Python SDK** (`paygate` on PyPI) is coded and mirrors the Node SDK API, but has not been built or tested on a clean machine yet. Expect first-boot fixes.
- **Webhook delivery worker**, **audit log shipper**, **refund flow**, **DSR (GDPR) redact/export**, **evidence ZIP export** — endpoint contracts exist, worker logic is TODO.
- **Dashboard auth** is unauthenticated in local dev (`PAYGATE_API_AUTH=on` flips it back on, but the SIWE/SIWS login flow itself is stubbed).
- **Smart contracts** (`contracts/base/PayGateReceipts.sol`) compile but have not been audited or deployed.
- **Public directory** submission requires a wallet-signed challenge that isn't wired yet.
- **CI workflows** exist but haven't been triggered against the real org / repo (needs NPM_TOKEN / PYPI / GHCR secrets).

Roadmap + what shipping in public beta unlocks: [docs/roadmap.md](./docs/roadmap.md).

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

- **Private key isolation.** PayGate never sees operator private keys. Receiving wallets are public addresses only.
- **Constant-time cryptography.** Signature verification uses audited libraries (`viem` for EIP-3009/712, `@solana/web3.js` + `tweetnacl` for ed25519). We don't roll our own crypto.
- **Replay resistance.** Payment authorizations are bound to `(nonce, recipient, amount, chain, ttl)`; nonces are consumed one-shot via Redis `SET NX`.
- **Hash-chained audit log** — append-only, each row bound to the previous via SHA-256. Tamper-evident on replay.
- **Responsible disclosure.** See [SECURITY.md](./SECURITY.md).

The nine explicit invariants the code enforces are documented in [docs/security.md](./docs/security.md). **No external security audit has been completed yet — that's scheduled before v1.0, not alpha.**

---

## Compliance posture

Designed for operators to meet their own compliance obligations. PayGate itself is infrastructure, not a custodian.

- **USDC** is issued by Circle, a regulated US money transmitter. Compliance screening hooks exist; Circle sanctions API integration is coded but not yet end-to-end validated against Circle's live response.
- **GDPR** — wallet addresses are pseudonymous; the DSR redact endpoint exists at the route level but the service implementation is TODO.
- **MiCA (EU) / travel rule** — threshold export + signed-JSON hooks are documented; full integration with a TRISA/IVMS-101 vendor is up to the operator.
- **SOC 2 path** — the hash-chained audit log is live; S3/GCS nightly shipper + formal evidence ZIP are TODO.

Full write-up: [docs/compliance.md](./docs/compliance.md). Nothing here should be read as a compliance guarantee — work with your counsel.

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
git clone https://github.com/dhruvalgupta2003/paygate.git
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
