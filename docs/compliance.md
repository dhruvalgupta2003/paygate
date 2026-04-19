# Compliance

Limen is infrastructure, not a custodian. We don't hold user funds or
provide financial services ourselves. That said, Limen is designed so that
**operators can meet their own compliance obligations** without bolting on a
second vendor.

This doc covers:

1. Sanctions screening (OFAC + Circle)
2. Travel rule
3. Stablecoin regulation (MiCA, GENIUS Act, NYDFS)
4. Data protection (GDPR, CCPA, India DPDP)
5. SOC 2 evidence
6. KYC/KYB posture
7. Record-keeping

Nothing here is legal advice. Work with your counsel.

---

## 1. Sanctions screening

### What happens by default

- When `compliance.sanctions_screening: true` (the default) and a payment
  authorisation arrives, Limen:
  1. Extracts the `from_wallet` address.
  2. Checks the **local OFAC SDN snapshot** (crypto addresses).
  3. Optionally calls **Circle's sanctions API** (if
     `LIMEN_CIRCLE_API_KEY` is set) for additional coverage — Circle
     maintains their own screening list for USDC compliance.
  4. Returns `451 COMPLIANCE_BLOCKED` + `error: sanctions_match` if either
     source flags the address.
  5. Emits a `compliance.blocked` webhook with the matching list name.

- The local OFAC snapshot refreshes hourly from the U.S. Treasury's
  official CSV (crypto-address supplements). Update cadence and source are
  recorded in `audit_log` for evidence.

### What the operator should do

- Review `compliance.blocklist_path` for your jurisdiction's additions
  (some operators must also block EU / UK consolidated lists).
- Keep at least 90 days of `compliance_events` for auditor review.

### Override scenarios

- `compliance.sanctions_screening: false` disables screening (not
  recommended; emits a boot warning).
- `compliance.allowlist` bypasses screening for a finite list of wallets
  (internal/testing only; logged each use).

---

## 2. Travel rule

FATF's travel rule requires VASPs to share originator/beneficiary info for
transfers above a threshold (commonly $3,000 / €1,000). Limen is not a
VASP — but if you are, you need this data.

- `compliance.travel_rule_threshold_usd` (default `3000`) triggers an
  export:
  - `POST` to `compliance.travel_rule_webhook` with a signed JSON body:
    ```json
    {
      "id": "01J...",
      "tx_hash": "0x…",
      "chain": "base",
      "from_wallet": "0x…",
      "to_wallet": "0x…",
      "amount_usdc": "3500.000000",
      "observed_at": "2026-04-17T12:00:00Z",
      "purpose": "api_service",
      "originator_hint": { "project_slug": "my-api" }
    }
    ```
- Integrate this with your Travel Rule vendor (Notabene, Sumsub, TRP,
  etc.). Limen does not implement TRISA / IVMS-101 natively; the exported
  payload is designed to be trivial to transform.

---

## 3. Stablecoin regulation

| Jurisdiction | Reg | Implication | Limen handling |
|--------------|-----|-------------|------------------|
| **US** | GENIUS Act (2025, proposed) | Payment stablecoins regulated federally | USDC is issued by Circle (registered); Limen routes only; no holding |
| **US (NYDFS)** | BitLicense / virtual currency | Same | Operator relationship with Circle, not Limen |
| **EU** | MiCA (Titles III / IV) | E-money token rules for USDC | USDC in the EU is issued by Circle's EU subsidiary; Limen settles on-chain, no custody |
| **UK** | FSMA 2023 as amended | Similar to MiCA | As above |
| **Japan** | Amended Payment Services Act | Prepaid/e-money rules | Coordinate with local issuer |
| **Singapore** | PS Act 2019 | Digital payment token services | DPT operators need MAS licence if providing services |

Limen takes the position that:

- The operator's relationship with USDC issuers (Circle) is direct, not
  through Limen.
- Limen does not transmit money in the regulated sense — it verifies
  settlements the parties already executed on-chain.
- Operators who fall within a MSB / VASP / CASP definition **must** follow
  their local rules; we give them the data.

---

## 4. Data protection

### GDPR / CCPA / DPDP (India)

- Wallet addresses are **pseudonymous identifiers**. In most jurisdictions
  they are personal data only when linked to an identifiable person.
- By default Limen stores: wallet addresses (hashed for analytics, raw
  for audit), endpoint paths (hashed if configured), amount, tx hash,
  timestamps.
- Limen does **not** store request bodies or response bodies unless the
  operator explicitly enables `advanced.log_bodies: true` (not recommended
  outside debug).
- Data-subject request workflow:
  - `limen dsr redact --wallet 0x...` tombstones the wallet in
    analytics while preserving aggregate totals via a rollup table.
  - `limen dsr export --wallet 0x...` produces a JSON dump of all rows.

### Retention

- `audit_log`: operator-configurable, default 2 years.
- `transactions`: operator-configurable, default 18 months.
- `rate_limit_events`: default 14 days.
- `webhook_deliveries`: default 30 days.
- `compliance_events`: default 5 years (matches VASP record-keeping rules).

### Cross-border transfers

- The hosted Limen service runs in US + EU regions. Operators pick one
  for data residency.
- Self-hosted deployments: data stays where you deploy it.

---

## 5. SOC 2 evidence pack

Limen generates the artefacts auditors look for:

| Evidence | Source |
|----------|--------|
| Access logs | `audit_log` (who did what) |
| Change management | Git history + PR metadata |
| Incident records | `ops/runbooks/*` + status-page archive |
| Configuration snapshots | `audit_log` stores config diffs at every change |
| Dependency inventory | Quarterly `pnpm list`, `pip freeze` exports |
| Vulnerability scans | CI artefacts (CodeQL, Trivy, pip-audit, npm audit) |
| Backup evidence | Postgres WAL backups; daily manifest hash |
| User access reviews | Dashboard exports available monthly |

Run `limen evidence pack --out ./evidence.zip` to build a bundle for
your auditor.

---

## 6. KYC / KYB posture

- **Limen does not KYC agents.** Agents are identified by wallet only.
- **Operators may require KYC of their own customers** (e.g. B2B API
  customers) outside Limen. That's an application-layer concern.
- **Operators running as VASPs** should integrate their KYC stack behind
  Limen (dashboards, access controls on receiving wallet changes, etc.).

---

## 7. Record-keeping

- **Tamper-evident audit log**. Every critical action (config change,
  policy update, secret rotation, refund, override) writes a row to
  `audit_log` whose `chain_hash = SHA-256(prev_hash || serialize(row))`.
- `limen audit verify` re-derives the chain and reports any break.
- Exports support NDJSON for SIEM ingestion (Splunk, Datadog, Elastic).

---

## 8. Refunds and disputes

Limen does not automatically refund. Refund workflows are
operator-driven:

1. Operator calls `POST /v1/refunds` with `tx_hash` + reason.
2. Limen validates the tx is ours, marks the row as `refund_requested`,
   and emits `refund.requested` webhook.
3. Operator triggers the on-chain refund (pushing USDC back to
   `from_wallet`). Operator records the refund tx via
   `POST /v1/refunds/:id/confirm`.
4. Limen marks the original transaction `refunded`.

Chargeback-style pull refunds are not supported because x402 is push-only;
the operator wallet must voluntarily push the refund.

---

## 9. Jurisdictional caveats

We cannot operate in sanctioned jurisdictions. Hosted Limen blocks
traffic from UN-sanctioned countries at the edge.

Operators remain responsible for their own geographic restrictions via
`compliance.geo_blocklist`.

---

## 10. Questions

For compliance questions, email `compliance@limen.dev`. For data-subject
requests on the hosted platform, use the in-dashboard DSR form or email
`privacy@limen.dev`.
