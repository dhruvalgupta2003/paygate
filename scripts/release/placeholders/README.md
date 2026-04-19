# Defensive name placeholders

One-shot scripts that publish `0.0.1` placeholder releases to npm and PyPI
to reserve the `@limen/node` and `limen` names while the alpha stabilises.

The first **usable** releases will be:

| Registry | Package         | First usable version |
|----------|-----------------|----------------------|
| npm      | `@limen/node` | `0.1.0`              |
| PyPI     | `limen`       | `0.1.0`              |

Both placeholders sit under their own version range (`0.0.x`) so the real
release line stays clean.

---

## Publish — npm (`@limen/node`)

You need:

- `npm` ≥ 10
- An npm account that owns (or can create) the `@limen` scope
  (`npm org create limen` if you haven't already)
- A login: `npm login`

Run from the repo root:

```bash
cd scripts/release/placeholders/npm

# sanity: exactly index.js + package.json + README.md
npm publish --access public --tag placeholder --dry-run

# real publish (will be visible on npmjs.com immediately)
npm publish --access public --tag placeholder
```

After publish, mark the version as deprecated so users see a warning at
install time:

```bash
npm deprecate @limen/node@0.0.1 \
  "Placeholder release — install @limen/node@^0.1.0 once published. \
Until then track github.com/dhruvalgupta2003/limen."
```

`--tag placeholder` keeps the npm `latest` dist-tag empty so the placeholder
is **not** what `npm install @limen/node` resolves by default. When the
real release ships:

```bash
# from packages/limen-node, after a real build
npm publish --access public           # picks up "latest" tag automatically
npm dist-tag rm @limen/node placeholder
```

---

## Publish — PyPI (`limen`)

You need:

- `uv` ≥ 0.4 (or `pip` + `build` + `twine`)
- A PyPI account that owns (or can create) the `limen` project
- An API token: https://pypi.org/manage/account/token/

Run from the repo root:

```bash
cd scripts/release/placeholders/pypi

# build sdist + wheel
uv build           # outputs to ./dist/

# (recommended first) publish to TestPyPI to verify
uv publish --publish-url https://test.pypi.org/legacy/ \
  --token "$TEST_PYPI_TOKEN"

# real publish
uv publish --token "$PYPI_API_TOKEN"
```

PyPI does not have a deprecation API equivalent to `npm deprecate`. The
`Development Status :: 1 - Planning` classifier and the `UserWarning` raised
on import together communicate "this is a placeholder" to anyone who actually
installs it.

---

## After both publish

1. Smoke-test that the names are taken:

   ```bash
   npm view @limen/node version       # expect 0.0.1
   pip index versions limen           # expect 0.0.1
   ```

2. Update `_local/launch/CHECKLIST.md` to mark the names as claimed.

3. Re-run this script never. The next thing that goes to either registry is
   the real `0.1.0` release out of CI (`scripts/release/`-driven, post-tag).
