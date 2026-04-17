# Accept both Base and Solana payments

Serve the same endpoints to agents on either chain. Agents pick whichever
they hold USDC on.

```yaml
version: 1
project: { name: my-api, slug: my-api }

wallets:
  base:   "0xYourEvmAddress"
  solana: "YourSolanaAddress"

defaults:
  chain: base            # default if the agent doesn't express a preference
  facilitator: coinbase  # works for both chains

endpoints:
  - path: /api/v1/**
    price_usdc: 0.0005
```

## How agents choose

When PayGate issues a 402, it includes a single `chain` the agent must
pay on. To offer multiple chains, the agent asks for a specific one via
`Accept-Chain: solana` on the initial request. PayGate then issues the
402 for that chain (falling back to `defaults.chain`).

```bash
curl -i -H 'Accept-Chain: solana' http://localhost:4021/api/v1/foo
```

## Per-endpoint override

Pricier endpoints can force a specific chain:

```yaml
endpoints:
  - path: /api/v1/bulk/**
    price_usdc: 5.00
    chain: base          # bigger settle, prefer confirmations on Base
```

## Monitoring

The dashboard splits revenue by chain. You can see the mix and re-price
accordingly. If Solana is > 70% of your traffic, consider lowering the
USDC amount on Solana endpoints (`price.chain_overrides`) since Solana
micropayments are economical.
