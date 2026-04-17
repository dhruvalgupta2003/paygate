# PayGate examples

Runnable, minimal example apps.  Each is self-contained and runs without the
rest of the monorepo.  Every example targets testnet so you can run them
without mainnet wallets.

| Example | Stack | Demonstrates |
|---------|-------|--------------|
| [`express-api/`](./express-api)               | Node + Express      | Express middleware + signed 402 |
| [`fastapi-api/`](./fastapi-api)               | Python + FastAPI    | ASGI middleware + async upstreams |
| [`nextjs-api/`](./nextjs-api)                 | Next.js App Router  | Edge middleware + route handlers |
| [`hono-api/`](./hono-api)                     | Node + Hono         | Hono plugin + streaming responses |
| [`solana-rpc-gateway/`](./solana-rpc-gateway) | Node + Hono         | Pay-per-RPC-call reselling of public Solana RPC |
| [`python-flask/`](./python-flask)             | Python + Flask      | WSGI middleware |
| [`django-drf/`](./django-drf)                 | Python + Django DRF | Django middleware + DRF views |

## Running

Most examples use `docker compose up`:

```bash
cd examples/express-api
cp .env.example .env
docker compose up -d
# hit the gateway — you'll see a 402
./pay.sh
```

## Testnet assumptions

- **Base Sepolia** USDC: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- **Solana devnet** USDC: `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`

Get devnet / Sepolia USDC from Circle's faucets or Coinbase Wallet's
faucet.

## Security

Every example is **receive-only** — no private keys are ever required.
Wallet addresses are placeholders; replace them with your own before
deploying.
