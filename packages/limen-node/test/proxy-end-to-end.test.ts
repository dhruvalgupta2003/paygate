/**
 * End-to-end CoreProxy tests for both chains.
 *
 * These wire CoreProxy with a real chain adapter and exercise the full
 * request lifecycle through the proxy layer (matcher, requirement issuance,
 * nonce storage, replay guard, verification, response shaping).  Where a
 * BaseAdapter / SolanaAdapter test exercises the adapter alone, this file
 * proves the proxy correctly orchestrates them as middleware would in
 * production.
 *
 * Network reads (RPC settlement confirmation) are NOT exercised — the
 * adapters' `verifyPayment` is purely structural and does not touch RPC.
 */

import { describe, it, expect } from 'vitest';
import { Keypair, MessageV0, PublicKey, TransactionInstruction, VersionedTransaction } from '@solana/web3.js';
import {
  createTransferInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { createWalletClient, http, parseSignature, type Hex } from 'viem';
import { baseSepolia } from 'viem/chains';
import { CoreProxy } from '../src/proxy/core.js';
import { BaseAdapter } from '../src/chains/base.js';
import { SolanaAdapter } from '../src/chains/solana.js';
import { InMemoryNonceStore } from '../src/utils/nonce-store.js';
import { InMemoryRateLimiter } from '../src/utils/rate-limiter.js';
import { NullComplianceScreen } from '../src/verification/compliance.js';
import { createLogger } from '../src/utils/logger.js';
import { EIP712_DOMAIN, SOLANA_PROGRAMS, USDC_ADDRESSES } from '../src/constants.js';
import type { LimenConfig } from '../src/config.js';
import type { LimenRequest } from '../src/types.js';

const NULL_LOGGER = createLogger({ level: 'silent' });

function freshConfig(opts: {
  chain: 'base-sepolia' | 'solana-devnet';
  receivingWallet: string;
  endpointPath: string;
  priceUsdc: string;
}): LimenConfig {
  return {
    version: 1,
    wallets: { [opts.chain]: opts.receivingWallet } as LimenConfig['wallets'],
    defaults: {
      chain: opts.chain,
      currency: 'USDC',
      confirmations: 1,
      payment_ttl_seconds: 300,
      facilitator: 'self',
    },
    endpoints: [{ path: opts.endpointPath, price_usdc: opts.priceUsdc, method: ['GET'] }],
    rate_limits: [],
    cache: { enabled: false, driver: 'memory', default_ttl_seconds: 0, rules: [] },
    compliance: { sanctions_screening: false, geo_blocklist: [], travel_rule_threshold_usd: 3000 },
    webhooks: [],
    discovery: { listed: false, categories: [] },
    advanced: {
      upstream_timeout_ms: 5000,
      verifier_timeout_ms: 4000,
      max_request_body_mb: 5,
      trust_proxy: true,
      proxy_protocol: false,
      log_bodies: false,
      facilitator_url: 'https://x402.org/facilitator',
      facilitator_failover_seconds: 300,
      solana: {
        priority_fee_percentile: 75,
        use_lookup_table: false,
        commitment_finalized_threshold_usd: 100,
      },
      base: { gas_multiplier: 1.25, high_value_threshold_usd: 1000 },
    },
  };
}

function freshDeps() {
  return {
    nonceStore: new InMemoryNonceStore(),
    rateLimiter: new InMemoryRateLimiter(),
    compliance: new NullComplianceScreen(),
    logger: NULL_LOGGER,
  };
}

function makeRequest(path: string, headers: Record<string, string> = {}): LimenRequest {
  return {
    method: 'GET',
    url: path,
    path,
    query: {},
    headers,
    ip: '127.0.0.1',
    body: undefined,
  };
}

describe('CoreProxy end-to-end — Base Sepolia', () => {
  it('issues a 402 with x402 headers when no X-PAYMENT is supplied', async () => {
    const operator = privateKeyToAccount(generatePrivateKey()).address;
    const adapter = new BaseAdapter({
      chainId: 'base-sepolia',
      rpcUrl: 'https://sepolia.base.org',
      receivingWallet: operator,
      devMode: true,
    });
    const proxy = new CoreProxy({
      config: freshConfig({
        chain: 'base-sepolia',
        receivingWallet: operator,
        endpointPath: '/api/premium',
        priceUsdc: '0.001',
      }),
      adapters: { 'base-sepolia': adapter },
      upstream: 'http://upstream-not-used',
      guardMode: true,
      ...freshDeps(),
    });

    const result = await proxy.handle(makeRequest('/api/premium'));
    expect(result.response.status).toBe(402);
    expect(result.response.headers['Content-Type']).toBe('application/vnd.x402+json');
    expect(result.response.headers['x402-version']).toBe('1');
    const body = JSON.parse(result.response.body as string) as {
      error: string;
      paymentRequirements: { chain: string; payTo: string; amount: string; nonce: string };
    };
    expect(body.error).toBe('PAYMENT_REQUIRED');
    expect(body.paymentRequirements.chain).toBe('base-sepolia');
    expect(body.paymentRequirements.payTo.toLowerCase()).toBe(operator.toLowerCase());
    expect(body.paymentRequirements.amount).toBe('1000'); // $0.001 = 1000 micros
    expect(body.paymentRequirements.nonce.length).toBeGreaterThan(0);
  });

  it('accepts a valid signed authorization end-to-end (issue 402 → pay → guard pass)', async () => {
    const operatorPk = generatePrivateKey();
    const payerPk = generatePrivateKey();
    const operator = privateKeyToAccount(operatorPk).address;
    const payer = privateKeyToAccount(payerPk);

    const adapter = new BaseAdapter({
      chainId: 'base-sepolia',
      rpcUrl: 'https://sepolia.base.org',
      receivingWallet: operator,
      devMode: true,
    });
    const proxy = new CoreProxy({
      config: freshConfig({
        chain: 'base-sepolia',
        receivingWallet: operator,
        endpointPath: '/api/premium',
        priceUsdc: '0.001',
      }),
      adapters: { 'base-sepolia': adapter },
      upstream: 'http://upstream-not-used',
      guardMode: true,
      ...freshDeps(),
    });

    // Step 1: provoke a 402 to obtain the nonce + digest the proxy expects.
    const issued = await proxy.handle(makeRequest('/api/premium'));
    const issuedBody = JSON.parse(issued.response.body as string) as {
      paymentRequirements: { nonce: string; validUntil: number; payTo: string; amount: string };
    };
    const req = issuedBody.paymentRequirements;

    // Step 2: payer signs an EIP-712 TransferWithAuthorization to operator.
    const wallet = createWalletClient({ account: payer, chain: baseSepolia, transport: http() });
    const authNonce: Hex = `0x${'cd'.repeat(32)}`;
    const sig = await wallet.signTypedData({
      domain: EIP712_DOMAIN['base-sepolia'],
      types: {
        TransferWithAuthorization: [
          { name: 'from', type: 'address' },
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'validAfter', type: 'uint256' },
          { name: 'validBefore', type: 'uint256' },
          { name: 'nonce', type: 'bytes32' },
        ],
      },
      primaryType: 'TransferWithAuthorization',
      message: {
        from: payer.address,
        to: operator,
        value: BigInt(req.amount),
        validAfter: BigInt(Math.floor(Date.now() / 1000) - 60),
        validBefore: BigInt(req.validUntil),
        nonce: authNonce,
      },
    });
    const { r, s, v } = parseSignature(sig);

    const xPayment = Buffer.from(
      JSON.stringify({
        v: '1',
        chain: 'base-sepolia',
        scheme: 'exact',
        nonce: req.nonce,
        validUntil: req.validUntil,
        payTo: req.payTo,
        asset: USDC_ADDRESSES['base-sepolia'],
        amount: req.amount,
        authorization: {
          from: payer.address,
          to: operator,
          value: req.amount,
          validAfter: Math.floor(Date.now() / 1000) - 60,
          validBefore: req.validUntil,
          nonce: authNonce,
          v: Number(v ?? 27),
          r,
          s,
        },
      }),
    ).toString('base64');

    // Step 3: replay X-PAYMENT through the proxy — guard mode should
    // verify, succeed, and emit the "pass" sentinel (200 + empty body).
    const paid = await proxy.handle(makeRequest('/api/premium', { 'x-payment': xPayment }));
    expect(paid.response.status).toBe(200);
    expect(paid.response.body).toBe('');
    expect(paid.verifyResult?.ok).toBe(true);
    if (paid.verifyResult?.ok) {
      expect(paid.verifyResult.payer).toBe(payer.address);
      expect(paid.verifyResult.recipient.toLowerCase()).toBe(operator.toLowerCase());
      expect(paid.verifyResult.settledAmount).toBe(req.amount);
    }
  });
});

describe('CoreProxy end-to-end — Solana Devnet', () => {
  const SOL_USDC = new PublicKey(USDC_ADDRESSES['solana-devnet']);

  function buildSignedTransfer(opts: {
    payer: Keypair;
    receiverAta: PublicKey;
    amount: bigint;
    memo: string;
  }): string {
    const payerAta = getAssociatedTokenAddressSync(SOL_USDC, opts.payer.publicKey, true);
    const transferIx = createTransferInstruction(
      payerAta,
      opts.receiverAta,
      opts.payer.publicKey,
      opts.amount,
      [],
      TOKEN_PROGRAM_ID,
    );
    const memoIx = new TransactionInstruction({
      programId: new PublicKey(SOLANA_PROGRAMS.MEMO_V2),
      keys: [],
      data: Buffer.from(opts.memo, 'utf-8'),
    });
    const message = MessageV0.compile({
      payerKey: opts.payer.publicKey,
      recentBlockhash: '11111111111111111111111111111111',
      instructions: [transferIx, memoIx],
    });
    const tx = new VersionedTransaction(message);
    tx.sign([opts.payer]);
    return Buffer.from(tx.serialize()).toString('base64');
  }

  it('issues a 402 with chain=solana-devnet and the configured mint as asset', async () => {
    const operator = Keypair.generate();
    const adapter = new SolanaAdapter({
      chainId: 'solana-devnet',
      rpcUrl: 'https://api.devnet.solana.com',
      receivingWallet: operator.publicKey.toBase58(),
    });
    const proxy = new CoreProxy({
      config: freshConfig({
        chain: 'solana-devnet',
        receivingWallet: operator.publicKey.toBase58(),
        endpointPath: '/api/premium',
        priceUsdc: '0.001',
      }),
      adapters: { 'solana-devnet': adapter },
      upstream: 'http://upstream-not-used',
      guardMode: true,
      ...freshDeps(),
    });

    const result = await proxy.handle(makeRequest('/api/premium'));
    expect(result.response.status).toBe(402);
    const body = JSON.parse(result.response.body as string) as {
      paymentRequirements: { chain: string; payTo: string; amount: string; asset: string };
    };
    expect(body.paymentRequirements.chain).toBe('solana-devnet');
    expect(body.paymentRequirements.asset).toBe(USDC_ADDRESSES['solana-devnet']);
    expect(body.paymentRequirements.payTo).toBe(operator.publicKey.toBase58());
    expect(body.paymentRequirements.amount).toBe('1000');
  });

  it('accepts a valid signed VersionedTransaction end-to-end (402 → pay → guard pass)', async () => {
    const operator = Keypair.generate();
    const payer = Keypair.generate();
    const adapter = new SolanaAdapter({
      chainId: 'solana-devnet',
      rpcUrl: 'https://api.devnet.solana.com',
      receivingWallet: operator.publicKey.toBase58(),
    });
    const proxy = new CoreProxy({
      config: freshConfig({
        chain: 'solana-devnet',
        receivingWallet: operator.publicKey.toBase58(),
        endpointPath: '/api/premium',
        priceUsdc: '0.001',
      }),
      adapters: { 'solana-devnet': adapter },
      upstream: 'http://upstream-not-used',
      guardMode: true,
      ...freshDeps(),
    });

    // Step 1: 402 to obtain the nonce.
    const issued = await proxy.handle(makeRequest('/api/premium'));
    const issuedBody = JSON.parse(issued.response.body as string) as {
      paymentRequirements: { nonce: string; validUntil: number; payTo: string; amount: string; asset: string };
    };
    const req = issuedBody.paymentRequirements;

    // Step 2: payer builds + signs a USDC transfer to the operator's ATA.
    const receiverAta = getAssociatedTokenAddressSync(SOL_USDC, operator.publicKey, true);
    const txBase64 = buildSignedTransfer({
      payer,
      receiverAta,
      amount: BigInt(req.amount),
      memo: req.nonce,
    });
    const xPayment = Buffer.from(
      JSON.stringify({
        v: '1',
        chain: 'solana-devnet',
        scheme: 'exact',
        nonce: req.nonce,
        validUntil: req.validUntil,
        payTo: req.payTo,
        mint: req.asset,
        amount: req.amount,
        transaction: txBase64,
      }),
    ).toString('base64');

    // Step 3: proxy verifies + emits the guard-pass sentinel.
    const paid = await proxy.handle(makeRequest('/api/premium', { 'x-payment': xPayment }));
    expect(paid.response.status).toBe(200);
    expect(paid.response.body).toBe('');
    expect(paid.verifyResult?.ok).toBe(true);
    if (paid.verifyResult?.ok) {
      expect(paid.verifyResult.payer).toBe(payer.publicKey.toBase58());
      expect(paid.verifyResult.recipient).toBe(operator.publicKey.toBase58());
      expect(paid.verifyResult.settledAmount).toBe(req.amount);
      expect(paid.verifyResult.chain).toBe('solana-devnet');
    }
  });

  it('refuses to replay the same nonce a second time (NONCE_REUSED)', async () => {
    const operator = Keypair.generate();
    const payer = Keypair.generate();
    const adapter = new SolanaAdapter({
      chainId: 'solana-devnet',
      rpcUrl: 'https://api.devnet.solana.com',
      receivingWallet: operator.publicKey.toBase58(),
    });
    const proxy = new CoreProxy({
      config: freshConfig({
        chain: 'solana-devnet',
        receivingWallet: operator.publicKey.toBase58(),
        endpointPath: '/api/premium',
        priceUsdc: '0.001',
      }),
      adapters: { 'solana-devnet': adapter },
      upstream: 'http://upstream-not-used',
      guardMode: true,
      ...freshDeps(),
    });

    const issued = await proxy.handle(makeRequest('/api/premium'));
    const issuedBody = JSON.parse(issued.response.body as string) as {
      paymentRequirements: { nonce: string; validUntil: number; payTo: string; amount: string; asset: string };
    };
    const req = issuedBody.paymentRequirements;

    const receiverAta = getAssociatedTokenAddressSync(SOL_USDC, operator.publicKey, true);
    const txBase64 = buildSignedTransfer({
      payer,
      receiverAta,
      amount: BigInt(req.amount),
      memo: req.nonce,
    });
    const xPayment = Buffer.from(
      JSON.stringify({
        v: '1',
        chain: 'solana-devnet',
        scheme: 'exact',
        nonce: req.nonce,
        validUntil: req.validUntil,
        payTo: req.payTo,
        mint: req.asset,
        amount: req.amount,
        transaction: txBase64,
      }),
    ).toString('base64');

    const first = await proxy.handle(makeRequest('/api/premium', { 'x-payment': xPayment }));
    expect(first.response.status).toBe(200);

    const second = await proxy.handle(makeRequest('/api/premium', { 'x-payment': xPayment }));
    expect(second.response.status).toBe(402);
    const body = JSON.parse(second.response.body as string) as { error: string };
    expect(body.error).toBe('NONCE_REUSED');
  });
});
