# Limen Solana programs

Optional Anchor programs for Limen on Solana. **Not implemented in
v0.x** — the off-chain SPL verification in
`packages/limen-node/src/chains/solana.ts` is the canonical path.

When we ship the Solana program, it will mirror
`contracts/base/src/LimenReceipts.sol`:

- `commit_receipt(nonce, payer, amount, endpoint)` — PDA indexed by nonce.
- `refund_receipt(nonce, reason)` — pushes USDC from the program's ATA back
  to the payer.

Planned layout:

```
contracts/solana/
├── Anchor.toml
├── programs/limen_receipts/
│   ├── Cargo.toml
│   ├── src/lib.rs
└── tests/limen_receipts.ts
```

See the open RFC in `docs/rfcs/` (TODO — file will land before v1).
