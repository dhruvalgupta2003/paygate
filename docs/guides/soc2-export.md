# Export SOC 2 evidence

PayGate auto-generates the artefacts SOC 2 auditors want. This guide
shows you how to collect them in one go.

## One command

```bash
paygate evidence pack --out ./evidence-2026Q1.zip --since 2026-01-01
```

## What's inside

| File | Purpose |
|------|---------|
| `audit_log/*.ndjson` | Hash-chained action log — who/what/when |
| `audit_log/hash_verify.txt` | Result of `paygate audit verify` |
| `transactions.csv` | Every settlement in range |
| `access_reviews/*.csv` | Monthly access review exports |
| `change_management/git_log.txt` | Commits to this repo, tagged PRs |
| `config_snapshots/*.json` | Every live config hash-stamped |
| `incidents/*.md` | Incident records + PIRs |
| `vulnerability_scans/*.sarif` | Trivy / CodeQL / pip-audit outputs |
| `sbom/*.cdx.json` | CycloneDX SBOMs for proxy + api + dashboard |
| `policies/*.md` | Copy of SECURITY.md + compliance policies |
| `attestations/*.bundle` | Sigstore / cosign signatures for released artefacts |

## Tying it to your controls

Map PayGate's evidence to your SOC 2 controls:

| Control | Evidence |
|---------|----------|
| CC6.1 logical access | `audit_log`, `access_reviews` |
| CC7.2 security monitoring | `vulnerability_scans`, dashboards |
| CC7.4 incident management | `incidents`, runbooks |
| CC8.1 change management | `change_management`, config snapshots |
| A1.1 availability | SLO dashboards + `paygate_http_duration_seconds` |

## Verification

Before handing evidence to an auditor, run:

```
paygate audit verify --file ./evidence-2026Q1/audit_log/2026-04-17.ndjson
# expect: OK — N rows verified
```

A break indicates tampering. If it ever fails, stop, rotate credentials,
and open a SEV-1 incident.
