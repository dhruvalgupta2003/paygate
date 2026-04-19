# limen

> **Placeholder release.** The real SDK ships at `0.1+`.

Limen is an x402 paywall for AI agent traffic — drop-in middleware for
FastAPI, Flask, Django, and Starlette, and a standalone proxy that charges
USDC per API call on Base or Solana with no account, no API keys, and no
invoicing.

The active codebase is here:

**https://github.com/dhruvalgupta2003/limen**

This `0.0.1` release reserves the package name on PyPI while the public
developer alpha stabilises. The first usable release will be
`limen==0.1.0`.

To use the alpha today, install from source:

```bash
git clone https://github.com/dhruvalgupta2003/limen
cd limen/packages/limen-python
uv sync && uv pip install -e .
```

License: MIT.
