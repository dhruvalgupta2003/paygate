# examples/solana-rpc-gateway

A thin Hono server that fronts `api.mainnet-beta.solana.com` (or your
private RPC) and charges **$0.00025** per call. Demonstrates how to
compose Limen in front of a third-party upstream.

## Run

```bash
cp .env.example .env
# Set LIMEN_WALLET_SOLANA=<your devnet address>
pnpm install
pnpm dev
```

## Test

```bash
curl -i -X POST http://localhost:4021/ \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"getBlockHeight","id":1}'
# → 402 Payment Required
./pay.sh   # shows how to sign + retry
```

## Why this is useful

Public Solana RPCs are rate-limited and free RPCs are unreliable. Reselling
a paid RPC plan at $0.00025 / call means:

- 10,000 agent calls = $2.50 revenue (≈ 10× your infra cost at most).
- Rate limits enforced per-wallet (see `rate_limits` in config) so one
  abusive agent can't burn your quota.

## Config

See [`limen.config.yml`](./limen.config.yml).

## License

MIT.
