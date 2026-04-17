## Summary

<!-- What does this change and why. 1-3 bullets. -->

## Surfaces touched

- [ ] `@paygate/node`
- [ ] `paygate` (Python)
- [ ] Dashboard
- [ ] Backend API
- [ ] Contracts
- [ ] Docs
- [ ] CI / tooling

## Test plan

- [ ] `pnpm test` passes
- [ ] `pnpm lint` + `pnpm typecheck` clean
- [ ] Manually exercised the affected flow locally
- [ ] Added or updated tests

## Risk

- [ ] Touches payment verification or settlement code
- [ ] Touches key management or cryptography
- [ ] Changes external API shape
- [ ] Changes config schema (backwards incompatible?)

## Rollout

<!-- Feature flag? Migration step? Docs update? -->

## Changeset

- [ ] `pnpm changeset` written (or not needed: docs/infra only)
