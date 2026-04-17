#!/usr/bin/env bash
# One-shot helper: prints the 402 response, then sketches the agent flow.
set -euo pipefail
ENDPOINT=${ENDPOINT:-http://localhost:4021/}

echo "Step 1 — initial request (expect 402):"
curl -i -s -X POST "$ENDPOINT" \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"getBlockHeight","id":1}'

echo -e "\n\nStep 2 — an agent would now:"
echo "  - parse the PaymentRequirements JSON"
echo "  - sign a Solana versioned tx transferring the required USDC to payTo"
echo "  - retry the same request with X-PAYMENT: <base64 auth>"
echo "See docs/payment-flow.md for the full handshake."
