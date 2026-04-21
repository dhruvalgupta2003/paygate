# @limen/mcp-agent

MCP server that lets an **LLM-controlled wallet** quote, sign, and pay
for x402-priced APIs through Limen — in one tool call.

The agent never sees the private key. The MCP host process loads it
from env at startup; tools only expose the public address.

## Tools

| Tool | What it does |
|---|---|
| `wallet_info` | Show the configured Base + Solana public addresses (no secrets). |
| `quote` | Fetch the URL once and return the x402 challenge (chain, asset, amount, payTo, validUntil, nonce). Useful before deciding to pay. |
| `pay_and_fetch` | Full handshake: fetch → if 402, sign authorization → re-fetch with `X-PAYMENT` → return the merchant's response. Optional `max_amount_usdc_micros` cap refuses to sign anything more expensive. |
| `directory_search` | Discover priced APIs in the Limen directory. |

## Transport

**stdio only.** The agent server holds wallet keys; exposing it over
HTTP would let anyone with the URL spend the wallet's USDC. If you
need remote access, run the agent server inside a trust boundary you
control and front it with your own auth.

## Install

```bash
npm install -g @limen/mcp-agent
```

## Wallet config

### Base / Base Sepolia

```bash
LIMEN_AGENT_BASE_PRIVATE_KEY=0x...  # 32-byte hex private key
```

The key is loaded once at startup and used to sign EIP-712
`TransferWithAuthorization` messages. The merchant's proxy verifies
the signature and (via facilitator) submits the on-chain settlement
— this server never broadcasts a transaction.

### Solana / Solana Devnet

```bash
# Either base58 64-byte secret key:
LIMEN_AGENT_SOLANA_SECRET_KEY=4ZqV...

# OR JSON array of 64 bytes (the Solana CLI's keygen format):
LIMEN_AGENT_SOLANA_SECRET_KEY='[12, 34, 56, ...]'
```

Solana flow: fetch recent blockhash → assemble a `VersionedTransaction`
with USDC SPL transfer + memo (carrying the Limen nonce) → sign → return
base64 in the `X-PAYMENT` envelope. The merchant verifies + submits.

## Claude Desktop config

`~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "limen-agent": {
      "command": "limen-mcp-agent",
      "env": {
        "LIMEN_AGENT_BASE_PRIVATE_KEY": "0x...",
        "LIMEN_AGENT_SOLANA_SECRET_KEY": "4ZqV...",
        "LIMEN_DIRECTORY_URL": "https://api.limen.dev/_limen/v1/directory"
      }
    }
  }
}
```

Then ask Claude things like:

> "Quote the price of `https://api.example.com/v1/weather/london`."
>
> "Pay for and fetch `https://api.example.com/v1/score`, but refuse to
> spend more than 5000 USDC micros."
>
> "Search the Limen directory for weather APIs."

## Safety

- **Spending cap.** Pass `max_amount_usdc_micros` to any `pay_and_fetch`
  call to refuse signing if the merchant asks for more.
- **Recipient check.** The signer rejects signing if the merchant's
  declared `mint` doesn't match the canonical USDC mint for the
  declared chain.
- **Per-chain isolation.** Missing wallet for the requested chain
  returns a clear error rather than falling back silently.

## What's NOT in v1

- Wallet rotation / per-call key selection.
- Daily/global spending budgets persisted across runs.
- Solana mainnet has not been exercised end-to-end (devnet only).
- Direct on-chain submission (we sign; the merchant submits).
