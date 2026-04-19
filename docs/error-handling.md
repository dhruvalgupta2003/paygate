# Error handling

Every error returned by Limen is:

- **Stable** — the `error` code string never changes within a major version.
- **Classified** — HTTP status, retryability, and severity.
- **Documented** — table below is the source of truth.
- **Actionable** — the `detail` field is always safe to surface to humans.

---

## Envelope

```json
{
  "error": "AMOUNT_INSUFFICIENT",
  "detail": "required 1000 micros USDC, got 800 micros USDC",
  "requestId": "01J2E3F4C5K6P7Q8R9S0T1U2V3",
  "retryable": true,
  "retryAfterMs": 2000,
  "docs": "https://limen.dev/docs/errors#amount_insufficient"
}
```

Always `application/json; charset=utf-8`.

For 402 responses, the full `PaymentRequirements` is also attached so the
agent can re-sign:

```json
{
  "error": "PAYMENT_REQUIRED",
  "paymentRequirements": { ... },
  "requestId": "01J...",
  "retryable": true
}
```

---

## Taxonomy

| Code | HTTP | Class | Retryable | Idempotent | Description |
|------|------|-------|-----------|------------|-------------|
| `PAYMENT_REQUIRED` | 402 | handshake | yes | yes | No or missing payment header. |
| `INVALID_PAYMENT_HEADER` | 400 | handshake | no | n/a | `X-PAYMENT` not decodable. |
| `INVALID_SIGNATURE` | 402 | handshake | no | n/a | Signature fails cryptographic verify. |
| `EXPIRED_AUTHORIZATION` | 402 | handshake | yes | n/a | Past `validUntil`. |
| `NONCE_REUSED` | 402 | replay | no | n/a | Nonce already consumed. |
| `NONCE_UNKNOWN` | 402 | handshake | yes | n/a | Nonce has no requirement on server (restart / TTL). |
| `DIGEST_MISMATCH` | 402 | handshake | no | n/a | Authorization doesn't match issued requirements. |
| `RECIPIENT_MISMATCH` | 402 | verify | no | n/a | `payTo` ≠ configured wallet. |
| `CHAIN_MISMATCH` | 402 | verify | no | n/a | Wrong chain for this endpoint. |
| `ASSET_MISMATCH` | 402 | verify | no | n/a | Wrong token / mint address. |
| `AMOUNT_INSUFFICIENT` | 402 | verify | yes | n/a | Under-paid by `shortfall`. |
| `SETTLEMENT_PENDING` | 202 | verify | yes | yes | Needs more confirmations. |
| `SETTLEMENT_FAILED` | 402 | verify | yes | n/a | On-chain revert / dropped. |
| `COMPLIANCE_BLOCKED` | 451 | compliance | no | n/a | Sanctions or geo block. |
| `RATE_LIMITED` | 429 | throttling | yes | yes | Token bucket drained. |
| `UPSTREAM_FAILED` | 502 | upstream | yes | depends | Upstream 5xx after settlement. |
| `UPSTREAM_TIMEOUT` | 504 | upstream | yes | depends | Upstream exceeded `upstream_timeout_ms`. |
| `SERVICE_DEGRADED` | 503 | infrastructure | yes | yes | Redis / DB outage; safe-mode engaged. |
| `RPC_UNAVAILABLE` | 503 | infrastructure | yes | yes | All RPC providers failed. |
| `BAD_CONFIG` | 500 | config | no | n/a | Misconfig at boot or hot-reload. |
| `INTERNAL` | 500 | bug | yes | yes | Unexpected exception. |

---

## Retry policies

### Agent side

Honour the `retryAfterMs` field. Otherwise:

```
retries = 5
backoff = full-jitter exponential, base=200ms, cap=5s
```

For non-retryable errors (`INVALID_SIGNATURE`, `RECIPIENT_MISMATCH`, etc.)
do not retry; surface to the caller.

### Server side (internal)

Internal retries use `tenacity` (Python) or `@limen/node`'s `retry`
helper:

- RPC `fetchTransaction`: 4 attempts, exponential backoff, jittered.
- Facilitator `/verify` and `/settle`: 2 attempts; on second failure,
  failover to direct mode for `facilitator_failover_seconds`.
- Webhook delivery: 12 attempts over 24 h (Fibonacci), then dead-letter.

---

## Logging on error

```
ERROR service=limen-proxy
      code=AMOUNT_INSUFFICIENT
      chain=base
      endpoint=/api/v1/premium/*
      wallet=0x1234…cdef
      required_micros=50000 got_micros=40000
      reqId=01J…
```

- Stack traces on `INTERNAL` only.
- All errors include `traceId` for cross-correlation with OTel.

---

## How operators should display errors

- **Dashboard** — show `error` + `detail`.
- **Agent clients** — surface `detail` to the user when acting on a
  human's behalf; include `docs` link.
- **Public API directory** — include common error codes in the OpenAPI
  description so consuming agents can precompile handlers.

---

## Do not catch-and-swallow

Internal anti-patterns we reject:

- `try { await fn() } catch {}` with no log / rethrow.
- Converting errors to truthy booleans without tagging.
- Returning generic `500 INTERNAL` when a specific code exists.
- Bare `except:` in Python.
- Logging `e.message` only — always log `e.stack`/`traceback.format_exc()`
  (auto-redacted if sensitive).

See `silent-failure-hunter` agent runs in CI for enforcement.
