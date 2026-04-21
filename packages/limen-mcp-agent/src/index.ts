/**
 * Programmatic exports — for hosting the agent MCP server in another
 * process or for re-using the x402 client logic in custom tooling.
 */
export {
  buildEvmXPayment,
  buildSolanaXPayment,
  fetchWithPayment,
  quote,
} from './x402.js';
export type { PaymentRequirements, QuoteResult, FetchResult } from './x402.js';
export { loadBaseWallet, loadSolanaWallet } from './wallet.js';
export type { BaseWallet, SolanaWallet } from './wallet.js';
