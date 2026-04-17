# paygate-api

> Backend API for the PayGate dashboard + public directory.  Hono + Drizzle
> + PostgreSQL + Redis.

Port: `4020` (HTTP) · `9464` (Prometheus).

---

## Run locally

```bash
docker compose up -d postgres redis
pnpm --filter paygate-api dev
```

Or all at once via the root `docker-compose.yml`.

---

## Env

See [`.env.example`](./.env.example). Required:

- `PAYGATE_DATABASE_URL`
- `PAYGATE_REDIS_URL`
- `PAYGATE_JWT_SECRET`
- `PAYGATE_ADMIN_SECRET`
- `PAYGATE_WEBHOOK_SIGNING_SECRET`
- `PAYGATE_DASHBOARD_URL` — CORS allowlist

---

## Migrations

```bash
psql $PAYGATE_DATABASE_URL -f migrations/0001_init.sql
psql $PAYGATE_DATABASE_URL -f migrations/0002_partitioning.sql
psql $PAYGATE_DATABASE_URL -f migrations/0003_indexes.sql
```

---

## Auth

Two accepted forms:

- **Session JWT** — dashboard users, issued after SIWE/SIWS challenge.
- **Signed admin request** — operator scripts, header format
  `X-PayGate-Admin: ed25519:<base64_pubkey>:<base64_sig>` where the sig
  covers `method + '\n' + path + '\n' + sha256(body)`.

See `src/middleware/auth.ts`.

---

## Routes

OpenAPI at `GET /_paygate/v1/openapi.json`. Human-readable index:
[docs/api-reference.md](../../docs/api-reference.md#2-admin-http).

---

## Tests

```bash
pnpm --filter paygate-api test
```

---

## License

MIT.
