# Scaling

PayGate is stateless at the request tier and scales horizontally. This doc
is the operator-oriented guide: how big can it get, where it breaks, and
how to tune each layer.

---

## Capacity (single node)

Measured on a 4 vCPU / 8 GB instance running `paygate-proxy` v0.1 against
Base mainnet with facilitator mode:

| Request type | p50 latency | p99 latency | RPS sustained |
|--------------|-------------|-------------|---------------|
| Cache hit (cached paid response) | 3 ms | 18 ms | 8,000 |
| Fresh 402 handshake | 6 ms | 22 ms | 6,000 |
| Facilitator settle | 180 ms | 320 ms | 1,800 |
| Direct settle (Base, 2 conf) | 4,200 ms | 6,100 ms | 600 |
| Direct settle (Solana, confirmed) | 420 ms | 780 ms | 1,200 |

Bottlenecks (in order):

1. RPC / facilitator latency dominates p99.
2. Redis round-trip for replay + rate limit (add pipelining when > 1 kRPS).
3. Postgres write throughput for analytics (we buffer + COPY).

---

## Horizontal scaling

PayGate is share-nothing. Scale out until your Redis or Postgres is the
bottleneck. Recommended topology at each tier:

| RPS tier | Proxy nodes | Redis | Postgres |
|----------|-------------|-------|----------|
| < 500 | 1–2 | single node (m6g.large) | single primary |
| 500–3,000 | 3–6 | single node + HA replica | primary + 1 read replica |
| 3,000–10,000 | 8–20 | Redis cluster ≥ 3 shards | primary + 2 read replicas; partition `transactions` by month |
| 10,000+ | sharded per project | Redis cluster ≥ 6 shards; consistent-hash by wallet | separate Postgres per region; CDC into a warehouse |

Autoscaling triggers (Kubernetes HPA):

- CPU > 70% for 2 min → scale up.
- `paygate_verify_queue_depth` > 64 → scale up.
- Sustained p99 latency > 800 ms for 3 min → page.

---

## Redis guidance

- Replay nonces and rate-limit buckets should live on the **same** Redis to
  share a single round-trip in a Lua script.
- On cluster: route keys by `{wallet_address}` hash tag so a single
  wallet's nonce + rate-limit buckets land on the same shard.
- Turn on `notify-keyspace-events Ex` to emit expiry events for
  observability (optional).
- Backup policy: RDB snapshot every 5 min to S3, AOF disabled for
  performance (we can rebuild from Postgres if Redis is lost entirely,
  accepting a brief replay window).

---

## Postgres guidance

- `transactions` table is the biggest. Partition by `observed_at` month.
- Use `BRIN` indexes on `observed_at` for cheap time-range scans; btree on
  `(project_id, endpoint_id)`.
- Analytics queries hit the read replica; writes hit primary.
- `audit_log` is append-only; don't add indexes beyond `(project_id, at)`
  — we want writes to be fast.

---

## RPC providers

Configure at least **two** per chain. We round-robin with health checks:

- Healthy: request count + latency moving averages.
- Unhealthy: mark on 429, 5xx, timeout. Cooldown 30 s. Exponential
  backoff on repeated failures.
- Metric: `paygate_rpc_failures_total{provider,chain,status}`.

Recommended pairings:

- Base: Coinbase Cloud + Alchemy
- Solana: Helius + Triton One

Set per-provider budgets via `advanced.rpc_budget_daily_usd` to cap runaway
cost.

---

## Network path

- Terminate TLS at an L4/L7 LB (AWS ALB / Google HTTPS LB / Cloudflare).
- PayGate → Redis / Postgres over **private** network; no public egress
  from these ports.
- PayGate → RPC over HTTPS, pinned via
  `advanced.rpc_cert_fingerprints` if you want cert pinning.

---

## Keep-alive tuning

- Set upstream `keepAliveTimeout` higher than LB idle timeout (e.g. 65 s
  upstream vs 60 s LB) to avoid race conditions on connection close.
- `undici`'s `connections` pool defaults to 10; bump to 50+ for gateway
  deployments fronting many upstreams.

---

## Kubernetes defaults

- `resources.requests.cpu: 500m`, `memory: 512Mi`.
- `resources.limits.cpu: 2000m`, `memory: 1Gi`.
- `PodDisruptionBudget: minAvailable: 1` per deployment.
- `HPA: targetCPU=70%, minReplicas=2, maxReplicas=20`.
- `readinessProbe: /readyz` every 5 s.
- `livenessProbe: /livez` every 30 s, failureThreshold 3.

---

## Multi-region

- Keep replay nonces local to a region — cross-region Redis is too slow.
- Route wallet addresses consistent-hashed to a region; operate each
  region independently.
- Postgres writes can be regional (write-local) with logical replication
  into a global reporting cluster.
- Audit logs are replicated to a single global bucket for compliance.

---

## Backpressure

PayGate never drops silently. Backpressure signals:

- `429 RATE_LIMITED` when token bucket is empty.
- `503 SERVICE_DEGRADED` when Redis unhealthy and safe-mode engaged.
- `503 RPC_UNAVAILABLE` when all RPC providers failed for a chain.
- `Retry-After` header on all retryable responses.

Alerts:

- `paygate_http_5xx_total` rate > 1%/5 min → warning.
- `paygate_verify_failures_total{reason="rpc"}` rate > 1%/5 min → page.
- `paygate_rate_limit_drops_total` rate > 5%/5 min → capacity review.
