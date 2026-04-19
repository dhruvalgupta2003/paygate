# Getting started

From zero to earning USDC from agent traffic in under 5 minutes.

---

## Choose your path

- **[Node.js: Express](#nodejs-express)**
- **[Node.js: Fastify](#nodejs-fastify)**
- **[Node.js: Hono](#nodejs-hono)**
- **[Next.js App Router](#nextjs-app-router)**
- **[Python: FastAPI](#python-fastapi)**
- **[Python: Flask](#python-flask)**
- **[Python: Django](#python-django)**
- **[Standalone proxy](#standalone-proxy)**
- **[Docker](#docker)**
- **[Kubernetes](#kubernetes)**

---

## Prerequisites

- A receiving wallet address for each chain you want to accept.
  - Base — any Ethereum address. We recommend a Coinbase Commerce address or
    a Safe multisig.
  - Solana — any Solana address. Make sure an ATA exists for the USDC mint,
    or allow the agent to create one.
- Redis 7+ (for replay protection + rate limits).
- Optional: Postgres 15+ (for analytics), OTel collector, Prometheus.

For local dev you can use:

```bash
docker compose up redis postgres
```

---

## Node.js: Express

```bash
npm install @limen/node
```

```ts
// server.ts
import express from 'express';
import { limen } from '@limen/node/express';

const app = express();

app.use(
  limen({
    wallets: { base: process.env.LIMEN_WALLET_BASE! },
    endpoints: [
      { path: '/api/v1/weather/*', priceUsdc: '0.001' },
      { path: '/api/v1/premium/**', priceUsdc: '0.05' },
    ],
    redis: { url: process.env.REDIS_URL! },
  }),
);

app.get('/api/v1/weather/:city', (req, res) => {
  res.json({ city: req.params.city, tempC: 17 });
});

app.listen(3000);
```

---

## Node.js: Fastify

```ts
import Fastify from 'fastify';
import { limenFastify } from '@limen/node/fastify';

const app = Fastify();
await app.register(limenFastify, {
  wallets: { base: process.env.LIMEN_WALLET_BASE! },
  endpoints: [{ path: '/api/v1/*', priceUsdc: '0.001' }],
  redis: { url: process.env.REDIS_URL! },
});

app.get('/api/v1/ping', async () => ({ ok: true }));
app.listen({ port: 3000 });
```

---

## Node.js: Hono

```ts
import { Hono } from 'hono';
import { limenHono } from '@limen/node/hono';

const app = new Hono();
app.use(
  '*',
  limenHono({
    wallets: { base: process.env.LIMEN_WALLET_BASE! },
    endpoints: [{ path: '/api/v1/*', priceUsdc: '0.001' }],
    redis: { url: process.env.REDIS_URL! },
  }),
);
app.get('/api/v1/ping', (c) => c.json({ ok: true }));

export default app;
```

---

## Next.js App Router

```ts
// middleware.ts
import { limenEdge } from '@limen/node/next';

export const middleware = limenEdge({
  wallets: { base: process.env.LIMEN_WALLET_BASE! },
  endpoints: [{ path: '/api/premium/*', priceUsdc: '0.05' }],
  redisRest: { url: process.env.UPSTASH_REDIS_URL!, token: process.env.UPSTASH_REDIS_TOKEN! },
});

export const config = { matcher: ['/api/premium/:path*'] };
```

---

## Python: FastAPI

```bash
pip install limen
```

```python
# main.py
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
def weather(city: str):
    return {"city": city, "temp_c": 17}
```

Run: `uvicorn main:app --host 0.0.0.0 --port 3000`

---

## Python: Flask

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

@app.get("/api/v1/ping")
def ping():
    return {"ok": True}
```

---

## Python: Django

```python
# settings.py
MIDDLEWARE = [
    "limen.django.LimenMiddleware",
    # ...
]

LIMEN = {
    "wallets": {"base": os.environ["LIMEN_WALLET_BASE"]},
    "endpoints": [
        {"path": "/api/v1/*", "price_usdc": "0.001"},
    ],
    "redis_url": os.environ["REDIS_URL"],
}
```

---

## Standalone proxy

```bash
# 1. Create a config file
cat > limen.config.yml <<EOF
version: 1
wallets:
  base: "0xYourAddress"
defaults:
  chain: base
endpoints:
  - path: /api/v1/*
    price_usdc: 0.001
EOF

# 2. Run the proxy in front of your API
npx @limen/node start \
  --config limen.config.yml \
  --upstream http://localhost:3000 \
  --port 4021
```

Your API is now x402-enabled at `http://localhost:4021`.

---

## Docker

```bash
docker run --rm -p 4021:4021 \
  -v $(pwd)/limen.config.yml:/app/limen.config.yml:ro \
  -e LIMEN_UPSTREAM_URL=http://host.docker.internal:3000 \
  -e LIMEN_WALLET_BASE=0xYourAddress \
  -e LIMEN_REDIS_URL=redis://host.docker.internal:6379 \
  ghcr.io/limen/proxy:latest \
  start --config /app/limen.config.yml
```

---

## Kubernetes

Sample Deployment + Service in `k8s/limen.yaml` (in the repo). Key bits:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata: { name: limen-proxy }
spec:
  replicas: 3
  selector: { matchLabels: { app: limen-proxy } }
  template:
    metadata: { labels: { app: limen-proxy } }
    spec:
      securityContext: { runAsNonRoot: true, runAsUser: 10001, seccompProfile: { type: RuntimeDefault } }
      containers:
        - name: proxy
          image: ghcr.io/limen/proxy:0.1.0
          args: ["start", "--config", "/etc/limen/limen.config.yml"]
          env:
            - name: LIMEN_WALLET_BASE
              valueFrom: { secretKeyRef: { name: limen, key: wallet-base } }
            - name: LIMEN_REDIS_URL
              valueFrom: { secretKeyRef: { name: limen, key: redis-url } }
          volumeMounts:
            - { name: cfg, mountPath: /etc/limen, readOnly: true }
          ports:
            - { name: http, containerPort: 4021 }
            - { name: metrics, containerPort: 9464 }
          readinessProbe: { httpGet: { path: /readyz, port: http }, periodSeconds: 5 }
          livenessProbe:  { httpGet: { path: /livez,  port: http }, periodSeconds: 30 }
      volumes:
        - { name: cfg, configMap: { name: limen-config } }
```

---

## Verify your deployment

```bash
# Expect a 402 with PaymentRequirements
curl -i http://localhost:4021/api/v1/weather/sf

# Run built-in doctor: checks chain RPC, redis, config, listening ports
npx @limen/node doctor
```

---

## Next steps

- [Architecture](./architecture.md) — deep dive on how it works.
- [Security](./security.md) — threat model + invariants.
- [Scaling](./scaling.md) — when you get popular.
- [Dashboard](../apps/dashboard/README.md) — view revenue, alerts, usage.
- [Directory listing](./deployment.md#directory) — opt into agent discovery.
