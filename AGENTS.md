# AGENTS.md

Instructions for **AI coding agents** (Claude Code, Cursor, Windsurf, Aider, Cline,
Codex, Devin, etc.) working inside the PayGate monorepo.

This file follows the [agents.md](https://agents.md) convention.
If you are an LLM, read this **before** making changes.

---

## 0. One-line summary

PayGate is an open-source **x402 paywall** for AI agent traffic. It ships two
first-class SDKs (`@paygate/node`, `paygate` on PyPI), a standalone proxy, a
React dashboard, and a backend API. Every code path that touches money is
security-critical.

---

## 1. Golden rules

1. **Never commit secrets.** Use `.env` (gitignored) and `.env.example` only.
   `gitleaks` runs in CI; PRs with secrets are auto-closed.
2. **Never log full payment authorizations, private keys, or raw signatures.**
   Use the structured logger's `redact` helper.
3. **Never weaken payment verification.** Changes under `packages/**/verification/`
   require a second reviewer tagged `@paygate/security`.
4. **Prefer extending tests to softening them.** If a test blocks your change,
   the test is usually right.
5. **Small, focused PRs.** Group by surface (`packages/paygate-node/**`,
   `packages/paygate-python/**`, `apps/dashboard/**`, etc).
6. **Keep TypeScript and Python SDKs in parity.** If you add a feature in one,
   file a tracking issue for the other.
7. **No emojis in code, logs, or error messages.** Dashboard copy may use
   sparing Unicode icons (see `apps/dashboard/src/lib/icons.ts`).

---

## 2. Repository map

| Path | What lives here | Entry points |
|------|-----------------|--------------|
| `packages/paygate-node/` | TypeScript SDK + proxy + CLI | `src/index.ts`, `src/cli/index.ts` |
| `packages/paygate-python/` | Python SDK + proxy + CLI | `paygate/__init__.py`, `paygate/cli/__init__.py` |
| `apps/dashboard/` | React + Vite dashboard | `src/main.tsx` |
| `apps/api/` | Hono backend (PostgreSQL + Redis) | `src/index.ts` |
| `contracts/base/` | Optional Solidity contracts (Foundry) | `src/PayGateReceipts.sol` |
| `contracts/solana/` | Optional Solana programs (Anchor) | `programs/paygate/src/lib.rs` |
| `examples/` | One-file repros in popular frameworks | each has its own README |
| `docs/` | Human + LLM docs | `README.md`, `llms.txt`, `llms-full.txt` |

---

## 3. Tooling

| Tool | Why |
|------|-----|
| **pnpm 9** | JS package manager. Use `pnpm`, not `npm` or `yarn`. |
| **turbo** | Monorepo build orchestrator. Run `pnpm build`, `pnpm test`, etc. at the root. |
| **tsup** | Builds the Node SDK to ESM + CJS + `.d.ts`. |
| **vite** | Dashboard bundler. |
| **hatch** | Python build system for `paygate-python`. |
| **ruff** | Python linter + formatter. No Black. |
| **mypy** | Python type checker (`strict`). |
| **eslint + prettier** | JS/TS lint + format. Prettier is the source of truth for style. |
| **drizzle-orm** | Postgres ORM for `apps/api`. |
| **playwright** | E2E for the dashboard. |
| **foundry** | Smart contracts on Base. |
| **anchor** | Smart contracts on Solana. |

All commands work from repo root:

```bash
pnpm install          # install all workspaces
pnpm dev              # runs every dev server (dashboard, api, proxy)
pnpm build
pnpm test             # unit + integration
pnpm lint
pnpm typecheck
pnpm --filter @paygate/node test       # scope to one package
pnpm --filter paygate-python test      # scope to python
pnpm --filter dashboard dev
```

For Python, inside `packages/paygate-python/`:

```bash
hatch env create
hatch run lint
hatch run test
hatch run typecheck
```

---

## 4. How to safely edit verification code

Payment verification is the **most security-sensitive** part of the codebase.

**If you are modifying any file matching**
`packages/paygate-*/**/verification/**` or `contracts/**`:

1. Open the relevant [invariant list](./docs/security.md#invariants).
2. Add or update a test case for **each invariant** your change could affect.
3. Run the full verification test suite twice, including fuzzing:
   ```bash
   pnpm --filter @paygate/node test -- --coverage --run
   pnpm --filter @paygate/node test -- --run verification.fuzz
   hatch run -e test pytest -k verification --cov
   ```
4. Add yourself to the `CODEOWNERS` review list if the logic is chain-specific.
5. Do not remove TTL, nonce, or amount checks. Ever.

---

## 5. Conventions

### TypeScript

- Strict mode, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` all on.
- Prefer `readonly` arrays, `Result`-like return unions, and `zod` for parsing.
- Errors extend `PayGateError` with a stable `.code`. See `src/errors.ts`.
- Logs go through `src/utils/logger.ts`. Never `console.log`.
- Public exports are enumerated in `src/index.ts`. No re-exporting internals.

### Python

- Python 3.11+. Type hints on every public function.
- `from __future__ import annotations` in every module.
- Pydantic v2 for config + DTOs. Prefer frozen models.
- Errors extend `paygate.errors.PayGateError` with a `.code` string.
- Use `paygate.utils.logger.get_logger(__name__)` — never `print` or `logging.getLogger(__name__)` directly.

### Naming

- Package names: `@paygate/node`, `@paygate/react`, `paygate` (PyPI), `paygate-dashboard`.
- Env vars: `PAYGATE_*`.
- Metrics: `paygate_*` (snake_case, Prometheus convention).
- Internal types: `PascalCase`; interfaces get no `I` prefix.

### Commits & PRs

- Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`, `perf:`, `ci:`, `build:`, `sec:`).
- PRs include a `Risk` checkbox, see `.github/PULL_REQUEST_TEMPLATE.md`.
- Changesets in `.changeset/` for every publishable change.

---

## 6. How to add a new chain

1. Create `packages/paygate-node/src/chains/<chain>.ts` implementing `ChainAdapter`.
2. Implement the three methods: `buildPaymentRequirements`, `verifyPayment`,
   `confirmPayment`.
3. Add a USDC (or stable) contract address constant.
4. Mirror in `packages/paygate-python/paygate/chains/<chain>.py`.
5. Add integration tests that hit the public testnet RPC.
6. Update `docs/chains/<chain>.md`, `README.md` chain matrix, and `llms-full.txt`.

---

## 7. How to add a new framework adapter

1. Create `src/middleware/<framework>.ts` exporting a factory function that
   takes a `PayGateConfig` and returns the framework's middleware/handler.
2. Keep the adapter **thin** — all real logic lives in `src/proxy/core.ts`.
3. Mirror in Python under `paygate/middleware/<framework>.py` where applicable.
4. Add an example under `examples/<framework>-api/`.

---

## 8. Data + secrets you may NOT touch

- Production `.env` files, database dumps, audit log archives.
- `contracts/base/broadcast/**/run-*.json` deployment artifacts.
- `apps/api/migrations/*/down.sql` in production environments.
- Anything under `ops/secrets/`, `ops/runbooks/` (private operator repo).

---

## 9. Testing checklist before opening a PR

- [ ] `pnpm lint` + `pnpm typecheck` clean
- [ ] `pnpm test` clean
- [ ] `hatch run test` clean (if Python touched)
- [ ] `pnpm --filter dashboard test` clean (if dashboard touched)
- [ ] Docs updated (`docs/api-reference.md`, config schema, changelog)
- [ ] `pnpm changeset` if publishing
- [ ] Manually exercised on testnet (Base Sepolia / Solana devnet)

---

## 10. How to ask for help

- For architecture questions, read `docs/architecture.md` first.
- For a concept you can't find, search [`docs/llms-full.txt`](./docs/llms-full.txt).
- For chain-specific questions, see `docs/solana.md` or `docs/base.md`.
- Still stuck? Open a draft PR with a TODO list — humans will point the way.

---

## 11. Anti-patterns we reject

- Silent catch blocks (`try { ... } catch {}` with no log, no rethrow).
- `any`, `unknown` without a narrowing step, or `@ts-ignore` without a linked issue.
- Python: bare `except:` and `except Exception` without re-raise or structured log.
- Mutating config objects at runtime.
- Bypassing the rate limiter for "service" requests — use the signed internal token.
- Using `Date.now()` for payment TTL checks — use the monotonic clock helper.
- Hard-coded USDC addresses inside business logic. Use the chain constants.
