#!/usr/bin/env bash
set -euo pipefail
BASE=${BASE:-http://localhost:3000}
echo "Step 1 — expect 402:"
curl -i -s "$BASE/api/v1/ping"
echo -e "\nStep 2 — agent signs USDC on Base Sepolia and retries with X-PAYMENT."
