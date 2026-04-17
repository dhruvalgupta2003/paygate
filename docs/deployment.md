# Deployment

PayGate runs anywhere Node 20+ or Python 3.11+ runs. This doc walks through
the common targets and the operational knobs that matter.

---

## Surfaces to deploy

| Surface | Required? | Description |
|---------|-----------|-------------|
| **Proxy** | Yes | The only thing that handles live traffic. |
| **Redis** | Yes | Replay nonces + rate limits. |
| **Postgres** | Optional | Analytics + audit. Recommended. |
| **API + Dashboard** | Optional | Only if you want the web UI / directory. |
| **Prometheus + OTel** | Optional | Strongly recommended in production. |

---

## One-click targets

### Fly.io

```bash
fly launch --copy-config --image ghcr.io/paygate/proxy:latest
fly secrets set \
  PAYGATE_WALLET_BASE=0x... \
  PAYGATE_REDIS_URL=rediss://... \
  PAYGATE_BASE_RPC_URL=https://...
```

`fly.toml` sample lives in `deploy/fly/`.

### Render.com

Web service → Docker → `ghcr.io/paygate/proxy:latest` →
set env vars → deploy.

### Railway

Deploy template:
`https://railway.app/template/paygate` (placeholder; update before release).

### AWS ECS / Fargate

- Task definition: 0.5 vCPU / 1 GB RAM baseline.
- ALB → target group on port 4021.
- Secrets from Secrets Manager.
- `awslogs` driver with JSON parsing.
- Autoscaling policy on CPU > 70%.

### Google Cloud Run

- Concurrency: 80.
- CPU always allocated: true (required for background audit flushes).
- Redis: Memorystore.
- Postgres: Cloud SQL, read replica.

---

## Kubernetes

### Helm

```bash
helm repo add paygate https://charts.paygate.dev
helm install paygate paygate/paygate \
  --namespace paygate --create-namespace \
  --set wallet.base=0x... \
  --set redis.url=redis://redis.infra:6379
```

The chart creates:

- Deployment + HPA for `paygate-proxy`.
- Deployment for `paygate-api`.
- StatefulSet for `paygate-dashboard` (static assets behind nginx).
- CronJob for `paygate-audit-ship` → S3.
- ServiceMonitor (Prometheus Operator) + PodDisruptionBudget.
- NetworkPolicy (only allows outbound to Redis / Postgres / RPC allowlist).

### Raw manifests

See `deploy/k8s/` for plain YAML.

---

## Secrets

Required:

- `PAYGATE_WALLET_BASE`, `PAYGATE_WALLET_SOLANA` — receiving addresses.
- `PAYGATE_ADMIN_SECRET` — for /admin endpoints.
- `PAYGATE_JWT_SECRET` — dashboard sessions.
- `PAYGATE_WEBHOOK_SIGNING_SECRET` — webhook HMAC.

Optional:

- `PAYGATE_FACILITATOR_API_KEY`, `PAYGATE_CIRCLE_API_KEY`,
  `SENTRY_DSN`, `OTEL_EXPORTER_OTLP_ENDPOINT`.

Generate:

```bash
openssl rand -base64 48
```

Store them in your platform's secret manager. Do not commit `.env`.

---

## TLS

- Terminate TLS at the LB (ALB, Cloud LB, Cloudflare).
- Enforce HTTPS-only via `ForwardedProto` + redirect rule.
- Use a ≥ 256-bit cipher suite (ECDHE-ECDSA + AES-GCM / CHACHA20-POLY1305).

---

## Health checks

| Path | Purpose | When it flips |
|------|---------|---------------|
| `/livez` | Process alive | Never for an in-memory stall; SIGTERM instead |
| `/readyz` | Serving traffic | `false` if Redis unreachable, RPC all failed, config not loaded |
| `/metrics` | Prometheus scrape | always on |

---

## Directory (public discovery)

- To publish your API into the PayGate directory, set
  `discovery.listed: true` in config.
- You'll be asked to sign a challenge with your receiving wallet to prove
  ownership.
- Listing includes: name, slug, description, endpoints (path patterns
  only), price ranges, tags, uptime badge.

Opt out at any time via `paygate directory unlist`.

---

## Blue/green or canary rollouts

PayGate is stateless at the request tier, so standard traffic-splitting
works. Caveats:

- Both versions share the same Redis (replay nonces must not be lost
  during a cutover). Keep them on the same Redis until the new version is
  fully promoted.
- If you change the config schema `version:`, run `paygate config
  migrate` and ensure the new config is forward-compatible with the old
  proxy during the overlap window.

---

## Backups

- `transactions` table: logical backup nightly, WAL every 5 min.
- `audit_log` table: WAL + hourly dump to S3 (hash-chain preserved).
- Redis: optional RDB snapshot to S3; if lost, re-issue is safe — the
  worst case is a brief replay window.

---

## Upgrades

- **Patch releases** — safe to roll out without config changes.
- **Minor releases** — may introduce new config keys (defaulted). Run
  `paygate config lint` against a new release before rolling.
- **Major releases** — will include a migration guide in
  `docs/migrations/` and a dedicated changeset.

---

## Rollback

- Maintain one previous image tag ready for immediate rollback.
- Rollback safety requires the same config schema `version:`. If a major
  upgrade was applied, revert the config in the same step.
