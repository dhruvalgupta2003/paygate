# Changelog

All notable changes to this project are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: [SemVer](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial public alpha.
- `@limen/node` npm package with Express, Fastify, Hono, Next.js adapters.
- `limen` PyPI package with FastAPI, Flask, Django, Starlette adapters.
- Standalone proxy binary (`limen start`) and Docker image.
- USDC settlement verification on Base + Solana with Coinbase facilitator
  and direct-RPC fallback.
- Replay protection, TTL enforcement, idempotent response caching.
- Rate limiting (token bucket) scoped by wallet, IP, endpoint, or global.
- Compliance hooks: Circle sanctions screening, OFAC SDN snapshot, travel
  rule threshold export, geo-blocklist.
- Dashboard (React + Vite + Tailwind): revenue, endpoints, agents,
  transactions, settings, directory.
- Backend API (Hono + Postgres + Drizzle) backing the dashboard.
- Public API directory (opt-in).
- Webhooks with HMAC signatures (`payment.settled`, `payment.refunded`,
  `endpoint.rate_limited`, `compliance.blocked`).
- OpenTelemetry tracing, Prometheus metrics, structured JSON logs.
- Example apps: Express, FastAPI, Next.js, Hono, Django DRF, Flask, Solana
  RPC gateway.
- GitHub Actions: CI (lint, typecheck, unit, integration), security-scan
  (gitleaks, trivy, codeql, pip-audit, pnpm audit), publish-npm,
  publish-pypi, sbom.

### Changed

- n/a (initial release).

### Deprecated

- n/a.

### Removed

- n/a.

### Fixed

- n/a.

### Security

- Hash-chained append-only audit log for SOC 2 evidence.
- Sigstore signatures on every release artefact.
- CodeQL static analysis running on every PR.
