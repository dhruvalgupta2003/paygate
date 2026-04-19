# Webhooks

Limen signs every webhook with HMAC-SHA256. Signatures live in the
`X-Limen-Signature` header and cover the raw body + timestamp, mitigating
replay attacks.

---

## Events

| Event | Fires when | Delivery guarantee |
|-------|------------|--------------------|
| `payment.settled` | A settlement completed successfully | at-least-once |
| `payment.reorged` | A previously settled tx was reorg'd away | at-least-once |
| `payment.upstream_failed` | Settlement succeeded but upstream returned 5xx | at-least-once |
| `payment.refund_requested` | Operator triggered a refund | at-least-once |
| `payment.refunded` | Operator confirmed a refund tx on-chain | at-least-once |
| `endpoint.rate_limited` | A scope hit the rate limit | at-least-once |
| `compliance.blocked` | A request was blocked by sanctions or geo | at-least-once |
| `config.reloaded` | A live config reload applied | at-most-once |
| `directory.listed` / `directory.unlisted` | Directory state changed | at-most-once |

---

## Envelope

```http
POST https://example.com/limen/webhook
Content-Type: application/json
X-Limen-Id: 01J2E3F4C5K6P7Q8R9S0T1U2V3
X-Limen-Event: payment.settled
X-Limen-Signature: t=1718640012,v1=3f1d...
X-Limen-Attempt: 1
User-Agent: Limen-Webhook/1.0 (+https://limen.dev)

{
  "id": "01J2E3F4C5K6P7Q8R9S0T1U2V3",
  "type": "payment.settled",
  "created_at": "2026-04-17T12:00:00.123Z",
  "data": {
    "tx_hash": "0xabc...",
    "chain": "base",
    "from_wallet": "0x...",
    "to_wallet": "0x...",
    "amount_usdc": "0.001000",
    "endpoint": "/api/v1/weather/sf",
    "block": 14234234,
    "latency_ms": 182
  }
}
```

---

## Signature verification

```ts
import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyWebhook(headerValue: string, rawBody: Buffer, secret: string) {
  const parts = Object.fromEntries(
    headerValue.split(',').map((kv) => kv.split('=') as [string, string]),
  );
  const t = Number(parts.t);
  const v1 = parts.v1 ?? '';
  if (!Number.isFinite(t) || Math.abs(Date.now() / 1000 - t) > 300) {
    throw new Error('stale or invalid timestamp');
  }
  const expected = createHmac('sha256', secret).update(`${t}.`).update(rawBody).digest('hex');
  if (!timingSafeEqual(Buffer.from(v1, 'hex'), Buffer.from(expected, 'hex'))) {
    throw new Error('invalid signature');
  }
}
```

Python:

```python
import hmac, hashlib, time

def verify_webhook(header_value: str, raw_body: bytes, secret: bytes) -> None:
    parts = dict(p.split("=", 1) for p in header_value.split(","))
    t = int(parts["t"])
    v1 = parts["v1"]
    if abs(time.time() - t) > 300:
        raise ValueError("stale or invalid timestamp")
    expected = hmac.new(secret, f"{t}.".encode() + raw_body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(v1, expected):
        raise ValueError("invalid signature")
```

---

## Delivery

- HTTP 1.1, `Connection: close`, keep-alive optional.
- 5 s timeout (`webhooks.timeout_seconds`, configurable).
- Retry schedule: 12 attempts over 24 h, Fibonacci (1s, 2s, 5s, 15s, 60s,
  5m, 30m, 1h, 2h, 4h, 8h, 16h).
- Dead-letter into `webhook_deliveries.status = 'dead'` after final retry.

---

## Idempotency

- `X-Limen-Id` is stable across retries. Persist it and use it to
  deduplicate processing.
- Signature rotation: `POST /_limen/v1/webhooks/{id}/rotate` — returns
  the new secret. Old secret accepted for 10 min overlap.

---

## Testing locally

```bash
# Generate a signing secret
limen keys generate-webhook-secret

# Simulate a payment.settled event
limen webhooks simulate --event payment.settled --url http://localhost:3001/hook
```
