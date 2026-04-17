# FAQ

---

### Do agents need to sign up?

No. Agents identify themselves by wallet. No accounts, no API keys.

### Does PayGate hold my funds?

No. You specify a receiving wallet; settlements go directly from agent
to your wallet. PayGate only sees the transaction metadata it needs to
verify.

### Does PayGate take a cut?

The open-source SDK and proxy take **zero fees**. The hosted service at
`paygate.dev` charges 1.5% on processed volume for managed analytics,
directory ranking, and customer support. Self-hosting is free forever.

### Which stablecoins?

USDC only in v0.x. USDC represents ≥ 98% of x402 volume and is the only
stable that has both a regulated EU issuer (Circle EU) and Base/Solana
native mint. USDT, DAI, FRAX, and USDe are on the v0.3 roadmap.

### Does it work with any agent framework?

Yes. x402 is an HTTP protocol; any agent that can set an
`X-PAYMENT` header can use PayGate. We publish client SDKs for
TypeScript, Python, and Rust on the v0.2 roadmap; agents can hand-roll
today with `@coinbase/x402` or similar.

### What about GDPR / "right to be forgotten"?

Wallet addresses are pseudonymous. If a wallet is linked to an
identifiable person and a DSR arrives, run `paygate dsr redact --wallet
0x...`. See [compliance.md](./compliance.md) for details.

### What chains are supported?

Base, Base Sepolia, Solana, Solana devnet. Polygon / Arbitrum / Optimism
are on the v0.3 roadmap. Ethereum L1 is intentionally **not** on the
roadmap (gas is too high for agent micropayments).

### What happens if my upstream returns 5xx *after* the agent paid?

PayGate marks the transaction `upstream_failed` and emits a
`payment.upstream_failed` webhook. You decide whether to auto-refund via
`operators/<id>/auto_refund=true` or handle case-by-case.

### What happens during a chain reorg?

PayGate waits for `confirmations_base` blocks (default 2) before
acknowledging the settlement. If a reorg happens afterward, the
transaction is marked `reorged`, and a `payment.reorged` webhook fires.
Practically speaking, reorgs on Base are rare after 2 blocks, and
Solana's consensus makes post-`confirmed` reorgs effectively impossible.

### What if Coinbase's facilitator is down?

PayGate automatically fails over to direct RPC verification for the
configured window (`advanced.facilitator_failover_seconds`, default
5 min). See [RFC-0001](./rfcs/RFC-0001-facilitator-failover.md).

### Can I run PayGate behind Cloudflare?

Yes. Set `advanced.trust_proxy: true`. We honour
`X-Forwarded-For` + `Forwarded` headers for IP-scoped rate limits.

### How big can PayGate get on a single node?

See [scaling.md](./scaling.md). 6k RPS steady state on 4 vCPU. Beyond
that, scale horizontally; the proxy is stateless.

### Is it safe to run on the public internet?

Yes. HTTPS, strict security headers, nonce-based CSP, CORS allowlist,
rate limits, compliance screen. See [security.md](./security.md).

### How much does it cost me to run?

One small VM + Redis + (optionally) Postgres. At typical traffic, < $20/mo
on any hyperscaler.

### Will my pricing be public?

If you opt into the directory, yes (the price ranges are shown to
agents). You can keep prices private by keeping `discovery.listed:
false`. Internal APIs never appear in the directory.

### How do I refund a specific transaction?

See [guides/refund-upstream-failure.md](./guides/refund-upstream-failure.md).
Short version: `POST /v1/refunds` with `tx_hash + reason`, send USDC
back, then `POST /v1/refunds/:id/confirm`.

### Can I self-host the dashboard?

Yes. It's a static React app in `apps/dashboard/`; serve it anywhere
behind a private subdomain and point it at your API via `VITE_API_URL`.

### What's the licence?

MIT for the SDKs, proxy, dashboard, and examples. Smart contracts are
MIT. The brand assets are "non-commercial use" — you can ship them
unmodified alongside PayGate; ask us before using the logo in a product
you're building.
