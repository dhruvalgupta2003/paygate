# Changelog

All notable changes to this project are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: [SemVer](https://semver.org/spec/v2.0.0.html).

## [0.1.1](https://github.com/dhruvalgupta2003/limen/compare/v0.1.0...v0.1.1) (2026-04-19)


### Features

* **@paygate/node:** end-to-end x402 demo + fix proxy self-loop ([6b0a691](https://github.com/dhruvalgupta2003/limen/commit/6b0a6911b1f0b73eeb5b5b13866a0369ced1b1ac))
* **@paygate/node:** real on-chain settlement verification + agent ([00cb360](https://github.com/dhruvalgupta2003/limen/commit/00cb36033092857711b8b341518ee60d0b6496f6))
* **api:** boot apps/api against real Postgres + expose live analytics ([0fe67f1](https://github.com/dhruvalgupta2003/limen/commit/0fe67f13fc8cd1d2e3fc71701c790517a3317182))
* **api:** wire /endpoints + /agents + /compliance + /webhooks to real DB ([d36087e](https://github.com/dhruvalgupta2003/limen/commit/d36087ee69071453098e8e6e542eae9dba0be3e3))
* **billing+auth:** Stripe metering, API key auth, replay-protected webhooks ([819e20f](https://github.com/dhruvalgupta2003/limen/commit/819e20f832e172b6aeb08c7af6af14a4228e6a92))
* **cli:** add 'paygate keys generate-evm-key' for Base Sepolia setup ([b52746c](https://github.com/dhruvalgupta2003/limen/commit/b52746ccd5258d73f27313f592078855e1a08f92))
* initial commit — x402 paywall for AI agent traffic ([7ac6c71](https://github.com/dhruvalgupta2003/limen/commit/7ac6c711c53ec834c14bf070f4d4ad1ef96cf9f6))
* proxy → API settlement hook — dashboard now auto-populates from ([d489e28](https://github.com/dhruvalgupta2003/limen/commit/d489e2829e3034b4c262097680661475c2ff8cae))
* Python SDK first-boot green (34/34 tests) + express-api example boots + 402 verified ([32ddf7c](https://github.com/dhruvalgupta2003/limen/commit/32ddf7c1974ad95695021a10092c1cf20fb84fc5))
* rebrand to Limen — the threshold for agent payments ([e8455d1](https://github.com/dhruvalgupta2003/limen/commit/e8455d182d1bc53c195e230b9b79b80236fab6ad))


### Bug Fixes

* **@paygate/node:** first-boot build & test pass ([cd21b50](https://github.com/dhruvalgupta2003/limen/commit/cd21b50e2bfaa9e040e2a0008c2e34921202ce92))
* **@paygate/node:** wire defaults.confirmations → BaseAdapter, clamp ([5ca2531](https://github.com/dhruvalgupta2003/limen/commit/5ca253178b8b0b0aa1d952eb7c43835186f29bc2))
* **chains/base:** confirmations now count the inclusion block (bitcoin ([2244962](https://github.com/dhruvalgupta2003/limen/commit/2244962f0edd3892a2076b1f28be00f6c74dcc82))
* **dashboard:** first-boot runtime errors — route-to-schema alignment ([8393ddb](https://github.com/dhruvalgupta2003/limen/commit/8393ddb27f15b03ab4a1021d2b25318cfdc4cb41))
* **demo:** treat only 2xx-success-with-body as success, not SETTLEMENT_PENDING (202) ([f3fc3d6](https://github.com/dhruvalgupta2003/limen/commit/f3fc3d60912266a99562b741c81fff5a6422e656))

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
