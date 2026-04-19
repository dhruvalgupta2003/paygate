"""Limen Example — FastAPI.

Drops the ``LimenMiddleware`` into a FastAPI app and charges $0.001 USDC
per call on Base Sepolia. Mirrors ``examples/express-api`` route-for-route.

Run:
    export LIMEN_WALLET_BASE_SEPOLIA=0xYourReceivingAddress
    export REDIS_URL=redis://127.0.0.1:6379
    uvicorn main:app --host 0.0.0.0 --port 3000 --reload
"""

from __future__ import annotations

import os
from dataclasses import dataclass

from fastapi import FastAPI, HTTPException
from limen.fastapi import LimenMiddleware  # type: ignore[import-not-found]  # Optional dep, see pyproject.toml extras.
from pydantic import BaseModel, Field

PORT: int = int(os.environ.get("PORT", "3000"))

RECEIVING_WALLET: str | None = os.environ.get("LIMEN_WALLET_BASE_SEPOLIA")
if not RECEIVING_WALLET:
    raise RuntimeError(
        "LIMEN_WALLET_BASE_SEPOLIA is required (testnet receive-only address)."
    )

REDIS_URL: str = os.environ.get("REDIS_URL", "redis://127.0.0.1:6379")

app = FastAPI(title="limen-example-fastapi", version="0.1.0")

app.add_middleware(
    LimenMiddleware,
    wallets={"base": RECEIVING_WALLET},
    defaults={
        "chain": "base-sepolia",
        "currency": "USDC",
        "confirmations": 1,
        "payment_ttl_seconds": 300,
        "facilitator": "coinbase",
    },
    endpoints=[
        {"path": "/healthz", "price_usdc": "0"},
        {"path": "/api/v1/weather/*", "method": ["GET"], "price_usdc": "0.001"},
        {"path": "/api/v1/score", "method": ["POST"], "price_usdc": "0.001"},
    ],
    redis_url=REDIS_URL,
)


@dataclass(frozen=True)
class WeatherReading:
    city: str
    temp_c: int
    condition: str


class ScoreRequest(BaseModel):
    features: list[float] = Field(default_factory=list, max_length=1024)


class ScoreResponse(BaseModel):
    score: float
    n: int


@app.get("/healthz")
def healthz() -> dict[str, bool]:
    return {"ok": True}


@app.get("/api/v1/weather/{city}")
def weather(city: str) -> WeatherReading:
    # TODO(weather-upstream): replace stub with a real provider.
    return WeatherReading(city=city, temp_c=17, condition="partly cloudy")


@app.post("/api/v1/score", response_model=ScoreResponse)
def score(body: ScoreRequest) -> ScoreResponse:
    if not body.features:
        raise HTTPException(status_code=400, detail="features must be non-empty")
    avg = sum(body.features) / len(body.features)
    return ScoreResponse(score=round(avg, 4), n=len(body.features))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=True)
