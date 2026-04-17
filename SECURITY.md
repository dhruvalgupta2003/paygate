# Security

PayGate's code handles money. We take security seriously and expect
collaborators to do the same.

---

## Reporting a vulnerability

**Do not open a public issue.** Use one of:

1. **Preferred — GitHub private vulnerability advisory**
   <https://github.com/paygate/paygate/security/advisories/new>

2. Email `security@paygate.dev` with PGP encryption.
   ```
   Key ID:   0xD1F0 72A5 9C1E 3B44
   Fingerprint: A91B  2D3F  9C2C  08C5  E77A   6B21  D1F0  72A5  9C1E  3B44
   ```
   Public key is published at <https://paygate.dev/.well-known/pgp-key.asc>
   and on `keys.openpgp.org`.

3. If email is blocked, DM `@paygate_security` on X / Twitter to request an
   alternative channel. We will **not** discuss specifics on social media.

Reports are triaged within **1 business day**. We aim to:

- Acknowledge within 24 h
- Initial severity assessment within 3 business days
- Remediation timeline shared within 7 business days
- Public disclosure coordinated within 90 days (or sooner by mutual agreement)

---

## Scope

In scope:

- `@paygate/node`, `paygate` (PyPI), `paygate-proxy` Docker images
- `apps/dashboard`, `apps/api`
- Smart contracts in `contracts/`
- Hosted services under `paygate.dev` and `*.paygate.dev`
- Anything labelled `security` in this repo

Out of scope:

- Third-party dependencies (report upstream, then let us know)
- Social engineering, physical attacks, or denial-of-service via excessive volume
- Findings on testnet-only environments that do not affect mainnet
- Issues requiring a compromised machine to demonstrate
- Issues on forks / unofficial deployments of PayGate

---

## Safe harbour

If you make a **good-faith effort** to comply with this policy, we will:

- Not pursue or support legal action against you.
- Work with you to understand and resolve the issue quickly.
- Credit you publicly when a fix ships (unless you prefer anonymity).

We follow the disclosure.io safe-harbour template.

---

## Bug bounty

A formal bounty program will be announced once v1.0 ships. Until then, we
offer discretionary rewards for high-impact findings. Include a PoC and a
suggested severity; we'll work with you on a number.

Indicative reward bands (USD):

| Severity | Reward |
|----------|--------|
| Critical — funds at risk | $5,000 – $25,000 |
| High — auth bypass, replay, amount mismatch | $1,500 – $5,000 |
| Medium — info leak, logic bug | $250 – $1,500 |
| Low — hardening suggestion | thanks + credit |

---

## Supply-chain security

We publish SBOMs (CycloneDX) and Sigstore signatures for every release:

- npm: `npm view @paygate/node dist` includes signature metadata
- PyPI: artefacts are signed via Sigstore / PEP 740
- Docker: images are signed via `cosign` and attested via SLSA provenance

Dependencies are reviewed via:

- `pnpm audit --audit-level=high` in CI
- `pip-audit` in CI
- `trivy fs` for container images
- `gitleaks` for secret scanning
- `codeql` for static analysis (Python, TypeScript)

---

## Cryptographic libraries we rely on

| Purpose | Library | Rationale |
|---------|---------|-----------|
| EVM RPC + typed data | `viem` | Audited, modern API, tree-shakable |
| EVM signing (tests) | `ethers` v6 | Widely reviewed |
| Solana RPC + tx | `@solana/web3.js` | Canonical client |
| Solana signing | `tweetnacl` via `@solana/web3.js` | NaCl ed25519 |
| Python EVM | `web3.py` | Widely reviewed |
| Python Solana | `solders` | Rust-backed, fast, audited |
| TLS | platform default (OpenSSL/BoringSSL) | system-managed |

We do not roll our own crypto.

---

## Secure development

- `main` is protected; all changes land via reviewed PRs.
- Verification-path files require a second reviewer from `@paygate/security`.
- Signed commits required for core maintainers.
- Runtime secrets never land in logs; see `packages/paygate-node/src/utils/logger.ts`.
- Dependency bumps go through Renovate with ≥ 24 h cooling period for
  non-security releases.
- Every release is reproducible from tag.

---

## Incident response

Runbooks live in the private ops repository. The public-safe summary:

1. Observation — PagerDuty + OpenTelemetry alerts route to on-call.
2. Triage — on-call opens a `SEV-n` incident and joins
   `#incident-active` in Discord.
3. Containment — mitigations deploy via the emergency-release channel
   (bypasses some checks — see `ops/runbooks/emergency-release.md`).
4. Remediation — root-cause fix lands, post-incident review within 5
   business days, summary posted to the status page.
5. Disclosure — if user funds or data are affected, users are notified via
   email + status page within 24 h of confirmation.
