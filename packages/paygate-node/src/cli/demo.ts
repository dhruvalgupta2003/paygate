/**
 * `paygate demo` — drive a full x402 handshake against a running proxy.
 *
 * Acts as a minimal AI-agent client:
 *   1. GET <endpoint> → expect 402 + PaymentRequirements
 *   2. Sign EIP-3009 TransferWithAuthorization with the configured key
 *   3. POST the same endpoint with X-PAYMENT header
 *   4. Print the upstream response + settlement receipt
 *
 * Intended for local verification against `paygate start --dev`.
 * Use a throwaway private key on Base Sepolia; never mainnet.
 */

import { randomBytes } from 'node:crypto';
import { request as httpRequest, type IncomingHttpHeaders } from 'node:http';
import {
  createWalletClient,
  http,
  parseSignature,
  type Hex,
} from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { base, baseSepolia } from 'viem/chains';
import { EIP712_DOMAIN, USDC_ADDRESSES } from '../constants.js';

interface PlainResponse {
  readonly status: number;
  readonly headers: IncomingHttpHeaders;
  readonly body: string;
}

async function singleShot(url: URL, headers: Record<string, string>): Promise<PlainResponse> {
  return new Promise<PlainResponse>((resolve, reject) => {
    let settled = false;
    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };
    const req = httpRequest(
      {
        agent: false,           // no connection pool, no agent-level retry
        method: 'GET',
        hostname: url.hostname,
        port: url.port || 80,
        path: `${url.pathname}${url.search}`,
        headers: { ...headers, connection: 'close' },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () =>
          done(() =>
            resolve({
              status: res.statusCode ?? 0,
              headers: res.headers,
              body: Buffer.concat(chunks).toString('utf-8'),
            }),
          ),
        );
        res.on('error', (e) => done(() => reject(e)));
      },
    );
    req.on('error', (e) => done(() => reject(e)));
    req.end();
  });
}

export interface DemoOptions {
  readonly upstream: string;
  readonly endpoint: string;
  readonly chain: 'base' | 'base-sepolia';
  readonly privateKey?: string;
  readonly verbose?: boolean;
}

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

interface PaymentRequirements {
  readonly scheme: 'exact';
  readonly chain: string;
  readonly asset: string;
  readonly amount: string;
  readonly payTo: string;
  readonly nonce: string;
  readonly digest: string;
  readonly validUntil: number;
  readonly description?: string;
}

function line(label: string, value: string): void {
  const pad = 22;
  console.log(`  ${label.padEnd(pad)} ${value}`);
}

function heading(title: string): void {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

export async function runDemo(opts: DemoOptions): Promise<void> {
  const pk: Hex =
    (opts.privateKey as Hex | undefined) ?? generatePrivateKey();
  const account = privateKeyToAccount(pk);
  const usdc = USDC_ADDRESSES[opts.chain] as Hex;

  const target = new URL(opts.endpoint, opts.upstream);

  heading('Agent');
  line('address', account.address);
  line('chain', opts.chain);
  line('target', target.toString());
  line('usdc', usdc);

  // -- Step 1: provoke the 402 --------------------------------------------
  heading('Step 1 — GET (no payment)');
  const first = await singleShot(target, { 'accept-chain': opts.chain });
  line('status', String(first.status));
  if (first.status !== 402) {
    console.error(`\nexpected 402, got ${first.status}:\n${first.body}`);
    process.exitCode = 1;
    return;
  }
  const four02 = JSON.parse(first.body) as { paymentRequirements: PaymentRequirements };
  const req = four02.paymentRequirements;
  line('chain', req.chain);
  line('amount (micros)', req.amount);
  line('payTo', req.payTo);
  line('validUntil', new Date(req.validUntil * 1000).toISOString());
  line('nonce', req.nonce.slice(0, 12) + '…');
  line('digest', req.digest.slice(0, 24) + '…');

  // -- Step 2: sign EIP-3009 ----------------------------------------------
  heading('Step 2 — sign EIP-3009 TransferWithAuthorization');
  if (req.chain !== opts.chain) {
    console.error(`\nchain mismatch: proxy issued ${req.chain}, demo is on ${opts.chain}`);
    process.exitCode = 1;
    return;
  }
  const authNonce: Hex = `0x${randomBytes(32).toString('hex')}`;
  const now = Math.floor(Date.now() / 1000);
  const validAfter = BigInt(now - 60);
  const validBefore = BigInt(req.validUntil);
  const value = BigInt(req.amount);

  const walletClient = createWalletClient({
    account,
    chain: opts.chain === 'base' ? base : baseSepolia,
    transport: http(),
  });

  const signature = await walletClient.signTypedData({
    domain: EIP712_DOMAIN[opts.chain],
    types: EIP712_TYPES,
    primaryType: 'TransferWithAuthorization',
    message: {
      from: account.address,
      to: req.payTo as Hex,
      value,
      validAfter,
      validBefore,
      nonce: authNonce,
    },
  });
  const { r, s, v } = parseSignature(signature);
  line('auth.from', account.address);
  line('auth.to', req.payTo);
  line('auth.value', value.toString());
  line('auth.nonce', authNonce.slice(0, 18) + '…');
  line('sig.v', String(v ?? 27));

  // -- Step 3: build + send X-PAYMENT -------------------------------------
  heading('Step 3 — retry with X-PAYMENT');
  const xPayment = Buffer.from(
    JSON.stringify({
      v: '1',
      chain: opts.chain,
      scheme: 'exact',
      nonce: req.nonce,
      validUntil: req.validUntil,
      payTo: req.payTo,
      asset: req.asset,
      amount: req.amount,
      authorization: {
        from: account.address,
        to: req.payTo,
        value: value.toString(),
        validAfter: Number(validAfter),
        validBefore: Number(validBefore),
        nonce: authNonce,
        v: Number(v ?? 27),
        r,
        s,
      },
    }),
  ).toString('base64');

  if (opts.verbose) {
    line('X-PAYMENT bytes', `${xPayment.length}`);
  }

  const settled = await singleShot(target, {
    'x-payment': xPayment,
    'accept-chain': opts.chain,
  });
  line('status', String(settled.status));
  const receiptHeader = settled.headers['x-payment-response'];
  const receipt = Array.isArray(receiptHeader) ? receiptHeader[0] : receiptHeader;
  if (receipt) line('X-PAYMENT-RESPONSE', receipt);

  // -- Summary -------------------------------------------------------------
  heading('Response body');
  console.log(settled.body.length > 500 ? settled.body.slice(0, 500) + '…' : settled.body);

  if (settled.status >= 200 && settled.status < 300) {
    console.log('\n\x1b[32mx402 round-trip succeeded\x1b[0m');
  } else {
    console.log('\n\x1b[31mx402 round-trip failed\x1b[0m');
    process.exitCode = 1;
  }
}
