#!/usr/bin/env bash
# Prepare a release locally:
#   1. Ensure the working tree is clean.
#   2. Run changeset version + commit + tag the package bumps.
#
# Usage: ./scripts/release/prepare-release.sh
#
# Run `chmod +x scripts/release/*.sh` once after cloning.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

log() { printf '\033[1;34m[release]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[release]\033[0m %s\n' "$*" >&2; exit 1; }

[[ -n "${CI:-}" ]] || command -v pnpm >/dev/null 2>&1 || die "pnpm is required"
command -v git >/dev/null 2>&1 || die "git is required"

# Must be on main for a real release; allow override for dry runs.
branch="$(git rev-parse --abbrev-ref HEAD)"
if [[ "${ALLOW_NON_MAIN:-0}" != "1" && "$branch" != "main" ]]; then
  die "Refusing to release from branch '$branch' (override with ALLOW_NON_MAIN=1)"
fi

# Require a clean working tree.
if ! git diff --quiet || ! git diff --cached --quiet; then
  die "Working tree has uncommitted changes — commit or stash first"
fi

log "Fetching latest main"
git fetch origin main

log "Ensuring local main is up to date with origin/main"
if ! git merge-base --is-ancestor origin/main HEAD; then
  die "Local branch is not up to date with origin/main — pull first"
fi

log "Running pnpm install --frozen-lockfile"
pnpm install --frozen-lockfile

log "Bumping versions via changeset"
pnpm exec changeset version

log "Updating lockfile after version bumps"
pnpm install --lockfile-only

# Determine new root version for tag
root_version="$(node -pe "require('./package.json').version")"
node_version="$(node -pe "require('./packages/limen-node/package.json').version")"
py_version="$(python -c "import tomllib,sys; print(tomllib.loads(open('packages/limen-python/pyproject.toml','rb').read().decode())['project']['version'])")"

log "Root: v${root_version}  | node-sdk: v${node_version}  | python: v${py_version}"

log "Staging and committing release bump"
git add -A
git commit -m "chore(release): version packages

- @limen/node: ${node_version}
- limen (pypi): ${py_version}
- root: ${root_version}
"

log "Creating annotated tags"
git tag -a "v${node_version}" -m "limen v${node_version}"
if [[ "${py_version}" != "${node_version}" ]]; then
  git tag -a "limen-python-v${py_version}" -m "limen-python v${py_version}"
fi

log "Release commit + tags created. Push with:"
log "  git push origin main --follow-tags"
