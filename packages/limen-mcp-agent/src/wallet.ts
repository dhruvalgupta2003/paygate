/**
 * Per-chain wallets used by the agent MCP server.
 *
 * Keys are read from env at construction time, NOT per-request — there's no
 * tool surface for "set the private key" because exposing it through the
 * model context would be unsafe.  Operators set credentials in their MCP
 * client config (Claude Desktop / Claude Code) and the LLM only ever sees
 * the address, never the secret.
 */

import { privateKeyToAccount } from 'viem/accounts';
import { createWalletClient, http, parseSignature, type Account, type Hex } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

export interface BaseWallet {
  readonly chain: 'base' | 'base-sepolia';
  readonly account: Account;
  signTypedData: (input: {
    types: Record<string, ReadonlyArray<{ name: string; type: string }>>;
    primaryType: string;
    message: Record<string, unknown>;
    domain: Record<string, unknown>;
  }) => Promise<{ r: Hex; s: Hex; v: number }>;
}

export interface SolanaWallet {
  readonly chain: 'solana' | 'solana-devnet';
  readonly keypair: Keypair;
  readonly publicKey: string;
}

export function loadBaseWallet(env: NodeJS.ProcessEnv = process.env): BaseWallet | null {
  const pk = env['LIMEN_AGENT_BASE_PRIVATE_KEY'];
  if (!pk) return null;
  if (!/^0x[0-9a-fA-F]{64}$/.test(pk)) {
    throw new Error('LIMEN_AGENT_BASE_PRIVATE_KEY must be a 32-byte hex (0x…) value.');
  }
  const account = privateKeyToAccount(pk as Hex);
  // chainId resolved per-call from the 402 challenge — we keep a single
  // viem WalletClient on base-sepolia just so signTypedData has a chain
  // shape to satisfy types.  For typed-data signing the chainId in the
  // EIP-712 domain is what actually matters; the wallet's chain is not
  // used.
  const wallet = createWalletClient({ account, chain: baseSepolia, transport: http() });
  return {
    chain: 'base-sepolia',
    account,
    async signTypedData(input) {
      // viem's signTypedData has very narrow generic types we can't satisfy
      // dynamically; cast the params object as a whole.
      const sig = await (wallet.signTypedData as (params: unknown) => Promise<Hex>)({
        account,
        types: input.types,
        primaryType: input.primaryType,
        message: input.message,
        domain: input.domain,
      });
      const { r, s, v } = parseSignature(sig);
      return { r, s, v: Number(v ?? 27) };
    },
  };
}

export function loadSolanaWallet(env: NodeJS.ProcessEnv = process.env): SolanaWallet | null {
  const raw = env['LIMEN_AGENT_SOLANA_SECRET_KEY'];
  if (!raw) return null;
  let secret: Uint8Array;
  // Accept either base58 (32-byte seed or 64-byte secret) or a JSON array
  // of 64 bytes (the format Solana CLI emits).
  if (raw.trim().startsWith('[')) {
    const parsed = JSON.parse(raw) as number[];
    if (!Array.isArray(parsed) || parsed.length !== 64) {
      throw new Error('LIMEN_AGENT_SOLANA_SECRET_KEY JSON array must contain exactly 64 bytes.');
    }
    secret = new Uint8Array(parsed);
  } else {
    const decoded = bs58.decode(raw);
    if (decoded.length !== 64) {
      throw new Error(
        'LIMEN_AGENT_SOLANA_SECRET_KEY base58 value must decode to exactly 64 bytes (full secret key, not 32-byte seed).',
      );
    }
    secret = decoded;
  }
  const keypair = Keypair.fromSecretKey(secret);
  return {
    chain: 'solana-devnet',
    keypair,
    publicKey: keypair.publicKey.toBase58(),
  };
}

// Re-export for the EIP-712 caller; viem chain shape varies per request.
export { base, baseSepolia };
