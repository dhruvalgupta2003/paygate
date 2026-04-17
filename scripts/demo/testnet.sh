#!/usr/bin/env bash
# Runs the full Base Sepolia x402 round-trip with --submit.
# Usage:  PRIVATE_KEY=0x... ./scripts/demo/testnet.sh
#   or :  ./scripts/demo/testnet.sh 0x...

set -euo pipefail
cd "$(dirname "$0")/../.."

PK="${1:-${PRIVATE_KEY:-}}"
if [[ -z "$PK" ]]; then
  echo "Pass the private key as arg 1, or export PRIVATE_KEY."
  echo "  ./scripts/demo/testnet.sh 0xYOUR_KEY"
  exit 1
fi

UPSTREAM="${UPSTREAM:-http://localhost:3000}"
PROXY="${PROXY:-http://localhost:4021}"
ENDPOINT="${ENDPOINT:-/api/v1/weather/sf}"

exec node packages/paygate-node/dist/cli.js demo \
  --upstream "$PROXY" \
  --endpoint "$ENDPOINT" \
  --chain base-sepolia \
  --private-key "$PK" \
  --submit
