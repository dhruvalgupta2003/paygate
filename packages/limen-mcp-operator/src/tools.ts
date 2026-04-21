/**
 * MCP tool surface for the Limen operator server.
 *
 * Extracted from `server.ts` so both the stdio entrypoint and the
 * Streamable HTTP host (./http.ts) can register identical tool sets
 * against fresh `McpServer` instances.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { LimenApiError, LimenClient } from './client.js';

interface ToolResult {
  [key: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

function ok(data: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function fail(message: string): ToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

async function call<T>(fn: () => Promise<T>): Promise<ToolResult> {
  try {
    return ok(await fn());
  } catch (err) {
    if (err instanceof LimenApiError) {
      return fail(`Limen API error ${err.status} ${err.code}: ${err.message}`);
    }
    return fail(`Unexpected error: ${(err as Error).message}`);
  }
}

export function registerOperatorTools(server: McpServer, client: LimenClient): void {
  server.registerTool(
    'limen_config',
    {
      title: 'Show Limen MCP config',
      description: 'Returns the API URL and whether an API key is configured.',
      inputSchema: {},
    },
    async () => ok(client.configSummary()),
  );

  server.registerTool(
    'list_transactions',
    {
      title: 'List recent x402 transactions',
      description:
        'List recent transactions through the Limen gateway. Filter by status, chain, or paginate via cursor.',
      inputSchema: {
        limit: z.number().int().min(1).max(200).default(50),
        status: z
          .enum(['pending', 'settled', 'refunded', 'reorged', 'upstream_failed'])
          .optional(),
        chain: z.string().optional(),
        cursor: z.string().optional(),
      },
    },
    async (args) =>
      call(() =>
        client.request('GET', '/transactions', {
          query: args as Record<string, unknown>,
        }),
      ),
  );

  server.registerTool(
    'get_transaction',
    {
      title: 'Get a transaction by id',
      description: 'Fetch a single transaction record by its UUID.',
      inputSchema: { id: z.string().uuid() },
    },
    async ({ id }) => call(() => client.request('GET', `/transactions/${id}`)),
  );

  server.registerTool(
    'list_endpoints',
    {
      title: 'List configured endpoints',
      description: 'Endpoints registered with the Limen proxy and their pricing.',
      inputSchema: {},
    },
    async () => call(() => client.request('GET', '/endpoints')),
  );

  server.registerTool(
    'list_agents',
    {
      title: 'List paying agents',
      description: 'Wallets that have paid for x402 endpoints, ranked by spend.',
      inputSchema: {},
    },
    async () => call(() => client.request('GET', '/agents')),
  );

  server.registerTool(
    'list_api_keys',
    {
      title: 'List admin API keys',
      description: 'List server-to-server API keys (masked; secrets never returned).',
      inputSchema: {},
    },
    async () => call(() => client.request('GET', '/keys')),
  );

  server.registerTool(
    'create_api_key',
    {
      title: 'Create an admin API key',
      description:
        'Mint a new lk_<prefix>_<secret> API key. The plaintext secret is returned ONCE; capture it immediately.',
      inputSchema: {
        name: z
          .string()
          .trim()
          .min(1)
          .max(80)
          .describe('Human-readable label visible in audit logs.'),
        role: z.enum(['viewer', 'admin', 'owner']).default('admin'),
      },
    },
    async (args) => call(() => client.request('POST', '/keys', { body: args })),
  );

  server.registerTool(
    'revoke_api_key',
    {
      title: 'Revoke an admin API key',
      description: 'Mark an API key as revoked so future requests with it fail with 401.',
      inputSchema: { id: z.string().uuid() },
    },
    async ({ id }) => call(() => client.request('DELETE', `/keys/${id}`)),
  );

  server.registerTool(
    'get_billing_state',
    {
      title: 'Get current billing state',
      description:
        'Returns Stripe customer link, subscription status, current-period usage (settled tx count + USDC volume).',
      inputSchema: {},
    },
    async () => call(() => client.request('GET', '/billing')),
  );

  server.registerTool(
    'set_billing_customer',
    {
      title: 'Link or create a Stripe customer for the current project',
      description:
        'Attaches an existing Stripe customer (cus_…) to the project, OR creates a new Stripe customer when stripe_customer_id is omitted (requires STRIPE_BILLING_ENABLED=true on the API).',
      inputSchema: {
        stripe_customer_id: z
          .string()
          .regex(/^cus_[A-Za-z0-9]+$/)
          .optional(),
        email: z.string().email().optional(),
      },
    },
    async (args) =>
      call(() => client.request('POST', '/billing/customer', { body: args })),
  );

  server.registerTool(
    'open_billing_portal',
    {
      title: 'Get a Stripe Billing Portal URL',
      description:
        'Returns a one-time Stripe Customer Portal URL the operator can open in a browser.',
      inputSchema: {},
    },
    async () => call(() => client.request('POST', '/billing/portal')),
  );

  server.registerTool(
    'analytics_summary',
    {
      title: 'Analytics summary',
      description:
        'Revenue, request count, active wallets, verify p99 latency, and top endpoints/agents over a time range.',
      inputSchema: { range: z.enum(['1h', '24h', '7d', '30d', '90d']).default('24h') },
    },
    async (args) =>
      call(() =>
        client.request('GET', '/analytics/summary', {
          query: args as Record<string, unknown>,
        }),
      ),
  );

  server.registerTool(
    'analytics_timeseries',
    {
      title: 'Analytics time series',
      description: 'Revenue or request count time series.',
      inputSchema: {
        metric: z.enum([
          'revenue_usdc',
          'requests_total',
          'verify_failures_total',
          'rate_limit_drops_total',
        ]),
        step: z.enum(['1m', '5m', '1h', '1d']).default('1h'),
        range: z.enum(['1h', '24h', '7d', '30d', '90d']).default('24h'),
      },
    },
    async (args) =>
      call(() =>
        client.request('GET', '/analytics/timeseries', {
          query: args as Record<string, unknown>,
        }),
      ),
  );

  server.registerTool(
    'list_compliance_events',
    {
      title: 'List compliance events',
      description: 'Recent sanctions / geo / travel-rule events.',
      inputSchema: {
        kind: z.enum(['sanctions', 'geo', 'travel_rule']).optional(),
        limit: z.number().int().min(1).max(200).default(50),
      },
    },
    async (args) =>
      call(() =>
        client.request('GET', '/compliance/events', {
          query: args as Record<string, unknown>,
        }),
      ),
  );

  server.registerTool(
    'list_webhooks',
    {
      title: 'List configured outbound webhooks',
      description: 'Webhook subscriptions and their delivery health.',
      inputSchema: {},
    },
    async () => call(() => client.request('GET', '/webhooks')),
  );

  server.registerResource(
    'limen-config',
    'limen://config',
    {
      title: 'Limen MCP configuration',
      description: 'API URL + auth state for this MCP server instance.',
      mimeType: 'application/json',
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(client.configSummary(), null, 2),
        },
      ],
    }),
  );
}
