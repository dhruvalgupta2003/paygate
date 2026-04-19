# RFC-0001: Facilitator failover semantics

- Status: accepted
- Authors: Limen core
- Created: 2026-04-17

## Motivation

Limen supports two settlement modes: **facilitator** (fast, trusted) and
**direct RPC** (robust, independent). Operators need a deterministic rule
for when we silently failover.

## Proposal

### Trigger

Fail over to direct mode for `advanced.facilitator_failover_seconds`
(default 300) when any of the following:

1. Two consecutive `/verify` calls return HTTP 5xx.
2. `/verify` p95 latency exceeds 800 ms over a 60 s window.
3. `/health` returns non-200 three times in a row.

### During failover

- Direct mode is used for verify + settle.
- Emit `limen_facilitator_failover_active=1` gauge.
- Emit `limen.facilitator.failover` log event with `reason`.
- Retry facilitator health every 30 s; on two consecutive 200s, return
  to normal.

### Recovery

- Flip the gauge to 0.
- Emit `limen.facilitator.recovered` log event.
- Next verify uses facilitator.

### Security notes

- Failover does not weaken any invariant (I1-I9). Direct mode is always
  safe; it's just slower.
- Failover must not bypass the replay guard — the Redis nonce claim is
  independent of settlement mode.

### Compliance notes

- The chosen mode is recorded in `audit_log` per request so evidence
  packs reflect the actual settlement path.

## Alternatives

- **Hard failover on first 5xx**: too jittery, causes oscillation on
  transient facilitator hiccups.
- **Manual flag**: we want automatic to protect SLOs.

## Open questions

- Do we want a second-tier facilitator (Circle's) as an intermediate
  failover target before direct RPC? Deferred to RFC-0002.
