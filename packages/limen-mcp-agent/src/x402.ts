/**
 * x402 client logic shared between `quote` and `pay_and_fetch`.
 *
 * Splits naturally into:
 *   1. fetch + recognize a 402 challenge
 *   2. parse `paymentRequirements`
 *   3. build a chain-specific X-PAYMENT envelope (sign EIP-712 for Base
 *      EVMs, assemble + sign a VersionedTransaction for Solana)
 *   4. re-fetch with the X-PAYMENT header
 *
 * The signer never submits to chain — the merchant's proxy verifies and
 * (optionally via facilitator) submits the settlement.  Agent only signs.
 */

import {
  Connection,
  Keypair,
  MessageV0,
  PublicKey,
  TransactionInstruction,
  VersionedTransaction,
} from '@solana/web3.js';
import {
  createTransferInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import type { BaseWallet } from './wallet.js';

// EIP-712 typed-data shape for USDC TransferWithAuthorization.  Matches
// what the BaseAdapter expects on the verify side.
const EIP712_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const;

// Per-chain EIP-712 domain values.  Mirrors @limen/node/constants.
const EIP712_DOMAIN: Record<
  'base' | 'base-sepolia',
  { name: string; version: string; chainId: number; verifyingContract: string }
> = {
  base: {
    name: 'USD Coin',
    version: '2',
    chainId: 8453,
    verifyingContract: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  },
  'base-sepolia': {
    name: 'USDC',
    version: '2',
    chainId: 84532,
    verifyingContract: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  },
};

const SOL_USDC_MINT: Record<'solana' | 'solana-devnet', string> = {
  solana: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  'solana-devnet': '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
};

const SOL_DEFAULT_RPC: Record<'solana' | 'solana-devnet', string> = {
  solana: 'https://api.mainnet-beta.solana.com',
  'solana-devnet': 'https://api.devnet.solana.com',
};

const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

export interface PaymentRequirements {
  scheme: string;
  chain: string;
  asset: string;
  amount: string;
  payTo: string;
  validUntil: number;
  nonce: string;
  digest?: string;
  facilitator?: string;
}

export interface QuoteResult {
  status: number;
  paymentRequirements?: PaymentRequirements;
  body?: unknown;
  headers: Record<string, string>;
}

/** Fetch a URL and return the 402 challenge if present. */
export async function quote(input: {
  url: string;
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}): Promise<QuoteResult> {
  const reqInit: RequestInit = {
    method: input.method ?? 'GET',
    headers: {
      accept: 'application/vnd.x402+json, application/json',
      ...input.headers,
    },
  };
  if (input.body !== undefined && (input.method ?? 'GET') !== 'GET') {
    (reqInit.headers as Record<string, string>)['content-type'] = 'application/json';
    reqInit.body = JSON.stringify(input.body);
  }
  const res = await fetch(input.url, reqInit);
  const respHeaders: Record<string, string> = {};
  res.headers.forEach((v, k) => {
    respHeaders[k] = v;
  });
  if (res.status !== 402) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = await res.text();
    }
    return { status: res.status, body, headers: respHeaders };
  }
  const challenge = (await res.json()) as { paymentRequirements?: PaymentRequirements };
  const out: QuoteResult = { status: 402, headers: respHeaders };
  if (challenge.paymentRequirements !== undefined) {
    out.paymentRequirements = challenge.paymentRequirements;
  }
  return out;
}

/**
 * Sign + base64-encode an X-PAYMENT envelope for the given EVM
 * payment requirements.  Throws when the wallet's address mismatches
 * what the merchant requires (defensive — a misrouted payment is never
 * the right move).
 */
export async function buildEvmXPayment(
  req: PaymentRequirements,
  wallet: BaseWallet,
): Promise<string> {
  const chain = req.chain as 'base' | 'base-sepolia';
  const domain = EIP712_DOMAIN[chain];
  if (!domain) throw new Error(`unknown EVM chain: ${req.chain}`);

  const validAfter = Math.floor(Date.now() / 1000) - 60;
  const validBefore = req.validUntil;
  // Use the requirements' nonce hashed into 32 bytes for the on-chain
  // authorization nonce — the merchant's adapter only checks the outer
  // envelope nonce, but USDC's contract requires a 32-byte authorization
  // nonce of its own.  A keccak-style domain-separation would be ideal
  // but for now we pad/truncate the limen nonce.
  const padded = (req.nonce + '0'.repeat(64)).slice(0, 64);
  const authNonce = `0x${padded}` as `0x${string}`;

  const message = {
    from: wallet.account.address,
    to: req.payTo as `0x${string}`,
    value: BigInt(req.amount),
    validAfter: BigInt(validAfter),
    validBefore: BigInt(validBefore),
    nonce: authNonce,
  };

  const { r, s, v } = await wallet.signTypedData({
    types: EIP712_TYPES as unknown as Record<
      string,
      ReadonlyArray<{ name: string; type: string }>
    >,
    primaryType: 'TransferWithAuthorization',
    message: message as unknown as Record<string, unknown>,
    domain: domain as unknown as Record<string, unknown>,
  });

  const envelope = {
    v: '1',
    chain,
    scheme: 'exact',
    nonce: req.nonce,
    validUntil: req.validUntil,
    payTo: req.payTo,
    asset: req.asset,
    amount: req.amount,
    authorization: {
      from: wallet.account.address,
      to: req.payTo,
      value: req.amount,
      validAfter,
      validBefore,
      nonce: authNonce,
      v,
      r,
      s,
    },
  };
  return Buffer.from(JSON.stringify(envelope)).toString('base64');
}

/**
 * Build + sign a Solana VersionedTransaction that:
 *   - transfers `amount` of USDC from payer's ATA → merchant's ATA
 *   - includes a memo carrying the limen nonce
 * and returns a base64-encoded X-PAYMENT envelope.
 */
export async function buildSolanaXPayment(
  req: PaymentRequirements,
  payer: Keypair,
  rpcUrl?: string,
): Promise<string> {
  const chain = req.chain as 'solana' | 'solana-devnet';
  const mint = SOL_USDC_MINT[chain];
  if (!mint) throw new Error(`unknown Solana chain: ${req.chain}`);
  if (mint !== req.asset) {
    throw new Error(
      `merchant requested mint ${req.asset} but our canonical USDC mint for ${chain} is ${mint}; refusing to sign`,
    );
  }
  const conn = new Connection(rpcUrl ?? SOL_DEFAULT_RPC[chain], 'confirmed');
  const mintPk = new PublicKey(mint);
  const merchant = new PublicKey(req.payTo);
  const payerAta = getAssociatedTokenAddressSync(mintPk, payer.publicKey, true);
  const merchantAta = getAssociatedTokenAddressSync(mintPk, merchant, true);

  const transferIx = createTransferInstruction(
    payerAta,
    merchantAta,
    payer.publicKey,
    BigInt(req.amount),
    [],
    TOKEN_PROGRAM_ID,
  );
  const memoIx = new TransactionInstruction({
    programId: MEMO_PROGRAM_ID,
    keys: [],
    data: Buffer.from(req.nonce, 'utf-8'),
  });

  const { blockhash } = await conn.getLatestBlockhash('finalized');
  const message = MessageV0.compile({
    payerKey: payer.publicKey,
    recentBlockhash: blockhash,
    instructions: [transferIx, memoIx],
  });
  const tx = new VersionedTransaction(message);
  tx.sign([payer]);
  const txBase64 = Buffer.from(tx.serialize()).toString('base64');

  const envelope = {
    v: '1',
    chain,
    scheme: 'exact',
    nonce: req.nonce,
    validUntil: req.validUntil,
    payTo: req.payTo,
    mint,
    amount: req.amount,
    transaction: txBase64,
  };
  return Buffer.from(JSON.stringify(envelope)).toString('base64');
}

export interface FetchResult {
  status: number;
  body: unknown;
  headers: Record<string, string>;
  x_payment_response?: string;
}

/** Fetch with an X-PAYMENT header attached. */
export async function fetchWithPayment(input: {
  url: string;
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  xPayment: string;
}): Promise<FetchResult> {
  const reqInit: RequestInit = {
    method: input.method ?? 'GET',
    headers: {
      accept: 'application/json',
      'X-PAYMENT': input.xPayment,
      ...input.headers,
    },
  };
  if (input.body !== undefined && (input.method ?? 'GET') !== 'GET') {
    (reqInit.headers as Record<string, string>)['content-type'] = 'application/json';
    reqInit.body = JSON.stringify(input.body);
  }
  const res = await fetch(input.url, reqInit);
  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => {
    headers[k] = v;
  });
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = await res.text();
  }
  const result: FetchResult = { status: res.status, body, headers };
  const xpr = res.headers.get('x-payment-response');
  if (xpr !== null) result.x_payment_response = xpr;
  return result;
}
