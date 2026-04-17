# PayGate Base contracts

Optional Solidity contracts for PayGate. Not required for basic operation —
the core proxy verifies settlements off-chain. These contracts support:

1. **Canonical on-chain receipts** — one immutable `Receipt` per settled
   nonce, written by the operator after off-chain verification.
2. **Escrow refunds** — pay the payer back from a pre-funded escrow when an
   upstream call fails.

---

## Install + test

```bash
cd contracts/base
forge install foundry-rs/forge-std
forge install OpenZeppelin/openzeppelin-contracts

forge build
forge test -vvv
forge coverage
```

---

## Deploy

```bash
forge script script/Deploy.s.sol \
  --rpc-url $PAYGATE_BASE_RPC_URL --broadcast --verify \
  --sig 'run(address,address,address)' \
  0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 \
  <your_receiver> \
  <multisig_admin>
```

---

## Security

- `OPERATOR_ROLE` should be a Safe multisig. Never an EOA in production.
- `PAUSER_ROLE` should be separate (emergency-stop only).
- Pre-fund the contract **before** committing any receipts if you want
  refund coverage; refunds come from the contract's own balance.
- `rescueForeignToken` cannot touch the paywall token — this is intentional
  to prevent accidental / malicious draining of payer refund escrow.
- Audit plan: this contract should be audited before mainnet use.
  See `docs/security.md § 10`.

---

## Not deployed yet

This contract is optional and not part of the default PayGate deployment.
Operators who want on-chain receipts deploy and configure it via:

```yaml
# paygate.config.yml
advanced:
  base:
    receipts_contract: "0x..."
```
