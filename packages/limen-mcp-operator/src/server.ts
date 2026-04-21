/**
 * Limen Operator MCP server — stdio entrypoint.
 *
 * For local clients (Claude Desktop, Claude Code).  Auth is whatever
 * the OS process boundary provides; this entrypoint reads
 * `LIMEN_API_KEY` from env and forwards it as a bearer to the admin API.
 *
 * For remote (HTTP) deployment with OAuth 2.1 + Dynamic Client
 * Registration, see ./http.ts (binary: `limen-mcp-operator-http`).
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { LimenClient, type LimenClientConfig } from './client.js';
import { registerOperatorTools } from './tools.js';

export function buildOperatorMcpServer(config: LimenClientConfig = {}): McpServer {
  const client = new LimenClient(config);
  const server = new McpServer({ name: 'limen-operator', version: '0.1.0' });
  registerOperatorTools(server, client);
  return server;
}

async function main(): Promise<void> {
  const server = buildOperatorMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

void main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error('[limen-mcp-operator] fatal:', (err as Error).message);
  process.exit(1);
});
