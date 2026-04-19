# limen (Python)

> x402 paywall middleware + standalone proxy for Python. USDC on Base and
> Solana. Drop-in for FastAPI, Flask, Django, Starlette.

[![pypi](https://img.shields.io/pypi/v/limen?color=5B4FE9)](https://pypi.org/project/limen/)
[![license](https://img.shields.io/badge/license-MIT-10B981)](../../LICENSE)

---

## Install

```bash
pip install limen
# With optional framework extras:
pip install "limen[fastapi]"
pip install "limen[django]"
pip install "limen[flask]"
```

Python 3.11+.

---

## FastAPI quickstart

```python
import os
from fastapi import FastAPI
from limen.fastapi import LimenMiddleware

app = FastAPI()
app.add_middleware(
    LimenMiddleware,
    wallets={"base": os.environ["LIMEN_WALLET_BASE"]},
    endpoints=[
        {"path": "/api/v1/weather/*", "price_usdc": "0.001"},
        {"path": "/api/v1/premium/**", "price_usdc": "0.05"},
    ],
    redis_url=os.environ["REDIS_URL"],
)


@app.get("/api/v1/weather/{city}")
def weather(city: str) -> dict:
    return {"city": city, "temp_c": 17}
```

## Flask

```python
from flask import Flask
from limen.flask import limen_middleware

app = Flask(__name__)
app.wsgi_app = limen_middleware(
    app.wsgi_app,
    wallets={"base": os.environ["LIMEN_WALLET_BASE"]},
    endpoints=[{"path": "/api/v1/*", "price_usdc": "0.001"}],
    redis_url=os.environ["REDIS_URL"],
)
```

## Django

`settings.py`:

```python
MIDDLEWARE = [
    "limen.django.LimenMiddleware",
    # ...
]

LIMEN = {
    "wallets": {"base": os.environ["LIMEN_WALLET_BASE"]},
    "endpoints": [{"path": "/api/v1/*", "price_usdc": "0.001"}],
    "redis_url": os.environ["REDIS_URL"],
}
```

## Standalone proxy

```bash
limen start --config limen.config.yml --upstream http://localhost:3000
```

---

## CLI

```
limen start        Run the proxy.
limen doctor       Check config + connectivity + ports.
limen verify       Verify a transaction against config.
limen config       lint | print | explain | migrate
limen keys         generate-webhook-secret | generate-admin-keypair
limen audit        verify | tail
```

---

## Security

This package enforces the nine invariants listed in
[docs/security.md § 4](../../docs/security.md#4-invariants-tested-and-monitored).
Report vulnerabilities privately — see [SECURITY.md](../../SECURITY.md).

Full getting-started, API reference, scaling, compliance docs:
[`../../docs/`](../../docs/).

---

## Development

```bash
hatch env create
hatch run test     # pytest with coverage
hatch run lint     # ruff
hatch run typecheck  # mypy strict
```

---

## License

MIT — see [LICENSE](../../LICENSE).
