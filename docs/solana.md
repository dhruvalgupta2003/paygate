# Solana integration

PayGate supports Solana mainnet and devnet. This doc explains the specific
choices made for SPL USDC verification, finality, priority fees, and
programs.

---

## USDC

- **Mainnet mint:** `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` (6 decimals)
- **Devnet mint:** `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`

Always verify against the constants in
`packages/paygate-node/src/chains/solana.ts` /
`packages/paygate-python/paygate/chains/solana.py`. Do not take the mint
address from the payment authorisation — it could be spoofed.

---

## Payment authorisation schema (`X-PAYMENT` on Solana)

```json
{
  "v": "1",
  "chain": "solana",
  "scheme": "exact",
  "nonce": "01J...",
  "validUntil": 1718640000,
  "payTo": "<receiver base58>",
  "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "amount": "1000",
  "transaction": "<base64 signed versioned tx>"
}
```

PayGate:

1. Decodes the transaction.
2. Verifies signatures (ed25519, via `@solana/web3.js`).
3. Verifies **no** unauthorised writable accounts are touched (the tx
   should only transfer the user's ATA → PayGate receiver's ATA + a memo).
4. Verifies the `TokenProgram::transfer` (or `TransferChecked`)
   instruction:
   - source ATA derived from `owner = signer`, `mint = configured_mint`.
   - destination ATA derived from `owner = payTo`, `mint =
     configured_mint`.
   - amount exactly matches (or exceeds) the requirement.
5. Verifies a `MemoInstruction` instruction carrying the nonce string.
6. Submits the transaction (or waits for it if already submitted) and
   waits for `commitment = confirmed` (or `finalized` over the threshold).

---

## Finality

- Default commitment: `confirmed` (≈400 ms after the block is processed by
  a supermajority of stake).
- For payments ≥ `PAYGATE_SOLANA_FINALIZED_THRESHOLD_USD` (default 100), we
  upgrade to `finalized` (~13 s). This is a tunable.
- Reorg protection: Solana doesn't reorg past a single slot in practice,
  but we still verify block inclusion via `getTransaction(commitment)`.

---

## Priority fees

Solana moves via priority fees. PayGate:

1. Samples `getRecentPrioritizationFees` over the last 50 slots.
2. Picks the 75th percentile.
3. Adds `ComputeBudgetProgram.setComputeUnitPrice` to the tx (in facilitator
   mode, this is done by the facilitator; in direct mode, by the agent).

Tuning knob: `advanced.solana.priority_fee_percentile`.

---

## Associated Token Accounts (ATAs)

- The receiver ATA is derived deterministically from
  `getAssociatedTokenAddress(mint, receiver)`.
- PayGate verifies the tx's destination ATA equals this derived address.
- If the receiver has no ATA yet, the tx must include a
  `createAssociatedTokenAccount` instruction. We count the ATA creation
  rent as part of the payment flow; the agent pays it, not the operator.

---

## Address Lookup Tables (ALTs)

- Optional. If the operator configures `advanced.solana.use_lookup_table:
  true`, PayGate publishes a lookup table containing the operator's ATAs,
  the USDC mint, and the memo program. Versioned txs reference the ALT to
  compress addresses.
- ALT ids and slots are listed in the dashboard.

---

## Programs we rely on

| Program | ID | Purpose |
|---------|-----|---------|
| Token program (classic) | `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA` | SPL token transfers |
| Token-2022 | `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb` | Token-2022 transfers (flagged) |
| Associated token program | `ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL` | ATA derivation |
| Memo v2 | `MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr` | Memo instructions |
| ComputeBudget | `ComputeBudget111111111111111111111111111111` | Priority fees |

Operators using Token-2022 USDC (mainnet uses classic SPL) must
explicitly enable it in config.

---

## Latency budget (mainnet)

| Phase | p50 | p99 |
|-------|-----|-----|
| RPC `getTransaction` | 60 ms | 180 ms |
| Signature / account checks | 2 ms | 8 ms |
| Memo + amount validation | 1 ms | 4 ms |
| Total verify | **~70 ms** | **~200 ms** |
| Wait to `confirmed` | 400 ms | 800 ms |

Facilitator mode shaves another 100–200 ms off by pushing verification to
Coinbase's edge.

---

## RPC providers we test against

- Helius
- Triton One
- QuickNode
- Alchemy (Solana)
- The public Solana Foundation RPC (dev only; rate-limited)

Configure multiple via a comma-separated `PAYGATE_SOLANA_RPC_URL`. PayGate
round-robins with weighted health checks and a 30 s cooldown on 429 / 5xx.

---

## Best practices

1. **Use dedicated RPC.** The public Solana RPC will throttle you in
   production. Pick at least two providers with SLAs.
2. **Prefer facilitator mode for sub-1¢ endpoints.** The direct-RPC path
   is robust, but facilitator mode is cheaper when traffic is high.
3. **Monitor slot lag.** `paygate_solana_slot_lag` tells you when your RPC
   falls behind; we alert at 30 slots.
4. **Set `priority_fee_percentile` to 75 for typical traffic.** Increase to
   90 on busy days (check Solana fee dashboards).
5. **Use ALTs if you see > 100 req/s.** They save ~32 bytes per tx, which
   helps the receiver ATA consistency.
6. **Avoid Token-2022 unless you need it.** Mainnet USDC is classic SPL.
7. **Rate-limit per wallet, not per IP.** Agents often share infrastructure.

---

## Common errors

| Symptom | Cause | Fix |
|---------|-------|-----|
| `AccountNotFound` on destination ATA | Receiver ATA not created | Add `createAssociatedTokenAccount` instruction |
| `InstructionError: InvalidAccountData` | Wrong mint used | Ensure mint is canonical USDC |
| `BlockhashNotFound` | tx too old | Agent must refresh blockhash within 150 slots |
| `TransactionExpired` | agent built the tx too long ago | Reduce agent's sign-to-submit latency |
| `ComputeBudgetExceeded` | too many instructions | Split into smaller txs (PayGate isn't affected; agent error) |
