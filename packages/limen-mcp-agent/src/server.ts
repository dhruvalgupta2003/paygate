/**
 * Limen Agent MCP server.
 *
 * Lets an LLM-controlled wallet quote, sign, and pay for x402-priced APIs
 * through Limen.  The wallet's private key is loaded from env at startup
 * (operator-controlled MCP client config) and is NEVER exposed through
 * the model context — tools only see the wallet's public address.
 *
 * Tools:
 *   - wallet_info             — show configured wallet addresses
 *   - quote(url, method?)     — fetch the x402 challenge for an endpoint
 *   - pay_and_fetch(url, ...) — full sign+settle+fetch dance, returns the
 *                                merchant's response body
 *   - directory_search(q?)    — discover priced APIs in the Limen directory
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  buildEvmXPayment,
  buildSolanaXPayment,
  fetchWithPayment,
  quote,
  type PaymentRequirements,
} from './x402.js';
import { loadBaseWallet, loadSolanaWallet } from './wallet.js';

const baseWallet = (() => {
  try {
    return loadBaseWallet();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[limen-mcp-agent] base wallet config error:', (err as Error).message);
    return null;
  }
})();

const solanaWallet = (() => {
  try {
    return loadSolanaWallet();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[limen-mcp-agent] solana wallet config error:', (err as Error).message);
    return null;
  }
})();

const directoryUrl = (
  process.env['LIMEN_DIRECTORY_URL'] ?? 'http://localhost:4020/_limen/v1/directory'
).replace(/\/+$/, '');

const server = new McpServer({
  name: 'limen-agent',
  version: '0.1.0',
});

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

// -------------------------------------------------------------------------
// wallet_info — what we'd sign with, and on which chains
// -------------------------------------------------------------------------

server.registerTool(
  'wallet_info',
  {
    title: 'Show configured agent wallets',
    description:
      'Returns the public addresses of the wallets this MCP server can sign with. Private keys are NEVER exposed through this tool.',
    inputSchema: {},
  },
  async () =>
    ok({
      base: baseWallet
        ? { configured: true, address: baseWallet.account.address }
        : { configured: false, hint: 'set LIMEN_AGENT_BASE_PRIVATE_KEY=0x… to enable Base.' },
      solana: solanaWallet
        ? { configured: true, address: solanaWallet.publicKey }
        : {
            configured: false,
            hint: 'set LIMEN_AGENT_SOLANA_SECRET_KEY=<base58 64-byte> to enable Solana.',
          },
    }),
);

// -------------------------------------------------------------------------
// quote — fetch a 402 without paying
// -------------------------------------------------------------------------

server.registerTool(
  'quote',
  {
    title: 'Quote the price of a Limen-protected endpoint',
    description:
      'Fetch the URL once and return the x402 paymentRequirements (chain, asset, amount, payTo, validUntil, nonce). Useful before deciding to actually pay.',
    inputSchema: {
      url: z.string().url(),
      method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).default('GET'),
      body: z.unknown().optional().describe('Optional JSON body for POST/PUT/PATCH.'),
      headers: z
        .record(z.string())
        .optional()
        .describe('Extra request headers (avoid setting X-PAYMENT here).'),
    },
  },
  async (args) => {
    try {
      const q = await quote({
        url: args.url,
        method: args.method,
        body: args.body,
        ...(args.headers !== undefined ? { headers: args.headers } : {}),
      });
      return ok(q);
    } catch (err) {
      return fail(`quote failed: ${(err as Error).message}`);
    }
  },
);

// -------------------------------------------------------------------------
// pay_and_fetch — full x402 dance
// -------------------------------------------------------------------------

server.registerTool(
  'pay_and_fetch',
  {
    title: 'Pay for and fetch a Limen-protected endpoint',
    description:
      'Perform the full x402 handshake: fetch URL → if 402, sign an authorization with the configured wallet for the requested chain → re-fetch with X-PAYMENT → return the merchant response. If the endpoint is free (no 402), just returns the response.',
    inputSchema: {
      url: z.string().url(),
      method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).default('GET'),
      body: z.unknown().optional(),
      headers: z.record(z.string()).optional(),
      max_amount_usdc_micros: z
        .string()
        .regex(/^\d+$/)
        .optional()
        .describe(
          'Optional cap on the amount this payment is allowed to cost (in USDC micros). If the merchant asks for more, the tool refuses to sign.',
        ),
    },
  },
  async (args) => {
    try {
      const initial = await quote({
        url: args.url,
        method: args.method,
        body: args.body,
        ...(args.headers !== undefined ? { headers: args.headers } : {}),
      });

      // Free / no 402 — return the merchant response directly.
      const reqMaybe = initial.paymentRequirements;
      if (initial.status !== 402 || reqMaybe === undefined) {
        return ok({ paid: false, ...initial });
      }
      const req: PaymentRequirements = reqMaybe;

      // Spending cap.
      if (args.max_amount_usdc_micros !== undefined) {
        if (BigInt(req.amount) > BigInt(args.max_amount_usdc_micros)) {
          return fail(
            `merchant requested ${req.amount} micros but max_amount_usdc_micros cap is ${args.max_amount_usdc_micros}; refusing to sign`,
          );
        }
      }

      // Sign per chain.
      let xPayment: string;
      if (req.chain === 'base' || req.chain === 'base-sepolia') {
        if (!baseWallet) {
          return fail(
            `merchant requires payment on ${req.chain} but no Base wallet is configured (set LIMEN_AGENT_BASE_PRIVATE_KEY)`,
          );
        }
        xPayment = await buildEvmXPayment(req, baseWallet);
      } else if (req.chain === 'solana' || req.chain === 'solana-devnet') {
        if (!solanaWallet) {
          return fail(
            `merchant requires payment on ${req.chain} but no Solana wallet is configured (set LIMEN_AGENT_SOLANA_SECRET_KEY)`,
          );
        }
        xPayment = await buildSolanaXPayment(req, solanaWallet.keypair);
      } else {
        return fail(`unsupported chain: ${req.chain}`);
      }

      // Re-fetch with X-PAYMENT.
      const final = await fetchWithPayment({
        url: args.url,
        method: args.method,
        body: args.body,
        ...(args.headers !== undefined ? { headers: args.headers } : {}),
        xPayment,
      });
      return ok({
        paid: true,
        chain: req.chain,
        amount_usdc_micros: req.amount,
        ...final,
      });
    } catch (err) {
      return fail(`pay_and_fetch failed: ${(err as Error).message}`);
    }
  },
);

// -------------------------------------------------------------------------
// directory_search — discover priced APIs
// -------------------------------------------------------------------------

server.registerTool(
  'directory_search',
  {
    title: 'Discover priced APIs in the Limen directory',
    description:
      'List published projects in the directory. Helpful for an agent that wants to find an API matching a category or capability before paying for one.',
    inputSchema: {
      query: z.string().optional().describe('Free-text search (project name / description).'),
      category: z.string().optional(),
      limit: z.number().int().min(1).max(100).default(20),
    },
  },
  async (args) => {
    try {
      const url = new URL(`${directoryUrl}/listing`);
      if (args.query) url.searchParams.set('q', args.query);
      if (args.category) url.searchParams.set('category', args.category);
      url.searchParams.set('limit', String(args.limit));
      const res = await fetch(url.toString(), { headers: { accept: 'application/json' } });
      const body = res.headers.get('content-type')?.includes('json')
        ? await res.json()
        : await res.text();
      return ok({ status: res.status, body });
    } catch (err) {
      return fail(`directory_search failed: ${(err as Error).message}`);
    }
  },
);

// -------------------------------------------------------------------------
// Resources
// -------------------------------------------------------------------------

server.registerResource(
  'limen-agent-wallets',
  'limen-agent://wallets',
  {
    title: 'Configured wallet addresses',
    description: 'Public addresses of the wallets this server can sign with.',
    mimeType: 'application/json',
  },
  async (uri) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: 'application/json',
        text: JSON.stringify(
          {
            base: baseWallet?.account.address ?? null,
            solana: solanaWallet?.publicKey ?? null,
          },
          null,
          2,
        ),
      },
    ],
  }),
);

// -------------------------------------------------------------------------
// Stdio entrypoint
// -------------------------------------------------------------------------

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

void main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error('[limen-mcp-agent] fatal:', (err as Error).message);
  process.exit(1);
});
