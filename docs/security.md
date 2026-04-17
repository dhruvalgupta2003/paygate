# Security

This document is the threat model, invariant list, and audit plan for PayGate.
Public disclosure policy lives in [SECURITY.md](../SECURITY.md).

---

## 1. Principles

1. **Money-handling code is held to a higher bar.** Any file under
   `packages/**/verification/**`, `packages/**/chains/**`, or `contracts/**`
   requires review from `@paygate/security`.
2. **Trust boundaries are explicit and few.**
3. **Fail closed on anything that moves money, fail open on observability.**
4. **We don't roll our own crypto.** Audited libraries only.
5. **We publish what we can reproduce.** SBOMs, signed releases, deterministic
   builds.

---

## 2. Trust boundaries

```
┌─────────────────────────────────────────────────────────────────┐
│                            Internet                             │
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │  Agent       │    │  Facilitator │    │  Chain RPC    │      │
│  │ (untrusted)  │    │  (trusted)   │    │  (semi-trust) │      │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘       │
│         │                   │                   │                │
│         └───────┬───────────┴───────────────────┘                │
│                 ▼                                                │
└─────────────────┼────────────────────────────────────────────────┘
                  ▼
        ┌─────────────────────┐
        │  PayGate Proxy      │   ◀── the only component writing
        │  (trusted)          │        to replay / audit stores
        └──────────┬──────────┘
                   ▼
        ┌─────────────────────┐
        │  Upstream API       │   ◀── trusted (operator's own code)
        └─────────────────────┘
```

Trusted:

- Code we wrote and reviewed in this repo.
- The Coinbase x402 facilitator (we accept its verify/settle responses as
  authoritative when in facilitator mode; direct-RPC mode is available as a
  fallback).
- The operator's own upstream API and receiving wallet addresses.

Untrusted:

- The agent's request body, headers, and payment authorization.
- Any third-party proxy in front of PayGate (unless `trust_proxy` is set).
- RPC responses — we **verify the returned data** cryptographically
  whenever possible (event logs match, ATA ownership checks, mint address
  matches canonical USDC).

---

## 3. Threat model

### 3.1 Attackers and goals

| Attacker | Goal |
|----------|------|
| Freeloader agent | Access paid endpoints without paying. |
| Replay attacker | Reuse a single paid authorisation for many requests. |
| Front-runner | Bypass a legitimate agent's pending payment. |
| RPC adversary | Trick PayGate into accepting forged settlement data. |
| Facilitator compromise | Force PayGate to accept unsettled payments. |
| Rate-limit bypasser | Exhaust RPC budget via denial-of-wallet. |
| Supply-chain attacker | Insert malicious code via a dependency. |
| Malicious operator | Configure PayGate to steal from agents (siphon to attacker wallet). |

### 3.2 Out of scope

- Attacks requiring compromise of the operator's own host / wallet custody.
- L1 consensus failures on Base or Solana.
- Crypto library zero-days (mitigation: we pin specific versions and publish
  advisories promptly).

---

## 4. Invariants (tested and monitored)

Every invariant has a dedicated test file. Breaking any should fail CI.

| ID | Invariant | Enforced by | Test |
|----|-----------|-------------|------|
| **I1** | `settled_amount ≥ required_amount` and asset matches | `verifier.verifyAmount` | `verification/amount.test.ts` |
| **I2** | `payTo == configured_wallet[chain]` | `verifier.verifyRecipient` | `verification/recipient.test.ts` |
| **I3** | Chain of settlement matches required chain | `verifier.verifyChain` | `verification/chain.test.ts` |
| **I4** | Nonce consumable exactly once | `replayGuard.claim` + Redis NX | `replay/nonce.test.ts` |
| **I5** | `now ≤ validUntil` (monotonic clock) | `handshake.checkTtl` | `handshake/ttl.test.ts` |
| **I6** | Signature verifies against canonical digest | `crypto.verify*` | `crypto/eip3009.test.ts`, `crypto/solana.test.ts` |
| **I7** | Confirmations ≥ required (Base) or status ≥ required (Solana) | `verifier.waitForFinality` | `verification/finality.test.ts` |
| **I8** | Idempotent response on same `(nonce, chain, payTo)` | `cache.getByNonce` | `idempotency.test.ts` |
| **I9** | Upstream called only after I1-I8 pass | `proxy.coreFlow` | `proxy.happy-path.test.ts`, `proxy.bypass-attempts.test.ts` |
| **I10** | No private keys in process memory beyond their use | `security.keyHandling` | audit + lint |

Fuzzers under `verification.fuzz.ts` randomise amount, nonce, timing, and
signature bit flips; anything that yields `ok: true` when it shouldn't is a
finding.

---

## 5. Cryptography

- **EVM**:
  - EIP-3009 `TransferWithAuthorization`: typed-data signature over
    `(from, to, value, validAfter, validBefore, nonce)` bound to USDC's
    EIP-712 domain.
  - `viem` verifies via `recoverTypedDataAddress`, constant-time.
- **Solana**:
  - Signature: ed25519 over the message. `@solana/web3.js` wraps tweetnacl.
  - We additionally check the transaction includes a `Memo` instruction
    whose data equals the expected nonce.
- **Digest binding**:
  - Requirements are canonicalised (sorted keys, fixed number encoding,
    UTF-8) and SHA-256'd. The nonce is derived from `HMAC-SHA256(secret,
    digest || random)`. Redis stores `nonce -> digest`. On redemption, the
    authorisation must match the stored digest.

No custom ciphers, no custom PRNGs, no hand-rolled constant-time compares.

---

## 6. Input validation

- HTTP headers: parsed via `undici`; max header size 32 KB.
- Body: streaming, capped at `advanced.max_request_body_mb`.
- `X-PAYMENT` header:
  - Length cap 16 KB.
  - Base64 decoded via `Buffer.from(..., 'base64')` (Node) or
    `base64.b64decode(... , validate=True)` (Python).
  - JSON parsed with schema validation (Zod / Pydantic); unknown keys
    rejected.
- `paygate.config.yml`: Zod/Pydantic validation; startup fails on error.

---

## 7. Sandboxing + least privilege

- Docker image runs as non-root (`uid 10001`).
- No shell in production image (distroless base).
- `CAP_DROP=ALL`, read-only filesystem except `/tmp` and `/app/data/audit`.
- Outbound egress limited to configured RPC / facilitator / webhook
  destinations via an allow-list (enforced at the deployment layer; we
  publish a recommended NetworkPolicy for Kubernetes).

---

## 8. Secret management

- Receiving wallet **addresses** are public by design.
- Admin secrets (JWT, webhook signing key) are loaded from env vars, never
  printed, and redacted from logs by `logger.redact`.
- Dashboard passwords are not used — dashboard auth is wallet-based (SIWE
  for EVM, SIWS for Solana).
- CI uses OIDC to publish to npm / PyPI / GHCR — no long-lived tokens in CI.

---

## 9. Supply-chain security

- **Dependencies**:
  - Renovate with 24 h cooling on non-security releases.
  - `pnpm overrides` pin transitive dependencies of verification-critical
    libraries (`viem`, `@solana/web3.js`, `web3.py`, `solders`).
  - Quarterly dependency audit (automated report in `ops/audits/`).
- **Build**:
  - Reproducible builds verified in CI.
  - SLSA provenance attestations attached to releases.
- **Signing**:
  - npm: Sigstore provenance (`--provenance`).
  - PyPI: PEP 740 digital attestations.
  - Docker: `cosign sign --keyless`.
- **Scanning**:
  - `codeql` on every PR (TypeScript, Python).
  - `gitleaks` on every commit.
  - `trivy fs` + `trivy image` on every release.

---

## 10. Audit plan

Internal audits:

1. **Self-review checklist** — every payment-path change runs the full
   invariant suite plus 10-minute fuzz session.
2. **Red-team week** — quarterly internal attempt to bypass payment flow.

External audits (pre-v1):

1. Source-code audit of `packages/paygate-*/**/verification/**` + `chains/**`.
2. Smart contract audit of `contracts/base/PayGateReceipts.sol` if and when
   used in production.
3. Penetration test of `paygate.dev` hosted stack.

Audit vendors will be published in `docs/audits/`.

---

## 11. Security headers we set

- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: accelerometer=(), camera=(), microphone=(), geolocation=(), payment=(self)`
- `Content-Security-Policy`: strict, nonce-based, documented in
  `apps/dashboard/index.html`.

---

## 12. Incident classification

| Severity | Example | Response target |
|----------|---------|-----------------|
| SEV-0 | Any unauthorised settlement or private-key exposure | page immediately, 1 h to containment |
| SEV-1 | Payment bypass, but no loss yet | page within 15 min, 4 h to containment |
| SEV-2 | Partial outage, compliance failure | 1 h to containment |
| SEV-3 | Degraded analytics, no payment impact | next business day |
