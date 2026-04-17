#!/usr/bin/env bash
# Orchestrate a clean PayGate demo in one terminal so you can screen-record
# it.  Uses tmux to split into three panes.  Run with no args.
#
# Usage:
#   ./scripts/demo/record.sh        # run the full demo in tmux
#   ./scripts/demo/record.sh reset  # kill background processes, nothing else

set -euo pipefail

cd "$(dirname "$0")/../.."

UPSTREAM_PORT=3000
PROXY_PORT=4021

cleanup() {
  echo "cleaning up..."
  lsof -ti:"$UPSTREAM_PORT" 2>/dev/null | xargs -r kill 2>/dev/null || true
  lsof -ti:"$PROXY_PORT"    2>/dev/null | xargs -r kill 2>/dev/null || true
  pkill -f 'paygate-demo-upstream' 2>/dev/null || true
}

if [[ "${1:-}" == "reset" ]]; then
  cleanup
  exit 0
fi

trap cleanup EXIT

# --- start the fake upstream (silent; tagged so we can kill it) -----------
echo ">> starting upstream on :$UPSTREAM_PORT"
python3 -c "
import sys
sys.argv[0] = 'paygate-demo-upstream'
from http.server import HTTPServer, BaseHTTPRequestHandler
import json
class H(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps({'city': 'San Francisco', 'tempC': 17, 'wind_mps': 3.2}).encode())
    def log_message(self, *a): pass
HTTPServer(('127.0.0.1', $UPSTREAM_PORT), H).serve_forever()
" &
sleep 1

# --- start the proxy ------------------------------------------------------
if [[ ! -f packages/paygate-node/dist/cli.js ]]; then
  echo "!! CLI not built.  Running: pnpm --filter @paygate/node build"
  pnpm --filter @paygate/node build
fi

echo ">> starting paygate proxy on :$PROXY_PORT (dev mode)"
node packages/paygate-node/dist/cli.js start \
  --config paygate.config.yml \
  --upstream "http://localhost:$UPSTREAM_PORT" \
  --port "$PROXY_PORT" \
  --dev &
sleep 2

# --- run the demo + leave the receipt on screen --------------------------
cat <<'BANNER'
=============================================================
  PayGate x402 end-to-end demo
  Proxy:    http://localhost:4021
  Upstream: http://localhost:3000
=============================================================

BANNER

echo ">> Step 1: unpaid request (expect 402)"
echo "$ curl -i http://localhost:$PROXY_PORT/api/v1/weather/sf"
echo
curl -s -i "http://localhost:$PROXY_PORT/api/v1/weather/sf" | head -12
echo
echo "press ENTER to run the x402 agent..."
read -r _

echo ">> Step 2: agent signs EIP-3009, retries with X-PAYMENT (expect 200)"
node packages/paygate-node/dist/cli.js demo \
  --upstream "http://localhost:$PROXY_PORT" \
  --endpoint /api/v1/weather/sf \
  --chain base

echo
echo "=============================================================
  x402 round-trip complete.  Press ENTER to stop the demo."
read -r _
