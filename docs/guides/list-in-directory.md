# List your API in the public directory

The PayGate directory is how agents discover paid APIs. Listing is
opt-in, free, and you can unlist anytime.

## What gets published

- Project `name`, `slug`, optional description and homepage.
- Path patterns (not full URLs — the agent resolves the base URL from the
  directory).
- Price per endpoint (range if you use surge pricing).
- Tags + categories.
- Uptime badge (derived from health pings).

## What does NOT get published

- Your receiving wallet address.
- Your traffic volume or revenue.
- Internal endpoints not listed in `endpoints`.
- Any response body samples.

## Enable it

```yaml
discovery:
  listed: true
  categories: [weather, analytics]
  openapi_url: /openapi.json
  example_agent_prompt: |
    Get the 5-day forecast for San Francisco. Pay with USDC on Base.
```

## Ownership proof

On first submission, PayGate challenges you to sign a nonce with your
receiving wallet. This proves you control the wallet listing is tied to.

```
paygate directory submit
```

The CLI guides you through the signature (Base → EIP-191 message; Solana
→ ed25519).

## Updating and unlisting

```
paygate directory update     # re-publishes metadata
paygate directory unlist     # marks your listing hidden; retained 30 days
```

Unlisting does **not** delete historical traffic; it just hides the
marketing page.
