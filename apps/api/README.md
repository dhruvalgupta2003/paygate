# limen-api

> Backend API for the Limen dashboard + public directory.  Hono + Drizzle
> + PostgreSQL + Redis.

Port: `4020` (HTTP) · `9464` (Prometheus).

---

## Run locally

```bash
docker compose up -d postgres redis
pnpm --filter limen-api dev
```

Or all at once via the root `docker-compose.yml`.

---

## Env

See [`.env.example`](./.env.example). Required:

- `LIMEN_DATABASE_URL`
- `LIMEN_REDIS_URL`
- `LIMEN_JWT_SECRET`
- `LIMEN_ADMIN_SECRET`
- `LIMEN_WEBHOOK_SIGNING_SECRET`
- `LIMEN_DASHBOARD_URL` — CORS allowlist

---

## Migrations

```bash
psql $LIMEN_DATABASE_URL -f migrations/0001_init.sql
psql $LIMEN_DATABASE_URL -f migrations/0002_partitioning.sql
psql $LIMEN_DATABASE_URL -f migrations/0003_indexes.sql
```

---

## Auth

Two accepted forms:

- **Session JWT** — dashboard users, issued after SIWE/SIWS challenge.
- **Signed admin request** — operator scripts, header format
  `X-Limen-Admin: ed25519:<base64_pubkey>:<base64_sig>` where the sig
  covers `method + '\n' + path + '\n' + sha256(body)`.

See `src/middleware/auth.ts`.

---

## Routes

OpenAPI at `GET /_limen/v1/openapi.json`. Human-readable index:
[docs/api-reference.md](../../docs/api-reference.md#2-admin-http).

---

## Tests

```bash
pnpm --filter limen-api test
```

---

## License

MIT.
