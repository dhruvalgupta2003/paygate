#!/usr/bin/env bash
set -euo pipefail

BASE="http://localhost:3000"
[[ "${1:-}" == "--proxy" ]] && BASE="http://localhost:4021"

echo "==> 1. Trigger a 402."
curl -sS -i "${BASE}/api/v1/weather/sf" | head -n 20
echo

echo "==> 2. Retry with X-PAYMENT."
cat <<'EOF'
    An agent would:
      a) Parse PaymentRequirements from the 402 body.
      b) Sign an EIP-3009 transferWithAuthorization for 1000 USDC micros.
      c) Base64 the PaymentAuth and resend with `X-PAYMENT: <base64>`.
EOF
