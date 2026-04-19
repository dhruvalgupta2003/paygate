#!/usr/bin/env bash
# Demo: reproduce the x402 402 -> sign -> retry loop against the Express API.
# Usage:
#   ./pay.sh                      # hits :3000 (in-process middleware)
#   ./pay.sh --proxy              # hits :4021 (sidecar proxy)
set -euo pipefail

BASE="http://localhost:3000"
if [[ "${1:-}" == "--proxy" ]]; then
  BASE="http://localhost:4021"
fi

echo "==> 1. Hit the endpoint without payment. Expect HTTP/1.1 402."
echo "    curl -i ${BASE}/api/v1/weather/sf"
RESPONSE=$(curl -sS -i "${BASE}/api/v1/weather/sf" || true)
echo "${RESPONSE}" | head -n 20
echo

echo "==> 2. Decode the PaymentRequirements in the body."
BODY=$(echo "${RESPONSE}" | awk 'BEGIN{body=0} /^\r?$/{body=1; next} body{print}')
if command -v jq >/dev/null 2>&1; then
  echo "${BODY}" | jq '.accepts[0] // .requirements[0] // .'
else
  echo "${BODY}"
fi
echo

cat <<'EOF'
==> 3. How an agent retries.
    - Parse the PaymentRequirements from the 402 body (or the `x-payment-requirements` header).
    - Build an EIP-3009 transferWithAuthorization for $0.001 USDC to `payTo`.
    - Sign with the agent's hot wallet.
    - Base64 the resulting PaymentAuth and re-send:
        curl -H "X-PAYMENT: <base64>" ${BASE}/api/v1/weather/sf
    - The facilitator verifies + settles, Limen unlocks, your handler runs.

    See docs/payment-flow.md for the full handshake specification.
EOF
