#!/usr/bin/env bash
# Demo: reproduce the x402 402 -> sign -> retry loop against the Next.js app.
set -euo pipefail

BASE="${BASE:-http://localhost:3000}"

echo "==> 1. GET /api/premium without payment. Expect 402."
curl -sS -i "${BASE}/api/premium" | head -n 20
echo

echo "==> 2. Decode the PaymentRequirements."
BODY=$(curl -sS "${BASE}/api/premium" || true)
if command -v jq >/dev/null 2>&1; then
  echo "${BODY}" | jq '.accepts[0] // .requirements[0] // .'
else
  echo "${BODY}"
fi
echo

cat <<'EOF'
==> 3. Agent retry.
    Sign an EIP-3009 transferWithAuthorization for 1000 USDC micros to
    PaymentRequirements.payTo, base64 the PaymentAuth, re-send with
    `X-PAYMENT: <base64>`. PayGate verifies via the facilitator and unlocks
    the handler in app/api/premium/route.ts.
EOF
