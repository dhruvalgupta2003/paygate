# High5xxRate

## Symptom
5xx rate > 2% sustained for ≥ 5 minutes.

## Impact
- Agents that get 5xx already settled (if verify succeeded) — we owe them
  a response. Webhook `payment.upstream_failed` will fire.
- Agents that get 5xx before verify can safely retry.

## Diagnosis
1. `rate(paygate_http_duration_seconds_count{status=~"5.."}[5m])` — which
   status and which route?
2. Segment by `endpoint` — is it one operator or all?
3. Check `paygate_rpc_failures_total` — if RPC is flapping, route to
   `RPCUnavailable`.
4. Check upstream reachability from a proxy pod:
   `kubectl exec -it paygate-proxy-xxxx -- curl -v <upstream>/livez`

## Immediate mitigation
- If one upstream is misbehaving and pre-verify: return `503
  SERVICE_DEGRADED` for that endpoint via a route-level circuit breaker
  (set `PAYGATE_BREAK_<slug>=1`).
- If post-verify failures are widespread: enable the auto-refund flag for
  the affected operator (`operators/<id>/auto_refund=true`) while we
  investigate.

## Root cause investigation
- Grep logs for `outcome:"upstream_failed"` within the last hour.
- Attach a trace query: `paygate.upstream.duration_seconds` histogram.
- Cross-check operator's dashboard for deploys / config changes.

## Long-term fix
- Upstream timeout too aggressive → adjust `advanced.upstream_timeout_ms`.
- Upstream retries missing → add idempotent retry policy.
- Widespread across many upstreams → outage in our RPC provider or
  facilitator; escalate to their support.
