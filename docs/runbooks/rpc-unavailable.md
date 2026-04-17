# RPCUnavailable

## Symptom
`rate(paygate_rpc_failures_total[5m]) > 0.05` for 3+ minutes, **or** all
configured RPC providers for a chain are marked unhealthy.

## Impact
Chain verification fails with `RPC_UNAVAILABLE`. Agents retry; no new
settlements occur until RPC recovers.

## Diagnosis
1. Dashboard → `paygate-rpc`: which provider is red?
2. `paygate_rpc_failures_total{provider}` — is one provider offline, or
   all?
3. `curl -sS $PAYGATE_BASE_RPC_URL -X POST -d '{"jsonrpc":"2.0","method":"eth_blockNumber","id":1}'`
   from a proxy pod.
4. Check provider status pages (Alchemy, QuickNode, Helius, Triton One).

## Immediate mitigation
- If only one provider is down: do nothing; the round-robin excludes it
  automatically after 30 s cooldown.
- If both providers are down: add a temporary third via env-var
  injection: `kubectl set env deployment/paygate-proxy
  PAYGATE_BASE_RPC_URL=...`.
- If an RPC is up but flapping 429: raise your plan or reduce request
  volume by nudging users to facilitator mode.

## Root cause investigation
- Are we hitting rate limits? Check
  `paygate_rpc_failures_total{status="429"}`.
- Did a config change remove a provider?
- Did traffic spike (paygate_requests_total) without capacity planning?

## Long-term fix
- Always run ≥ 2 providers per chain with independent infrastructure.
- Move high-volume endpoints to facilitator mode.
- Contract with a paid RPC plan; public RPCs are dev-only.
