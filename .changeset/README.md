# Changesets

This directory contains pending changes ready to be released.

- Run `pnpm changeset` to describe a change.
- At release time, `pnpm version-packages` consumes pending markdown and
  updates versions.
- `pnpm release` publishes to npm via the CI workflow.
