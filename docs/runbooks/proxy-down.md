# ProxyDown

## Symptom
`up{job="paygate-proxy"} == 0` for ≥ 2 minutes.

## Impact
All live agent traffic is rejected. No 402s, no settlements, no revenue.
SLA-paying customers may begin to exhaust their retry budgets (24 h).

## Diagnosis
1. `kubectl -n paygate get pods -l app=paygate-proxy` — are any running?
2. If pods are `CrashLoopBackOff`, `kubectl logs <pod> -p` to inspect the previous boot.
3. If pods are `Running` but failing `readyz`, the issue is dependency health (Redis / RPC / config). Jump to the matching runbook.

## Immediate mitigation
- If a recent deploy preceded the outage: `kubectl -n paygate rollout undo deployment/paygate-proxy`.
- If Redis is down and no replicas exist: fail-open the rate limiter via feature flag for up to 15 min while Redis recovers (set `PAYGATE_SAFE_MODE=ratelimit_open`). **Do not fail-open replay protection.**
- If RPC is down: flip the chain to facilitator mode via config hot-reload (`POST /_paygate/v1/config/reload`).

## Root cause investigation
- Check `kubectl describe pod` for OOMKill / eviction.
- Pull the last successful deploy's image digest and diff against current.
- Review `paygate_audit_write_failures_total` — if non-zero, disk may be full.
- Check `paygate_rpc_failures_total` per provider.

## Long-term fix
- If a config regression: add a test to `pnpm --filter @paygate/node test`.
- If a dependency update: pin the dependency in `pnpm overrides`.
- If infra: adjust `resources.requests` + `limits`, and the HPA window.
