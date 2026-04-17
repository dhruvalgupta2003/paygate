# Contributing to PayGate

Thanks for your interest. PayGate is an open-source project and we welcome
contributions of all shapes: bug fixes, new middleware adapters, new chain
backends, documentation, examples, and research.

> Before writing code, **read [AGENTS.md](./AGENTS.md)** — it captures the
> conventions we enforce, including for AI coding assistants.

---

## Quick start

```bash
git clone https://github.com/paygate/paygate.git
cd paygate
corepack enable
pnpm install

# Run everything
pnpm dev

# Or target one surface
pnpm --filter @paygate/node dev
pnpm --filter dashboard dev

# Python
cd packages/paygate-python
hatch env create
hatch run dev
```

Minimum versions:

- Node.js **20.10+**
- pnpm **9+**
- Python **3.11+**
- Postgres **15+**
- Redis **7+**
- Docker **25+** (optional, for `docker-compose up`)

---

## Workflow

1. **Open or claim an issue.** For anything non-trivial, open an issue first so
   we can align on scope.
2. **Create a branch.** `feat/<short-slug>`, `fix/<short-slug>`,
   `docs/<short-slug>`, `sec/<short-slug>` (security-adjacent).
3. **Write tests first.** We follow TDD for anything under
   `packages/**/verification/`, `contracts/**`, and any refund / idempotency
   logic.
4. **Run the full test suite** before opening a PR.
5. **Open a PR** using the template. Fill out the *Risk* checklist honestly.
6. **Sign your commits.** GitHub will reject unsigned commits to `main`.
7. **Write a changeset** (`pnpm changeset`) for every user-visible change.

---

## PR review

- **All** PRs get a review from a maintainer.
- PRs touching verification, key management, or smart contracts get an
  additional review from `@paygate/security`.
- We run CI on every push: lint, typecheck, unit, integration, security-scan,
  coverage gate at 80%.

---

## Coding conventions

See [AGENTS.md § 5](./AGENTS.md#5-conventions). Highlights:

- TypeScript: strict, no `any` without a narrowing step, custom errors with
  stable codes, structured logging.
- Python: 3.11+, full type hints, Pydantic v2, structlog.
- Formatting is not a style debate — prettier (TS/JS/MD/YAML) and ruff
  (Python) are the source of truth.
- No emojis in code, logs, or errors. Dashboard UI copy may use sparse Unicode
  icons.

---

## Commit message format

Conventional Commits:

```
<type>: <short imperative>

<optional longer body explaining why>
```

Allowed types:

- `feat` — new functionality
- `fix` — bug fix
- `docs` — documentation only
- `chore` — scaffolding, tooling, cleanup
- `refactor` — behaviour-preserving restructuring
- `test` — test-only
- `perf` — perf improvement
- `ci` — CI/CD change
- `build` — build config change
- `sec` — security-adjacent

---

## Branch protection rules

- `main` requires passing CI, a review, and a linear history.
- `release/*` branches are cut for long-lived release trains.
- Force-push to `main` is disabled.
- PR merges use **squash-and-merge**.

---

## Reporting vulnerabilities

Do **not** open a public issue. See [SECURITY.md](./SECURITY.md).

---

## Code of Conduct

Be kind, be specific, assume good faith. Full text:
[CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).

---

## License

By contributing, you agree that your contributions will be licensed under the
[MIT License](./LICENSE).

For first-time contributors: we use a [DCO](https://developercertificate.org/)
sign-off in commit messages (`Signed-off-by: Full Name <email>`), not a CLA.
