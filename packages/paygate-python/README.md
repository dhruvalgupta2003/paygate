# paygate (Python)

> x402 paywall middleware + standalone proxy for Python. USDC on Base and
> Solana. Drop-in for FastAPI, Flask, Django, Starlette.

[![pypi](https://img.shields.io/pypi/v/paygate?color=5B4FE9)](https://pypi.org/project/paygate/)
[![license](https://img.shields.io/badge/license-MIT-10B981)](../../LICENSE)

---

## Install

```bash
pip install paygate
# With optional framework extras:
pip install "paygate[fastapi]"
pip install "paygate[django]"
pip install "paygate[flask]"
```

Python 3.11+.

---

## FastAPI quickstart

```python
import os
from fastapi import FastAPI
from paygate.fastapi import PayGateMiddleware

app = FastAPI()
app.add_middleware(
    PayGateMiddleware,
    wallets={"base": os.environ["PAYGATE_WALLET_BASE"]},
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
from paygate.flask import paygate_middleware

app = Flask(__name__)
app.wsgi_app = paygate_middleware(
    app.wsgi_app,
    wallets={"base": os.environ["PAYGATE_WALLET_BASE"]},
    endpoints=[{"path": "/api/v1/*", "price_usdc": "0.001"}],
    redis_url=os.environ["REDIS_URL"],
)
```

## Django

`settings.py`:

```python
MIDDLEWARE = [
    "paygate.django.PayGateMiddleware",
    # ...
]

PAYGATE = {
    "wallets": {"base": os.environ["PAYGATE_WALLET_BASE"]},
    "endpoints": [{"path": "/api/v1/*", "price_usdc": "0.001"}],
    "redis_url": os.environ["REDIS_URL"],
}
```

## Standalone proxy

```bash
paygate start --config paygate.config.yml --upstream http://localhost:3000
```

---

## CLI

```
paygate start        Run the proxy.
paygate doctor       Check config + connectivity + ports.
paygate verify       Verify a transaction against config.
paygate config       lint | print | explain | migrate
paygate keys         generate-webhook-secret | generate-admin-keypair
paygate audit        verify | tail
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
