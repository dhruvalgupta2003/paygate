#!/usr/bin/env bash
# Post-publish sanity check. Confirms that the version in the npm registry
# matches the version in packages/limen-node/package.json.
#
# Usage: ./scripts/release/verify-release.sh
#
# Exits non-zero if the registry version differs or is missing.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

log() { printf '\033[1;34m[verify]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[verify]\033[0m %s\n' "$*" >&2; exit 1; }

command -v node >/dev/null 2>&1 || die "node is required"
command -v npm  >/dev/null 2>&1 || die "npm is required"

expected="$(node -pe "require('./packages/limen-node/package.json').version")"
[[ -n "$expected" ]] || die "Could not read @limen/node version"

log "Expected @limen/node version: ${expected}"

attempt=1
max_attempts="${VERIFY_MAX_ATTEMPTS:-8}"
sleep_seconds="${VERIFY_SLEEP_SECONDS:-15}"
published=""

while (( attempt <= max_attempts )); do
  log "Querying npm registry (attempt ${attempt}/${max_attempts})..."
  set +e
  published="$(npm view @limen/node@"$expected" version 2>/dev/null || true)"
  set -e

  if [[ "$published" == "$expected" ]]; then
    log "Registry shows @limen/node@${published} — OK"
    break
  fi

  attempt=$((attempt + 1))
  sleep "$sleep_seconds"
done

if [[ "$published" != "$expected" ]]; then
  die "Registry version (${published:-missing}) != expected (${expected})"
fi

# Also confirm provenance attestation is present.
log "Checking provenance metadata"
attestations="$(npm view @limen/node@"$expected" --json 2>/dev/null | node -e "
const j = JSON.parse(require('fs').readFileSync(0,'utf8'));
const k = j?.dist?.attestations;
process.stdout.write(k ? JSON.stringify(k) : '');
")"

if [[ -z "$attestations" ]]; then
  log "WARNING: provenance attestations not yet visible — may still be propagating"
else
  log "Provenance OK: $attestations"
fi

log "verify-release completed"
