# @limen/mcp-operator

MCP server exposing the **Limen admin API** as tools for LLM clients
(Claude Desktop, Claude Code, Cursor, Continue, …).

Lets a developer ask: *"show me last 24h of failed payments on
base-sepolia"*, *"create a viewer-role API key for prod-billing-worker"*,
or *"what's our current Stripe billing state?"* — and have the model
call the matching admin endpoint via MCP.

## Tools (16)

| Tool | What it does |
|---|---|
| `limen_config` | Show the API URL + whether an API key is configured. |
| `list_transactions` | List recent x402 transactions, filterable by status / chain. |
| `get_transaction` | Fetch a single tx by UUID. |
| `list_endpoints` | Endpoints registered with the proxy. |
| `list_agents` | Wallets that have paid, ranked by spend. |
| `list_api_keys` | List server-to-server API keys (masked). |
| `create_api_key` | Mint a new `lk_<prefix>_<secret>` key (returned ONCE). |
| `revoke_api_key` | Revoke an issued key. |
| `get_billing_state` | Stripe link, subscription status, current-period usage. |
| `set_billing_customer` | Attach an existing `cus_…` or mint a new Stripe customer. |
| `open_billing_portal` | One-time Stripe Customer Portal URL. |
| `analytics_summary` | Revenue + requests + active wallets over a time range. |
| `analytics_timeseries` | Time series for a chosen metric. |
| `list_compliance_events` | Recent sanctions / geo / travel-rule events. |
| `list_webhooks` | Configured outbound webhooks + delivery health. |
| (resource) `limen://config` | Read-only view of the server's config. |

## Two transports

### 1. **stdio** — local clients (Claude Desktop / Claude Code / Cursor)

```bash
npm install -g @limen/mcp-operator
```

`~/.config/claude/claude_desktop_config.json` (or your client's MCP config):

```json
{
  "mcpServers": {
    "limen": {
      "command": "limen-mcp-operator",
      "env": {
        "LIMEN_API_URL": "https://api.your-host.example",
        "LIMEN_API_KEY": "lk_abc12345_yourSecretHere"
      }
    }
  }
}
```

Auth is whatever the OS process boundary provides — the model sees only
the public address, never the key.

### 2. **Streamable HTTP** — remote / multi-tenant deployment

Binary: `limen-mcp-operator-http` (also `npm start:http`). Exposes
`/mcp` for the MCP Streamable HTTP transport plus discovery + OAuth
endpoints when in `oauth` mode.

```bash
LIMEN_MCP_HTTP_PORT=4030 \
LIMEN_MCP_AUTH_MODE=oauth \
LIMEN_MCP_JWT_SECRET="$(openssl rand -base64 48)" \
LIMEN_MCP_ISSUER=https://mcp.your-host.example \
limen-mcp-operator-http
```

## Auth modes

`LIMEN_MCP_AUTH_MODE` controls how the HTTP transport authenticates:

### `none` *(default — dev only)*

Open access. Boots immediately, useful for local testing.
**Never expose this beyond loopback.**

### `static_bearer`

A single shared bearer token. Easiest mode for single-tenant
self-hosted deployments.

```bash
LIMEN_MCP_AUTH_MODE=static_bearer \
LIMEN_MCP_BEARER_TOKEN="$(openssl rand -base64 32)" \
limen-mcp-operator-http
```

Clients send `Authorization: Bearer <token>` on every `/mcp` request.

### `oauth` *(OAuth 2.1 + Dynamic Client Registration)*

Full spec compliance. Implements:

- **RFC 8414** — `/.well-known/oauth-authorization-server`
- **MCP spec** — `/.well-known/oauth-protected-resource`
- **RFC 7591** — `POST /register` (Dynamic Client Registration)
- **OAuth 2.1** — `/authorize` + `/token` with **PKCE required (S256)**
- HS256-signed JWT access tokens via `jose`
- One-time auth code use, expired-code rejection
- 401 responses include `WWW-Authenticate` with `resource_metadata`
  pointer so MCP clients can auto-discover the auth server

```bash
LIMEN_MCP_AUTH_MODE=oauth \
LIMEN_MCP_JWT_SECRET="$(openssl rand -base64 48)" \
LIMEN_MCP_ISSUER=https://mcp.your-host.example \
limen-mcp-operator-http
```

Walk-through (curl):

```bash
ISS=https://mcp.your-host.example

# 1. Register a client (DCR — no API key needed)
REG=$(curl -sS -X POST $ISS/register \
  -H 'content-type: application/json' \
  -d '{"client_name":"my-cli","redirect_uris":["http://localhost:4444/cb"],"token_endpoint_auth_method":"none"}')
CLIENT_ID=$(echo "$REG" | jq -r .client_id)

# 2. PKCE
VERIFIER=$(node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))")
CHALLENGE=$(node -e "console.log(require('crypto').createHash('sha256').update('$VERIFIER').digest('base64url'))")

# 3. Authorize → returns a redirect with ?code=…
LOC=$(curl -sS -o /dev/null -w '%{redirect_url}' \
  "$ISS/authorize?response_type=code&client_id=$CLIENT_ID&redirect_uri=http://localhost:4444/cb&code_challenge=$CHALLENGE&code_challenge_method=S256&scope=mcp&state=xyz")
CODE=$(echo "$LOC" | sed -E 's/.*code=([^&]+).*/\1/')

# 4. Exchange code for JWT
TOK=$(curl -sS -X POST $ISS/token \
  -H 'content-type: application/json' \
  -d "{\"grant_type\":\"authorization_code\",\"code\":\"$CODE\",\"redirect_uri\":\"http://localhost:4444/cb\",\"client_id\":\"$CLIENT_ID\",\"code_verifier\":\"$VERIFIER\"}")
JWT=$(echo "$TOK" | jq -r .access_token)

# 5. Call MCP
curl -sS -X POST $ISS/mcp \
  -H "authorization: Bearer $JWT" \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{...}}'
```

#### Storage

Clients + auth codes default to in-memory (single process). Plug a
Postgres-backed `OAuthStore` for multi-replica deployments — see
`OAuthProvider`'s `store` constructor option.

#### Optional knobs

| Env | Default | Purpose |
|---|---|---|
| `LIMEN_MCP_HTTP_PORT` | `4030` | Listen port. |
| `LIMEN_MCP_HTTP_HOST` | `0.0.0.0` | Bind interface. |
| `LIMEN_MCP_OAUTH_AUTO_APPROVE` | `true` | Skip the consent UI; required `false` once you wire human consent. |
| `LIMEN_MCP_DEFAULT_SUBJECT` | `mcp-operator` | `sub` claim for auto-approved sessions. |

## What's NOT in v1

- **Refresh tokens** — issue short-lived access tokens; re-auth as needed.
- **Per-client rate limiting** — front the host with your existing
  reverse proxy / WAF.
- **Encrypted-at-rest storage** — operator's responsibility.
- **Consent UI** — `autoApprove: true` is the only path today.
