# Monitoring

Limen emits structured logs, Prometheus metrics, and OpenTelemetry traces
by default. This doc is the operator's guide to what's exported, what to
alert on, and the runbooks attached to each alert.

---

## Signals

| Signal | Emitter | Location |
|--------|---------|----------|
| Structured logs | `pino` (Node) / `structlog` (Python) | stdout, JSON, one event per line |
| Metrics | `prom-client` (Node) / `prometheus_client` (Python) | `:9464/metrics` |
| Traces | `@opentelemetry/api` / `opentelemetry` | OTLP over HTTP to `OTEL_EXPORTER_OTLP_ENDPOINT` |
| Audit log | proprietary | `./data/audit/*.ndjson`, also mirrored to Postgres |

---

## Log fields

Every log line includes:

```json
{
  "ts": "2026-04-17T12:00:00.123Z",
  "lvl": "info",
  "svc": "limen-proxy",
  "ver": "0.1.0",
  "reqId": "01J...",
  "traceId": "a1b2c3...",
  "spanId": "d4e5f6...",
  "chain": "base",
  "endpoint": "/api/v1/weather/*",
  "wallet": "0x1234…cdef",     // first 4 + last 4 only
  "nonce": "01J…",              // truncated to 8 chars
  "amount": "0.001",
  "outcome": "ok",
  "latencyMs": 182
}
```

Rules:

- No raw X-PAYMENT headers.
- No raw response bodies unless `advanced.log_bodies=true`.
- No private keys / receiving keys (we don't hold them; still — never logged).
- `logger.redact` must be used for any newly introduced sensitive field.

---

## Metrics (Prometheus)

| Metric | Type | Labels | Meaning |
|--------|------|--------|---------|
| `limen_requests_total` | counter | `outcome, endpoint, chain` | HTTP requests |
| `limen_http_duration_seconds` | histogram | `route, status` | End-to-end latency |
| `limen_verify_duration_seconds` | histogram | `chain, mode` | Chain verify latency |
| `limen_settle_duration_seconds` | histogram | `chain, mode` | Settle latency (facilitator or direct) |
| `limen_verify_failures_total` | counter | `chain, reason` | Verification failures by reason |
| `limen_replay_rejects_total` | counter | — | Replay attempts |
| `limen_rate_limit_drops_total` | counter | `scope` | Rate-limit drops |
| `limen_rpc_failures_total` | counter | `chain, provider, status` | RPC errors |
| `limen_cache_hits_total` | counter | `kind` | Cache hits |
| `limen_cache_misses_total` | counter | `kind` | Cache misses |
| `limen_upstream_duration_seconds` | histogram | `endpoint, status` | Upstream latency |
| `limen_upstream_failures_total` | counter | `endpoint, status` | Upstream errors |
| `limen_audit_write_failures_total` | counter | — | Audit log write failures |
| `limen_webhook_delivery_seconds` | histogram | `event` | Webhook delivery latency |
| `limen_webhook_delivery_failures_total` | counter | `event, status` | Webhook failures |
| `limen_directory_submissions_total` | counter | — | Public directory submissions |
| `limen_build_info` | gauge | `version, commit, build_time` | Deployment version |

Runtime metrics (process + node defaults) are also exported:
`process_cpu_seconds_total`, `nodejs_heap_size_used_bytes`, etc.

---

## Traces (OTel)

Top-level spans:

- `limen.handshake` — 402 generation or auth decoding.
- `limen.verify` — per-chain verification.
- `limen.settle` — facilitator or direct RPC submission.
- `limen.upstream` — forwarded request to the upstream API.
- `limen.compliance` — sanctions + geo checks.
- `limen.replay_guard` — Redis nonce operations.
- `limen.analytics_write` — background ingest.

Attributes always include: `limen.chain`, `limen.endpoint`,
`limen.outcome`, and `limen.amount_micros` for settlement spans.

---

## SLOs

| SLO | Target | Error budget (30d) |
|-----|--------|--------------------|
| Availability (HTTP 2xx/3xx/402/429 / total) | 99.9% | 43 min |
| p99 verify latency (Base, facilitator) | ≤ 250 ms | 5% above target |
| p99 verify latency (Solana, confirmed) | ≤ 800 ms | 5% above target |
| Audit log write success | 99.999% | 26 s |

---

## Alerts

| Alert | Fires when | Severity | Action |
|-------|-----------|----------|--------|
| `ProxyDown` | `up{job="limen-proxy"} == 0` for 2 min | page | [runbook](./runbooks/proxy-down.md) |
| `High5xxRate` | `rate(limen_http_duration_seconds_count{status=~"5.."}[5m]) / rate(limen_http_duration_seconds_count[5m]) > 0.02` | page | [runbook](./runbooks/high-5xx.md) |
| `RPCUnavailable` | `rate(limen_rpc_failures_total[5m]) > 0.05` for 3 min | page | [runbook](./runbooks/rpc-unavailable.md) |
| `VerifyLatencyP99High` | p99 `limen_verify_duration_seconds` > SLO for 10 min | warn | [runbook](./runbooks/verify-slow.md) |
| `ReplayAttemptSpike` | `rate(limen_replay_rejects_total[5m]) > 1/s` | warn | possible abuse; review traffic |
| `AuditWriteFailure` | `rate(limen_audit_write_failures_total[5m]) > 0` | page | disk / buffer issue |
| `FacilitatorFailoverActive` | `limen_facilitator_failover_active == 1` for 5 min | warn | watch capacity |
| `BalanceLow` | receiving wallet balance < threshold | warn | operator-specific |

---

## Runbook stubs

Located under `docs/runbooks/`. Each follows a consistent format:

```
## Symptom
## Impact
## Diagnosis
## Immediate mitigation
## Root cause investigation
## Long-term fix
```

---

## Dashboards

- `dashboards/limen-overview.json` — Grafana dashboard, per-chain rollup.
- `dashboards/limen-endpoints.json` — per-endpoint latency + revenue.
- `dashboards/limen-rpc.json` — RPC provider health.
- `dashboards/limen-compliance.json` — sanctions / geo / rate-limit hits.

Import into Grafana: `grafana-cli --pluginUrl <path>` or use the JSON
directly.

---

## On-call checklist

At the start of a shift:

1. Check the overview dashboard for any anomaly over the last 24 h.
2. Verify each RPC provider is healthy (green in `limen-rpc`).
3. Verify the facilitator is reachable (`curl https://x402.org/facilitator/health`).
4. Verify audit log ship is caught up (`limen audit tail --since 5m`).
5. Confirm no open SEV-2+ incidents in the tracker.
