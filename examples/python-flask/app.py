"""Flask + PayGate example."""

from __future__ import annotations

import os

from flask import Flask, jsonify

from paygate.flask import paygate_middleware

app = Flask(__name__)

app.wsgi_app = paygate_middleware(
    app.wsgi_app,
    wallets={"base-sepolia": os.environ.get("PAYGATE_WALLET_BASE_SEPOLIA", "0x0000000000000000000000000000000000000001")},
    endpoints=[
        {"path": "/", "price_usdc": "0"},
        {"path": "/api/v1/hello", "price_usdc": "0.001"},
        {"path": "/api/v1/premium/*", "price_usdc": "0.05"},
    ],
    redis_url=os.environ.get("REDIS_URL"),
    default_chain="base-sepolia",
)


@app.get("/")
def index() -> object:
    return jsonify(ok=True, message="free endpoint")


@app.get("/api/v1/hello")
def hello() -> object:
    return jsonify(ok=True, message="paid via PayGate")


@app.get("/api/v1/premium/<slug>")
def premium(slug: str) -> object:
    return jsonify(slug=slug, tier="premium")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "3000")))
