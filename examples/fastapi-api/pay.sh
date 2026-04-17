#!/usr/bin/env bash
# Demo: reproduce the x402 402 -> sign -> retry loop against the FastAPI app.
set -euo pipefail

BASE="http://localhost:3000"
if [[ "${1:-}" == "--proxy" ]]; then
  BASE="http://localhost:4021"
fi

echo "==> 1. Trigger a 402."
curl -sS -i "${BASE}/api/v1/weather/sf" | head -n 20
echo

echo "==> 2. Post to the scoring endpoint (also gated)."
curl -sS -i -X POST \
  -H "content-type: application/json" \
  -d '{"features":[0.2,0.3,0.5]}' \
  "${BASE}/api/v1/score" | head -n 20
echo

cat <<'EOF'
==> 3. How an agent retries.
    - Parse PaymentRequirements from the 402 body.
    - Sign an EIP-3009 transferWithAuthorization for 1000 USDC micros to `payTo`.
    - Retry with `X-PAYMENT: <base64 PaymentAuth>`.
EOF
