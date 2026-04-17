# VerifyLatencyP99High

## Symptom
p99 `paygate_verify_duration_seconds` exceeds SLO (250 ms Base, 800 ms
Solana) for ≥ 10 minutes.

## Impact
Agent-observed latency rises. Some agents may abort and retry, multiplying
load.

## Diagnosis
1. Split by `chain` — is it EVM or Solana?
2. Split by `mode` — is facilitator slow, or direct RPC?
3. Check upstream RPC / facilitator dashboards.
4. `paygate_rpc_failures_total{status="429"}` — throttled?

## Immediate mitigation
- Facilitator mode slow → fail over to direct for
  `advanced.facilitator_failover_seconds`.
- Direct RPC slow → demote the slow provider in the pool; it will be
  excluded after a few failures.
- If a nearly-everything spike: reduce `confirmations_base` from 2 to 1
  for sub-$0.01 endpoints **only** as a temporary measure.

## Root cause investigation
- Recent dep bump to `viem` or `@solana/web3.js`? Check changelog.
- Deployment change? Check the last successful deploy digest.

## Long-term fix
- Add a second RPC provider with independent infrastructure.
- Upgrade to a paid plan with SLA.
- Shard requests by wallet across regional proxies to localise RPC calls.
