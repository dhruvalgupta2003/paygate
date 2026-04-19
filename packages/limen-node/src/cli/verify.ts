import { Connection, PublicKey } from '@solana/web3.js';
import { createPublicClient, http, type Hex } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { usdcToMicros } from '../utils/amount.js';

export interface VerifyOptions {
  readonly chain: string;
  readonly tx: string;
  readonly expectedAmount?: string;
  readonly expectedTo?: string;
}

export async function runVerify(opts: VerifyOptions): Promise<void> {
  switch (opts.chain) {
    case 'base':
    case 'base-sepolia':
      await verifyEvm(opts);
      break;
    case 'solana':
    case 'solana-devnet':
      await verifySolana(opts);
      break;
    default:
      console.error(`unknown chain: ${opts.chain}`);
      process.exitCode = 1;
  }
}

async function verifyEvm(opts: VerifyOptions): Promise<void> {
  const client = createPublicClient({
    chain: opts.chain === 'base' ? base : baseSepolia,
    transport: http(
      opts.chain === 'base'
        ? process.env['LIMEN_BASE_RPC_URL'] ?? 'https://mainnet.base.org'
        : process.env['LIMEN_BASE_SEPOLIA_RPC_URL'] ?? 'https://sepolia.base.org',
    ),
  });
  const receipt = await client.getTransactionReceipt({ hash: opts.tx as Hex });
  console.log(`status: ${receipt.status}`);
  console.log(`block:  ${receipt.blockNumber}`);
  console.log(`gas:    ${receipt.gasUsed}`);
  if (opts.expectedAmount) {
    console.log(`expected amount: ${opts.expectedAmount} (${usdcToMicros(opts.expectedAmount)} micros)`);
  }
  if (opts.expectedTo) {
    console.log(`expected to:     ${opts.expectedTo}`);
  }
}

async function verifySolana(opts: VerifyOptions): Promise<void> {
  const conn = new Connection(
    opts.chain === 'solana'
      ? process.env['LIMEN_SOLANA_RPC_URL'] ?? 'https://api.mainnet-beta.solana.com'
      : process.env['LIMEN_SOLANA_DEVNET_RPC_URL'] ?? 'https://api.devnet.solana.com',
    'confirmed',
  );
  const tx = await conn.getTransaction(opts.tx, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  });
  console.log(`slot: ${tx?.slot ?? 'not found'}`);
  if (tx?.meta?.err) console.log(`err:  ${JSON.stringify(tx.meta.err)}`);
  if (opts.expectedTo) {
    try {
      const k = new PublicKey(opts.expectedTo);
      console.log(`expected to:     ${k.toBase58()}`);
    } catch (err) {
      console.log(`invalid expected-to: ${(err as Error).message}`);
    }
  }
}
