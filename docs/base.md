# Base integration

Base is Coinbase's L2. Limen treats Base as the default home of USDC for
agent payments because:

- Fees are near-zero ($0.0001–0.001 per transfer).
- Coinbase operates the facilitator on Base.
- USDC on Base implements `EIP-3009` (gasless transfer auth).
- Block time is 2 s; 2-block confirmations give ~4 s settle time.

---

## USDC

- **Mainnet:** `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (6 decimals)
- **Base Sepolia (test):** `0x036CbD53842c5426634e7929541eC2318f3dCF7e`

Constants live in `packages/limen-node/src/chains/base.ts` /
`limen/chains/base.py`.

---

## Payment authorisation schema (`X-PAYMENT` on Base)

```json
{
  "v": "1",
  "chain": "base",
  "scheme": "exact",
  "nonce": "01J...",
  "validUntil": 1718640000,
  "payTo": "0x...",
  "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "amount": "1000",
  "authorization": {
    "from": "0x...",
    "to": "0x...",
    "value": "1000",
    "validAfter": 1718639700,
    "validBefore": 1718640000,
    "nonce": "0x...",
    "v": 27,
    "r": "0x...",
    "s": "0x..."
  }
}
```

Limen:

1. Recovers the signer via `recoverTypedDataAddress` against USDC's
   EIP-712 domain:
   ```
   { name: "USD Coin", version: "2", chainId: 8453, verifyingContract:
     "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" }
   ```
2. Verifies the recovered signer equals `authorization.from`.
3. Verifies `to == configured_wallet[base]`.
4. Verifies `value >= required_amount`.
5. Verifies `validAfter ≤ now ≤ validBefore`.
6. Verifies the `nonce` (bytes32 on-chain) has not been used at
   `USDC.authorizationState(from, nonce)`.
7. Submits the tx via
   `USDC.transferWithAuthorization(from,to,value,validAfter,validBefore,nonce,v,r,s)`
   and waits for `confirmations_base` blocks.
8. On revert → `SETTLEMENT_FAILED` + refundable retry window.

---

## Modes

- **Signed authorisation (default).** The agent signs, Limen submits.
  Limen pays gas (a few thousandths of a cent). This is the best UX —
  the agent doesn't need ETH.
- **Direct transfer.** The agent submits its own USDC transfer with the
  nonce in the calldata. Limen verifies the on-chain transfer event.
- **Permit2.** Optional, for advanced flows where one approval covers
  multiple endpoints. Disabled by default.

---

## Confirmations

- Default: 2 blocks (~4 s).
- For payments ≥ `LIMEN_BASE_HIGH_VALUE_THRESHOLD_USD` (default 1000), we
  wait for 10 blocks.
- Base inherits Ethereum L1 finality after about 15 min (batch posting).
  We treat 2 blocks as economically final for micropayments because the
  marginal cost of a reorg attack massively exceeds any single
  sub-dollar payment.

---

## Reorg handling

- Limen listens for `newHeads` events and compares seen block hashes.
- If a settled tx disappears from canonical history:
  - Mark `transactions.status = "reorged"`.
  - Emit `payment.reorged` webhook.
  - Attempt re-submission if the authorisation is still within TTL.
  - If the authorisation has expired, the operator must chase manually.

---

## Gas and fees

- Limen pays gas by default. The typical tx is ~45,000 gas.
- At 1 gwei base fee (Base is typically 0.1–1 gwei) and ETH at $3000, that
  is ~$0.0001 per payment.
- Operators can opt into `ethereum_payer.agent_pays: true` to push gas to
  the agent; the agent then submits their own transfer.

---

## RPC providers we test against

- Coinbase Cloud (Base Node)
- Alchemy (Base)
- QuickNode (Base)
- Public Base RPC (`https://mainnet.base.org`) — rate-limited, dev only
- Ankr (Base)

Configure multiple via comma-separated `LIMEN_BASE_RPC_URL`. Weighted
round-robin with cooldown on 429 / 5xx.

---

## Latency budget (mainnet)

| Phase | p50 | p99 |
|-------|-----|-----|
| Signature recover | 1 ms | 5 ms |
| `authorizationState` call | 60 ms | 200 ms |
| Submit + wait 2 blocks | 4 s | 6 s |
| Total | **~4.1 s** | **~6.2 s** |

Facilitator mode skips the submit/wait and returns verified + settled in
~250 ms.

---

## Common errors

| Symptom | Cause | Fix |
|---------|-------|-----|
| `EIP3009Authorization: authorization is expired` | `validBefore` in the past | Agent must sign shorter-lived auth |
| `EIP3009Authorization: invalid signature` | domain mismatch or wrong address | Verify EIP-712 domain (`USD Coin`, `v2`, chainId 8453, USDC address) |
| `EIP3009Authorization: authorization is used or cancelled` | nonce reused | Agent must pick a new nonce |
| `Gas required exceeds allowance` | gas price spike | Increase `base.gas_multiplier` (default 1.25) |
| `Transaction underpriced` | local mempool / RPC mismatch | Use a priority fee ≥ 0.001 gwei |

---

## Best practices

1. **Use Coinbase's facilitator in production.** It handles submission,
   settlement, and reorg replay for you.
2. **Keep authorisation TTL short (≤ 5 min).** Long-lived authorisations
   are replay risk; short-lived ones also help reorg recovery.
3. **Prefer signed authorisation over direct transfer.** It's gasless for
   the agent and removes the need for the agent to hold ETH.
4. **Monitor the balance of your configured wallet.** If it's missing a
   few ETH for gas on direct-mode APIs, you'll rack up failed submissions.
5. **Don't trust block.timestamp alone.** Always use the RPC's
   `eth_getBlockByNumber('latest')` or a trusted NTP source for time
   checks; we do both.
