# Architecture

PayGate is designed to be **stateless at the request layer, durable at the
analytics layer, and pluggable at the chain layer**. This doc explains how
the pieces fit together and the tradeoffs we've made.

---

## Layers

```
┌────────────────────────────────────────────────────────────────────────┐
│                              Client (agent)                             │
└────────────────────────────────────────────────────────────────────────┘
                                   │  HTTP/1.1 or HTTP/2
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                          PayGate Proxy Layer (L7)                       │
│                                                                        │
│   Listener (Hono/Fastify, H2/HTTPS, keep-alive)                        │
│     │                                                                  │
│     ├─▶ Config matcher  (first-match glob + method + headers)          │
│     │                                                                  │
│     ├─▶ Auth gate       (dashboard/internal routes only)               │
│     │                                                                  │
│     ├─▶ Rate limiter    (Redis token bucket, scoped)                   │
│     │                                                                  │
│     ├─▶ Cache read      (Redis/in-memory, keyed by endpoint+query)     │
│     │                                                                  │
│     ├─▶ x402 handshake                                                 │
│     │      ├─▶ Issue 402 if no payment                                 │
│     │      ├─▶ Parse X-PAYMENT header                                  │
│     │      └─▶ Validate schema                                         │
│     │                                                                  │
│     ├─▶ Replay guard    (Redis SET NX nonce, TTL)                      │
│     │                                                                  │
│     ├─▶ Compliance      (sanctions + geo)                              │
│     │                                                                  │
│     ├─▶ Chain verifier  (Base/Solana/…)                                │
│     │      ├─▶ Facilitator client (Coinbase)                           │
│     │      └─▶ Direct RPC client                                       │
│     │                                                                  │
│     ├─▶ Upstream call   (undici HTTP client, timeout, abort)           │
│     │                                                                  │
│     ├─▶ Cache write                                                    │
│     │                                                                  │
│     └─▶ Analytics tap   (NDJSON → Postgres via queue)                  │
└────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                           Upstream service (yours)                      │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Deployment topologies

### 1. Library middleware (lowest friction)

```
Agent ── HTTPS ──▶ [your-api  (Express/Fastify/Hono/FastAPI)]
                          │
                          ▼
                  paygate middleware
                          │
                          ▼
                     your route handler
```

- Drop-in inside the API process.
- Zero additional infrastructure.
- State (Redis) is still required for replay protection in multi-instance
  deployments.

### 2. Sidecar proxy

```
Agent ── HTTPS ──▶ [paygate  :4021] ── HTTP ──▶ [your-api  :3000]
                        │
                   Redis + PG
```

- PayGate runs alongside the service (same pod / box).
- The upstream never sees unpaid traffic.
- Recommended for most production deployments.

### 3. Gateway proxy

```
Agent ── HTTPS ──▶ [paygate gateway] ──▶ service-a
                       │              ──▶ service-b
                       │              ──▶ service-c
                   Redis + PG
```

- PayGate fronts many services with distinct configs.
- Suitable for hosted offerings or internal platforms.

### 4. Managed (paygate.dev)

- We host the proxy. You point DNS. Traffic terminates at our edge and is
  forwarded to your origin over mTLS.
- Only use the managed service if you accept our data-processing addendum.

---

## Component responsibilities

### Listener

- HTTPS by default, automatic HTTP/2.
- Reject requests > `advanced.max_request_body_mb`.
- `trust_proxy` mode honours `X-Forwarded-For` + `Forwarded` headers.
- Request ID middleware issues a monotonic ULID per connection.

### Config matcher

- Compiled from `paygate.config.yml` at boot.
- Uses a radix trie for O(log n) prefix matches, then checks globs.
- First match wins; later matches are irrelevant.

### Rate limiter

- Token bucket per scope: `{wallet, ip, endpoint, global}`.
- Redis lua script refills atomically.
- On Redis outage: fail-open for 30 s with an alert, then fail-closed.

### Cache

- Keyed by `hash(method + normalized(url) + body_digest + content_type)`.
- Response is serialised with status, headers (allowlist), body.
- Never caches 5xx or responses > 1 MB by default.

### x402 handshake

- 402 response includes `PaymentRequirements` body + an `x402-version` header.
- Server canonicalises the requirements, computes a SHA-256 digest, and
  issues a nonce bound to the digest. This prevents an agent from lying
  about the requirements it paid against.

### Replay guard

- Redis: `SET paygate:nonce:{nonce} "" NX EX {ttl}`.
- Return value 1 → nonce fresh, proceed.
- Return value 0 → nonce reused, reject with `NONCE_REUSED`.
- Nonce TTL = `payment_ttl_seconds + 60 s` buffer.

### Chain verifier

Each chain implements the `ChainAdapter` interface:

```ts
interface ChainAdapter {
  readonly id: 'base' | 'base-sepolia' | 'solana' | 'solana-devnet';
  buildPaymentRequirements(spec: PriceSpec, opts: RequirementOpts): PaymentRequirements;
  verifyPayment(req: PaymentRequirements, xPayment: string): Promise<VerifyResult>;
  confirmPayment(proof: SettlementProof): Promise<ConfirmationResult>;
}
```

Two strategies:

- **Facilitator** — hit `POST {facilitator}/verify` then `/settle`. Fast, zero
  RPC cost, trust boundary includes Coinbase.
- **Direct** — ask the RPC for the transaction + receipt, verify on-chain
  state matches the spec. Slower, higher RPC cost, smaller trust boundary.

### Analytics tap

- In-process ring buffer that drains every 500 ms to Postgres via batch
  `COPY`.
- Also writes to a local append-only log (hash-chained) for audit.
- Loss budget: ≤ 0.01% under extreme load.

---

## Data model (Postgres)

Tables (simplified — migrations in `apps/api/migrations/`):

- `projects(id, slug, name, owner, created_at)`
- `endpoints(id, project_id, path_glob, method, price_usdc_micros, tags[])`
- `transactions(id, project_id, endpoint_id, chain, tx_hash, block_or_slot,
  amount_usdc_micros, from_wallet, to_wallet, nonce, status, settled_at,
  observed_at)`
- `rate_limit_events(id, project_id, scope, key_hash, at)`
- `compliance_events(id, project_id, kind, detail_jsonb, at)`
- `webhook_deliveries(id, project_id, event, url, status, attempt,
  response_code, delivered_at)`
- `audit_log(id, project_id, actor, action, target, meta_jsonb, chain_hash,
  at)` — append-only, `chain_hash = SHA-256(prev || serialize(row))`.

Read replicas serve the dashboard; writes go to the primary.

---

## Request lifecycle (happy path)

1. Agent: `GET /api/v1/weather/sf`.
2. Matcher → `endpoint_id=42`, `price=1000 micros USDC`.
3. No `X-PAYMENT` header → issue 402 with `PaymentRequirements`. Persist
   `(nonce, digest, endpoint_id)` in Redis with TTL 305 s.
4. Agent: `GET /api/v1/weather/sf` with `X-PAYMENT: <b64>`.
5. Matcher (unchanged) → same endpoint.
6. Decode `X-PAYMENT`, verify it matches stored digest.
7. Rate-limit bucket check for wallet.
8. Replay guard (SET NX) → 1 (fresh).
9. Compliance check: sanctions + geo.
10. Verifier → settlement confirmed on chain.
11. Upstream call with original headers/body.
12. Response returned with `X-PAYMENT-RESPONSE: <receipt>`.
13. Analytics: row written to `transactions`, hash-chained audit entry.

---

## Failure-handling decisions

- **Redis unreachable** → fail-open for rate limiter (30 s max), fail-closed
  for replay guard (returns 503 with `SERVICE_DEGRADED`). Rationale: losing
  rate limits briefly is recoverable, losing replay protection is not.
- **Postgres unreachable** → analytics buffer overflows to disk NDJSON; when
  Postgres returns, drainer catches up.
- **RPC flapping** → multi-provider client with weighted round-robin + cool-
  down. Priority fees bumped by chain-specific ramp.
- **Facilitator 5xx** → auto-failover to direct RPC mode for the next
  `advanced.facilitator_failover_seconds`. Emits `facilitator_failover` metric.

---

## Hot paths

- **Verification** — p99 ≤ 250 ms goal. Most work is off the request hot path
  (RPC). Caches the last-block number per chain to avoid extra RPC calls.
- **Upstream forwarding** — uses `undici` agent with a pool of keep-alive
  connections. Body streaming is pass-through; we never buffer.

---

## Security boundaries

- The proxy **never** holds private keys.
- The dashboard backend **never** accepts cleartext receiving wallets from
  users; it accepts signed attestations (wallet signs a challenge, we verify).
- Webhook signatures are HMAC-SHA256 over the raw body, header:
  `X-PayGate-Signature: t=…,v1=…`.
- Admin API requires either a session JWT (dashboard) or a signed request
  (`X-PayGate-Admin`: `ed25519:<pubkey>:<sig>`).

---

## Known limitations (by design)

- USDC only in v0.x. Any stable can be added; USDC is 98%+ of volume.
- No built-in subscription pricing — x402 is pay-per-call by nature. For
  monthly plans, layer PayGate under a token-gated API.
- Single-region deployments should be fine up to ~10k RPS. Multi-region
  requires pinning the rate-limit Redis to a region per wallet shard.

See [docs/scaling.md](./scaling.md) for numbers, benchmarks, and tuning.
