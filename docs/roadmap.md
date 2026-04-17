# Roadmap

Honest, running roadmap. Items marked **[landed]** are in `main`.

---

## v0.1 — alpha (now)

- [landed] x402 handshake (encode / decode)
- [landed] Chain adapters: Base, Base Sepolia, Solana, Solana devnet
- [landed] USDC verification (EIP-3009 + SPL TransferChecked)
- [landed] Replay guard + digest binding
- [landed] Rate limiter (Redis Lua + in-memory)
- [landed] Compliance screen (local blocklist + optional Circle API)
- [landed] Express / Fastify / Hono / Next.js middleware
- [landed] FastAPI / Flask / Django / Starlette middleware
- [landed] Standalone proxy + CLI
- [landed] Coinbase facilitator client
- [landed] Prometheus metrics + OTel tracing
- [landed] Hash-chained audit log
- [landed] Dashboard (overview, endpoints, transactions, settings)
- [landed] Admin API (Hono + Drizzle)
- [landed] Public directory (opt-in)
- [landed] Webhooks (HMAC-signed, Fibonacci retry)
- [landed] Optional on-chain receipts contract (Base)
- [landed] Docker images + Helm chart (sample)

## v0.2

- [ ] On-chain Solana program (Anchor) — receipts + escrow
- [ ] Edge runtime package (`@paygate/node-edge` for Cloudflare Workers, Vercel Edge)
- [ ] TypeScript client SDK for **agents** (sign + retry)
- [ ] Python client SDK for agents
- [ ] Rust agent SDK (no MSRV bump; built on alloy + solana-client)
- [ ] Surge pricing (per-header, per-query, per-time-of-day)
- [ ] Fee-split (percentage of incoming USDC auto-routed to a partner wallet)
- [ ] Improved directory (search, categories, uptime badges)
- [ ] Observability integrations (Sentry, Datadog, SigNoz plug-ins)

## v0.3

- [ ] Polygon (USDC, native)
- [ ] Arbitrum (USDC)
- [ ] Optimism (USDC)
- [ ] Subscription plans layered on top of per-call
- [ ] "Bring your own facilitator" interface for non-Coinbase
- [ ] gRPC streaming support (pay-per-message)
- [ ] WebSocket protocol (x402 over WS)

## v1.0

- [ ] Source-code + contract audits complete
- [ ] SOC 2 Type I report (hosted service)
- [ ] Formal verification of replay-guard + verify logic (TLA+ spec)
- [ ] Stable config schema; no breaking changes without migrations

## Research

- [ ] Zero-knowledge receipts for privacy-preserving analytics
- [ ] Threshold signatures for high-availability facilitators
- [ ] Tempo chain support (once mainnet stable)
- [ ] Multi-party settlement (escrow of complex flows across agents)

---

If you'd like a roadmap item prioritised, open an issue with the tag
`roadmap-vote` and we'll reshuffle based on community signal.
