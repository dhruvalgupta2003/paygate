# Payment flow

End-to-end walkthrough of a single paid request through PayGate.

```
agent                 paygate                 chain / facilitator              upstream
 │                      │                              │                            │
 │  GET /api/…          │                              │                            │
 ├─────────────────────▶│                              │                            │
 │                      │  (no payment present)        │                            │
 │                      │  build PaymentRequirements   │                            │
 │                      │  SET nonce→digest in Redis   │                            │
 │◀─────────────────────┤  402 + PaymentRequirements   │                            │
 │                      │                              │                            │
 │  (sign / send)       │                              │                            │
 │                      │                              │                            │
 │  GET /api/… + X-PAYMENT                             │                            │
 ├─────────────────────▶│                              │                            │
 │                      │  decode + schema validate    │                            │
 │                      │  compare digest to Redis     │                            │
 │                      │  check nonce (SET NX)        │                            │
 │                      │  compliance: sanctions + geo │                            │
 │                      │  rate limit: wallet + ip     │                            │
 │                      │  chain verify ───────────────▶                            │
 │                      │                              │  verify signature /         │
 │                      │                              │  submit / wait finality     │
 │                      │  ◀───────────────────────────┤  receipt                    │
 │                      │                              │                            │
 │                      │  forward request ────────────┼────────────────────────────▶│
 │                      │                              │                            │  handle
 │                      │  ◀───────────────────────────┼────────────────────────────┤  response
 │                      │  set X-PAYMENT-RESPONSE      │                            │
 │◀─────────────────────┤  200 OK + body + receipt     │                            │
 │                      │                              │                            │
```

---

## 1. First request (no payment)

### Agent

```http
GET /api/v1/weather/sf HTTP/1.1
Host: api.example.com
User-Agent: my-agent/0.1
Accept: application/json
```

### PayGate

Matches `path:/api/v1/weather/*`, price `0.001 USDC`, chain `base`.

```http
HTTP/1.1 402 Payment Required
Content-Type: application/vnd.x402+json
x402-version: 1
Cache-Control: no-store

{
  "version": "1",
  "paymentRequirements": {
    "scheme": "exact",
    "chain": "base",
    "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "amount": "1000",
    "payTo": "0xYourWallet",
    "nonce": "01J2E3F4C5K6P7Q8R9S0T1U2V3",
    "digest": "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "validUntil": 1718640300,
    "facilitator": "https://x402.org/facilitator",
    "description": "Weather lookup for San Francisco",
    "operator": { "name": "demo-api", "url": "https://example.com" }
  },
  "discovery": {
    "directoryId": "demo-api/weather"
  }
}
```

Redis:

- `SET paygate:nonce:01J2E3F4C5K6P7Q8R9S0T1U2V3 digest EX 305 NX` → OK
- `SET paygate:req:01J… json(PaymentRequirements) EX 305 NX`

---

## 2. Agent settles

### Option A — facilitator mode (default)

Agent constructs an EIP-3009 signed authorisation and POSTs to the
facilitator:

```http
POST https://x402.org/facilitator/verify
Content-Type: application/json

{ "paymentRequirements": {...}, "xPayment": "<base64>" }
```

Facilitator returns either `{"ok": true}` or details on failure.
Agent then POSTs `/settle` to finalise, or PayGate does it from
the request path once it trusts `verify`.

### Option B — direct mode

Agent submits the signed authorisation directly to the USDC contract:

```
USDC.transferWithAuthorization(from, to, value, validAfter,
                               validBefore, nonce, v, r, s)
```

Agent waits for 1 confirmation, captures `tx_hash`, and retries.

### Option C — Solana

Agent builds a versioned transaction:

```
[
  ComputeBudgetProgram.setComputeUnitPrice(priority_fee_microlamports),
  TokenProgram.transferChecked(source_ata, mint, dest_ata, owner,
                               amount, 6_decimals),
  MemoProgram.memo(nonce)
]
```

Signs, submits, and stores the signature.

---

## 3. Second request (with payment)

```http
GET /api/v1/weather/sf HTTP/1.1
X-PAYMENT: eyJ2IjoiMSIsImNoYWluIjoiYmFzZSIsInNjaGVtZSI6ImV4YWN0Iiwibm9uY2Ui…
```

### PayGate

```
1. Header decoded → PaymentAuth struct.
2. Zod validation. Reject on any schema violation.
3. Look up stored requirements by nonce in Redis.
4. Recompute digest; compare.
5. Rate limiter: bucket for `wallet = auth.from`. Drop or accept.
6. Compliance:
   - Circle sanctions / OFAC SDN for `auth.from`.
   - Geo via `X-Forwarded-For` + MaxMind; fail on blocklist.
7. Verifier.verify(requirements, auth):
   - signature recovered = auth.from             (I6)
   - authorisation.value >= required_amount      (I1)
   - authorisation.to == configured_wallet[base] (I2)
   - chain matches                               (I3)
   - nonce one-shot via Redis SET NX             (I4)
   - now ≤ validUntil                            (I5)
   - wait confirmations                          (I7)
8. Upstream call (undici streaming, keep-alive).
9. Build X-PAYMENT-RESPONSE with signed receipt:
   `t=<ts>,tx=0x…,block=…,settled=1000`
10. Return 200 with body.
11. Fire-and-forget: write `transactions` + `audit_log` rows.
```

```http
HTTP/1.1 200 OK
Content-Type: application/json
X-PAYMENT-RESPONSE: t=1718640012,tx=0xabc…,block=14234234,settled=1000,
                    signature=<base64 ed25519 over body>
Cache-Control: private, max-age=0

{ "city": "San Francisco", "temp_c": 17, "wind_mps": 3.2 }
```

---

## 4. Idempotent retries

If the agent retries with the **same** `X-PAYMENT` header within the
idempotency window (default 5 min):

- PayGate returns the cached response from Redis with
  `Idempotency-Status: replayed`.
- No second chain verification, no second upstream call.

If the nonce has expired: `EXPIRED_AUTHORIZATION` + a fresh 402.

---

## 5. Error flows

All error responses include:

```json
{
  "error": "AMOUNT_INSUFFICIENT",
  "detail": "required 1000 micros USDC, got 800 micros USDC",
  "requestId": "01J...",
  "retryable": true
}
```

Agents should parse `error` (stable enum) and surface `detail` for humans.

---

## 6. Partial success

PayGate settles **before** calling the upstream. If the upstream fails
(`5xx`), PayGate:

1. Marks the transaction `upstream_failed`.
2. Returns `502 UPSTREAM_FAILED` to the agent.
3. Emits `payment.upstream_failed` webhook.
4. Triggers an operator-defined remediation (auto-refund, retry, or
   manual).

This is intentional: the agent has already settled, so PayGate owes them a
response. Operators choose whether to automate refunds.

---

## 7. Timeouts and deadlines

- Client → PayGate request: up to `advanced.upstream_timeout_ms +
  advanced.verifier_timeout_ms + 2 s`.
- Verifier hard deadline: 4 s. Beyond this, return `SETTLEMENT_PENDING
  (202)` and keep the connection alive only if `Prefer: wait=600` is set.
- Upstream timeout: `advanced.upstream_timeout_ms` (default 15 s).

---

## 8. Security recap

- Nonce binding prevents replay (I4).
- Digest binding prevents the agent from paying for one thing and
  consuming another.
- Confirmations + finality prevent reorg theft.
- Sanctions + geo enforced before verify to prevent exposure of blocked
  wallets to RPC providers.
- Audit log captures every step; no PII is written unless
  `advanced.log_bodies=true`.
