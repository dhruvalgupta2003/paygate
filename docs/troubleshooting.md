# Troubleshooting

Common problems and fixes. If your issue isn't here, run `limen doctor`
first — it catches 80% of misconfig.

---

## "Agents are seeing 402 but never settling"

- The 402 body's `facilitator` URL must be reachable from the agent.
- Confirm `limen.config.yml` `facilitator` is set (or
  `LIMEN_FACILITATOR_URL`).
- Check the receiving wallet you advertised — agents won't pay into a
  wallet that looks dead (zero historical activity). Some clients refuse.

## "I'm getting RECIPIENT_MISMATCH"

- Your config wallet doesn't match what's encoded in the `X-PAYMENT`.
- Do **not** change `wallets.base` between 402 issuance and redemption.
  If you must rotate, increment `version:` in the config and wait 10
  minutes (longer than any outstanding nonce TTL).

## "I'm getting AMOUNT_INSUFFICIENT but the agent says they paid"

- Check decimals: USDC uses 6, not 18. `price_usdc: 0.001` = `1000` micros.
- Check rounding: config `price_usdc` is a string; never use `float`.
- Check that the agent signed for the same chain; a Base authorisation
  for 1000 micros is not a Solana payment for 1000 micros.

## "NONCE_REUSED on a fresh agent"

- Check Redis clock skew. Nonces are keyed with `EX` TTL; clock skew
  between nodes can evict early.
- Check `payment_ttl_seconds` — if the agent waited longer than TTL and
  reused the nonce, the re-issued 402 will reuse the old nonce if the
  agent cached it. They should request a fresh requirement.

## "RPC flapping / SETTLEMENT_PENDING loops"

- Set at least two RPC providers for the chain.
- Check `limen_rpc_failures_total` for a specific provider.
- Consider switching to facilitator mode temporarily.

## "My receiving wallet balance isn't going up"

- Check that the right chain is configured.
- Check that the agent used `TransferWithAuthorization` (Base) with `to =
  your wallet`, not a third-party contract.
- On Solana, check the destination ATA is owned by your wallet for the
  correct mint.

## "Dashboard shows 0 transactions but requests are flowing"

- Postgres URL wrong, or migrations weren't run.
- Analytics buffer is in-memory; if the proxy is killed mid-batch, the
  last 500 ms of writes go to `./data/audit/*.ndjson`. Start the
  `limen-audit-ship` job.

## "Webhook never delivered"

- Check `GET /_limen/v1/webhooks/deliveries?status=failed`.
- Your endpoint must return 2xx within `webhooks.timeout_seconds` (default
  5 s). Otherwise we retry with exponential backoff for 24 h.
- HMAC header is `X-Limen-Signature: t=<ts>,v1=<hex>`. See
  `docs/webhooks.md`.

## "I can't reach /metrics from Prometheus"

- By default the metrics port (9464) is exposed only to localhost.
- In Kubernetes, the chart enables `podSelector` NetworkPolicy; make sure
  Prometheus Operator labels match.
- Authentication is not required on `/metrics` — keep it off the public
  internet.

## "Solana tx is valid but I still get INVALID_SIGNATURE"

- Make sure the agent built a **versioned** transaction, not a legacy one,
  when using ALT.
- The MemoInstruction must carry the nonce as a UTF-8 string, not base64.
- The tx must be fully signed (all required signers present) before you
  submit.

## "Base tx reverted with EIP3009Authorization: expired"

- The agent's clock is off, or `validBefore` is too short. We recommend
  agents set `validBefore = now + 300` and submit within 120 s of signing.

## "Rate limited my own admin script"

- Admin requests with a valid `X-Limen-Admin` header bypass rate limits.
- Session JWTs do not bypass; call the admin endpoints with a dedicated
  operator keypair.

## "I changed the config but nothing happened"

- `POST /_limen/v1/config/reload` or SIGHUP the proxy.
- Changes to `endpoints[].price_usdc` are effective immediately.
- Changes to `wallets.*` require a restart (deliberate, to prevent
  surprising nonce drift).

---

## Diagnostics to collect before filing an issue

- `limen doctor` full output.
- Request id(s) of failing requests.
- OTel traces if available.
- Redacted sample of `X-PAYMENT` header (keep the `from`, `to`, `chain`,
  `amount`; redact `r`, `s`, `transaction`).
- Limen version: `limen --version`.

Open an issue: <https://github.com/dhruvalgupta2003/limen/issues/new/choose>.
