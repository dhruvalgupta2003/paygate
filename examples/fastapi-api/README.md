# Limen Example — FastAPI

FastAPI app protected by `limen.fastapi.LimenMiddleware`. Charges
**$0.001 USDC per call** on **Base Sepolia**.

## 3-step quickstart

```bash
cp .env.example .env                    # fill LIMEN_WALLET_BASE_SEPOLIA
docker compose up                       # redis + fastapi + optional proxy
bash pay.sh                             # walk through the 402 -> sign -> retry
```

Local without Docker:

```bash
pip install -e ../../packages/limen-python[fastapi]
pip install fastapi "uvicorn[standard]" redis
python main.py
```

## Endpoints

| Route                         | Method | Price   |
|-------------------------------|--------|---------|
| `GET /healthz`                | GET    | free    |
| `GET /api/v1/weather/{city}`  | GET    | $0.001  |
| `POST /api/v1/score`          | POST   | $0.001  |

## Reproduce a 402

```bash
curl -i http://localhost:3000/api/v1/weather/sf
# HTTP/1.1 402 Payment Required
# content-type: application/json
# x-payment-requirements: { ... }
```

The agent then signs an EIP-3009 authorization, base64-encodes the
PaymentAuth, and retries with `X-PAYMENT`. See
[`docs/payment-flow.md`](../../docs/payment-flow.md).
