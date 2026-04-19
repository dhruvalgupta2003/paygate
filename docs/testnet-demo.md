# Real testnet round-trip — Base Sepolia

End-to-end demo where an agent **actually pays USDC** to a receiving wallet
on Base Sepolia, Limen verifies the on-chain Transfer event, and the
upstream API returns its response.

Cost: ~$0.0001 in test ETH for gas + $0.001 in test USDC. All from
faucets, all worth $0.

Time: 15 minutes the first time (faucet wait), 30 seconds every time after.

---

## Prereqs

- A funded **Base Sepolia** EOA (private key in your hands).
- Some Base Sepolia ETH (for gas).
- Some Base Sepolia USDC (the thing you're paying with).

If you already have a wallet, skip to "Step 4". Otherwise:

### Step 1 — generate a wallet

```bash
node packages/limen-node/dist/cli.js keys generate-evm-key
```

Save both. The private key is a secret — only paste it into your `.env`,
never into chat / commits / dashboards.

### Step 2 — get Base Sepolia ETH (for gas)

Pick one — they all give 0.05–0.5 testnet ETH:

- <https://docs.base.org/docs/tools/network-faucets/> (Base's official list)
- <https://faucet.quicknode.com/base/sepolia>
- <https://www.alchemy.com/faucets/base-sepolia>

Paste the address from Step 1. Wait ~30 seconds.

### Step 3 — get Base Sepolia USDC

<https://faucet.circle.com/> — pick "Base Sepolia", paste your address,
solve the captcha. You'll get 10 USDC test tokens. Plenty.

### Step 4 — verify the wallet

```bash
# Replace ADDR with your address
ADDR=0x046c883149e8C099B61e5BbF2Ff52024710385Fb
curl -s https://sepolia.base.org -X POST \
  -H 'Content-Type: application/json' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_getBalance\",\"params\":[\"$ADDR\",\"latest\"]}"
# expect a non-zero hex result
```

---

## Configure Limen for Sepolia

Edit `limen.config.yml`:

```yaml
version: 1
project: { name: demo-api, slug: demo-api }
wallets:
  base-sepolia: "0xYourReceivingAddress"   # can be the same as the agent for round-trip demos
defaults:
  chain: base-sepolia
  facilitator: self                        # we're not using Coinbase's facilitator
  payment_ttl_seconds: 300
  confirmations: 1                         # 1 block on Sepolia is plenty
endpoints:
  - path: /api/v1/weather/*
    price_usdc: 0.001
```

(For a self-paying demo, use your own address as both signer **and**
receiver. The 0.001 USDC moves from you back to you, minus a couple
nanocents of gas.)

Optional: pin the RPC URL via env

```bash
export LIMEN_BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
# or your private RPC: https://base-sepolia.g.alchemy.com/v2/<your-key>
```

---

## Run the demo

Three terminals.

### Terminal 1 — fake upstream

```bash
python3 -c "
from http.server import HTTPServer, BaseHTTPRequestHandler
import json
class H(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200); self.send_header('Content-Type','application/json'); self.end_headers()
        self.wfile.write(json.dumps({'city':'San Francisco','tempC':17}).encode())
    def log_message(self, *a): pass
HTTPServer(('127.0.0.1', 3000), H).serve_forever()
"
```

### Terminal 2 — proxy (no `--dev` this time)

```bash
node packages/limen-node/dist/cli.js start --config limen.config.yml --upstream http://localhost:3000 --port 4021
```

### Terminal 3 — agent

```bash
# Generate or supply a Base Sepolia testnet private key.
# DO NOT commit a real key. Use `cast wallet new` (Foundry) or any wallet that
# can export a hex private key; fund it from https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet
export PRIVATE_KEY="0x<your-base-sepolia-test-key>"

node packages/limen-node/dist/cli.js demo \
  --upstream http://localhost:4021 \
  --endpoint /api/v1/weather/sf \
  --chain base-sepolia \
  --private-key "$PRIVATE_KEY" \
  --submit
```

> **Never commit a private key — even a testnet one.** A funded testnet key is still a key. If you cloned this repo before this change, rotate any keys that appeared in earlier history.

Expected output (~5 seconds):

```
Step 1 — GET (no payment)
  status                 402
  ...

Step 2 — sign EIP-3009 TransferWithAuthorization
  ...

Step 2.5 — submit transferWithAuthorization on-chain
  rpc                    https://sepolia.base.org
  usdc                   0x036CbD53842c5426634e7929541eC2318f3dCF7e
  submitted              0x7f3...
  waiting                1 confirmation…
  status                 success
  block                  12345678

Step 3 — retry with X-PAYMENT
  status                 200
  X-PAYMENT-RESPONSE     t=...,chain=base-sepolia,tx=,settled=1000

Response body
{"city": "San Francisco", "tempC": 17}

x402 round-trip succeeded
```

The `submitted` hash is your proof. Open it on
<https://sepolia.basescan.org/tx/0x...> to see the actual on-chain
USDC transfer.

---

## What just happened

1. Agent hits Limen → 402 with `paymentRequirements` (chain, amount, payTo, nonce, digest, validUntil).
2. Agent signs EIP-3009 `TransferWithAuthorization` for USDC.
3. Agent **submits** `transferWithAuthorization(...)` on Base Sepolia. Pays gas.
4. Agent waits for 1 confirmation.
5. Agent retries the original GET with `X-PAYMENT` containing both the signature **and** the `settlementTxHash`.
6. Limen decodes, checks signature, then **verifies the on-chain Transfer event** matches expected (from, to, value).
7. Verified → forwards to upstream → returns 200 + receipt.

This proves all 9 invariants from `docs/security.md` against real on-chain
state, not just protocol-level checks.

---

## Common errors

| You see | Why |
|---|---|
| `status 402  SETTLEMENT_PENDING` | You forgot `--submit`, or you submitted but the tx hasn't reached the configured `confirmations` count yet. Wait or lower `confirmations: 1`. |
| `status 402  AMOUNT_INSUFFICIENT  no matching USDC Transfer (...)` | Your tx went through but to the wrong address, or for the wrong amount. Check `wallets.base-sepolia` matches your `--receiver`. |
| `on-chain submission reverted` | Signature was valid but USDC reverted — usually because your `validBefore` already passed (clock skew) or the auth nonce was already used. Re-run. |
| `INVALID_SIGNATURE` | Wrong EIP-712 domain. Limen expects `name='USDC', version='2', chainId=84532`. Don't change `--chain`. |
| `RPC_UNAVAILABLE` | Public Sepolia RPC is throttled. Use Alchemy / QuickNode and pass `--rpc-url`. |

---

## Future variants

- **Mainnet** — same flow, change `chain: base` and use a real funded wallet. Use a real receiver, not yourself.
- **Coinbase facilitator** — set `defaults.facilitator: coinbase`. Skip `--submit`; the facilitator submits the tx for you (still requires the agent to have funded USDC; it just gets paymaster gas treatment).
- **Solana devnet** — coming next; tracked in `docs/roadmap.md`.
