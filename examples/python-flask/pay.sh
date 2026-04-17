#!/usr/bin/env bash
set -euo pipefail
BASE=${BASE:-http://localhost:3000}
echo "Step 1 — expect 402:"
curl -i -s "$BASE/api/v1/hello"
echo -e "\nStep 2 — an agent would sign an EIP-3009 auth for USDC on Base Sepolia and retry with X-PAYMENT: <base64>"
