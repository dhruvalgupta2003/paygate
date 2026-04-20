/**
 * End-to-end tests for SolanaAdapter.
 *
 * These mirror the BaseAdapter two-wallet flow: a payer (wallet A) signs a
 * VersionedTransaction transferring USDC to operator (wallet B)'s ATA, and
 * the adapter must verify the structured proof end-to-end.
 *
 * Network reads (confirmPayment, getRecentBlockhash) are NOT exercised here
 * — those require a live RPC and are covered by the example app.  This file
 * exercises the off-chain verification path: signature verification,
 * instruction inspection, recipient-ATA matching, amount checks.
 */

import { describe, it, expect } from 'vitest';
import {
  Keypair,
  MessageV0,
  PublicKey,
  TransactionInstruction,
  VersionedTransaction,
} from '@solana/web3.js';
import {
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { SolanaAdapter } from '../src/chains/solana.js';
import { SOLANA_PROGRAMS, USDC_ADDRESSES } from '../src/constants.js';

const DEVNET_USDC = new PublicKey(USDC_ADDRESSES['solana-devnet']);

interface BuildTxOpts {
  readonly payer: Keypair;
  readonly receiverAta: PublicKey;
  readonly amount: bigint;
  readonly memo: string;
  readonly extraInstructions?: readonly TransactionInstruction[];
}

function buildSignedTransfer(opts: BuildTxOpts): string {
  const payerAta = getAssociatedTokenAddressSync(DEVNET_USDC, opts.payer.publicKey, true);
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
  const instructions = [transferIx, memoIx, ...(opts.extraInstructions ?? [])];

  // We're not actually submitting — the recentBlockhash just needs to be a
  // valid base58 32-byte value so the message serializes.
  const message = MessageV0.compile({
    payerKey: opts.payer.publicKey,
    recentBlockhash: '11111111111111111111111111111111',
    instructions,
  });
  const tx = new VersionedTransaction(message);
  tx.sign([opts.payer]);
  return Buffer.from(tx.serialize()).toString('base64');
}

function encodeXPayment(req: {
  chain: 'solana-devnet';
  nonce: string;
  validUntil: number;
  payTo: string;
  mint: string;
  amount: string;
}, transactionBase64: string): string {
  return Buffer.from(
    JSON.stringify({
      v: '1',
      chain: req.chain,
      scheme: 'exact',
      nonce: req.nonce,
      validUntil: req.validUntil,
      payTo: req.payTo,
      mint: req.mint,
      amount: req.amount,
      transaction: transactionBase64,
    }),
  ).toString('base64');
}

describe('SolanaAdapter — two-wallet (non-self-loop) flow', () => {
  it('verifies a USDC transfer from payer A to operator B with a memo', async () => {
    const payer = Keypair.generate();
    const operator = Keypair.generate();
    expect(payer.publicKey.toBase58()).not.toBe(operator.publicKey.toBase58());

    const adapter = new SolanaAdapter({
      chainId: 'solana-devnet',
      rpcUrl: 'https://api.devnet.solana.com',
      receivingWallet: operator.publicKey.toBase58(),
    });

    const req = adapter.buildPaymentRequirements(
      { chain: 'solana-devnet', asset: USDC_ADDRESSES['solana-devnet'], amount: '1000' },
      { payTo: operator.publicKey.toBase58() },
    );

    const receiverAta = getAssociatedTokenAddressSync(DEVNET_USDC, operator.publicKey, true);
    const txBase64 = buildSignedTransfer({
      payer,
      receiverAta,
      amount: BigInt(req.amount),
      memo: req.nonce,
    });

    const xPayment = encodeXPayment(
      {
        chain: 'solana-devnet',
        nonce: req.nonce,
        validUntil: req.validUntil,
        payTo: req.payTo,
        mint: req.asset,
        amount: req.amount,
      },
      txBase64,
    );

    const result = await adapter.verifyPayment(req, xPayment);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payer).toBe(payer.publicKey.toBase58());
      expect(result.recipient).toBe(operator.publicKey.toBase58());
      expect(result.payer).not.toBe(result.recipient);
      expect(result.settledAmount).toBe('1000');
      expect(result.chain).toBe('solana-devnet');
      expect(result.asset).toBe(USDC_ADDRESSES['solana-devnet']);
    }
  });

  it('rejects a tx whose USDC transfer destination ≠ configured receiver ATA (forgery)', async () => {
    const payer = Keypair.generate();
    const realOperator = Keypair.generate();
    const attacker = Keypair.generate();

    const adapter = new SolanaAdapter({
      chainId: 'solana-devnet',
      rpcUrl: 'https://api.devnet.solana.com',
      receivingWallet: realOperator.publicKey.toBase58(),
    });

    const req = adapter.buildPaymentRequirements(
      { chain: 'solana-devnet', asset: USDC_ADDRESSES['solana-devnet'], amount: '1000' },
      { payTo: realOperator.publicKey.toBase58() },
    );

    // Build a tx that pays the ATTACKER's ATA, not the real operator's.
    const attackerAta = getAssociatedTokenAddressSync(DEVNET_USDC, attacker.publicKey, true);
    const txBase64 = buildSignedTransfer({
      payer,
      receiverAta: attackerAta,
      amount: BigInt(req.amount),
      memo: req.nonce,
    });

    const xPayment = encodeXPayment(
      {
        chain: 'solana-devnet',
        nonce: req.nonce,
        validUntil: req.validUntil,
        payTo: req.payTo,
        mint: req.asset,
        amount: req.amount,
      },
      txBase64,
    );

    const result = await adapter.verifyPayment(req, xPayment);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('RECIPIENT_MISMATCH');
    }
  });

  it('rejects a tx whose amount is below the requirement', async () => {
    const payer = Keypair.generate();
    const operator = Keypair.generate();
    const adapter = new SolanaAdapter({
      chainId: 'solana-devnet',
      rpcUrl: 'https://api.devnet.solana.com',
      receivingWallet: operator.publicKey.toBase58(),
    });

    const req = adapter.buildPaymentRequirements(
      { chain: 'solana-devnet', asset: USDC_ADDRESSES['solana-devnet'], amount: '5000' },
      { payTo: operator.publicKey.toBase58() },
    );

    const receiverAta = getAssociatedTokenAddressSync(DEVNET_USDC, operator.publicKey, true);
    const txBase64 = buildSignedTransfer({
      payer,
      receiverAta,
      amount: 1000n, // less than required 5000
      memo: req.nonce,
    });

    const xPayment = encodeXPayment(
      {
        chain: 'solana-devnet',
        nonce: req.nonce,
        validUntil: req.validUntil,
        payTo: req.payTo,
        mint: req.asset,
        amount: req.amount,
      },
      txBase64,
    );

    const result = await adapter.verifyPayment(req, xPayment);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('AMOUNT_INSUFFICIENT');
    }
  });

  it('rejects a tx that omits the memo instruction', async () => {
    const payer = Keypair.generate();
    const operator = Keypair.generate();
    const adapter = new SolanaAdapter({
      chainId: 'solana-devnet',
      rpcUrl: 'https://api.devnet.solana.com',
      receivingWallet: operator.publicKey.toBase58(),
    });

    const req = adapter.buildPaymentRequirements(
      { chain: 'solana-devnet', asset: USDC_ADDRESSES['solana-devnet'], amount: '1000' },
      { payTo: operator.publicKey.toBase58() },
    );

    // Manually build a tx with ONLY the transfer (no memo).
    const payerAta = getAssociatedTokenAddressSync(DEVNET_USDC, payer.publicKey, true);
    const receiverAta = getAssociatedTokenAddressSync(DEVNET_USDC, operator.publicKey, true);
    const transferIx = createTransferInstruction(
      payerAta,
      receiverAta,
      payer.publicKey,
      1000n,
      [],
      TOKEN_PROGRAM_ID,
    );
    const message = MessageV0.compile({
      payerKey: payer.publicKey,
      recentBlockhash: '11111111111111111111111111111111',
      instructions: [transferIx],
    });
    const tx = new VersionedTransaction(message);
    tx.sign([payer]);
    const txBase64 = Buffer.from(tx.serialize()).toString('base64');

    const xPayment = encodeXPayment(
      {
        chain: 'solana-devnet',
        nonce: req.nonce,
        validUntil: req.validUntil,
        payTo: req.payTo,
        mint: req.asset,
        amount: req.amount,
      },
      txBase64,
    );

    const result = await adapter.verifyPayment(req, xPayment);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // The adapter's own structured detail is "missing memo instruction".
      // Code defaults to INVALID_SIGNATURE per inspectInstructions's fallback.
      expect(result.detail).toMatch(/memo/i);
    }
  });

  it('rejects a tx that references a disallowed program', async () => {
    const payer = Keypair.generate();
    const operator = Keypair.generate();
    const adapter = new SolanaAdapter({
      chainId: 'solana-devnet',
      rpcUrl: 'https://api.devnet.solana.com',
      receivingWallet: operator.publicKey.toBase58(),
    });

    const req = adapter.buildPaymentRequirements(
      { chain: 'solana-devnet', asset: USDC_ADDRESSES['solana-devnet'], amount: '1000' },
      { payTo: operator.publicKey.toBase58() },
    );

    const receiverAta = getAssociatedTokenAddressSync(DEVNET_USDC, operator.publicKey, true);
    // Inject a benign-looking but disallowed program (the System Program is
    // not on the allowlist — only Token / Token-2022 / Memo / ComputeBudget /
    // AssociatedToken are).
    const systemProgramId = new PublicKey('11111111111111111111111111111111');
    const disallowedIx = new TransactionInstruction({
      programId: systemProgramId,
      keys: [],
      data: Buffer.from([]),
    });
    const txBase64 = buildSignedTransfer({
      payer,
      receiverAta,
      amount: BigInt(req.amount),
      memo: req.nonce,
      extraInstructions: [disallowedIx],
    });

    const xPayment = encodeXPayment(
      {
        chain: 'solana-devnet',
        nonce: req.nonce,
        validUntil: req.validUntil,
        payTo: req.payTo,
        mint: req.asset,
        amount: req.amount,
      },
      txBase64,
    );

    const result = await adapter.verifyPayment(req, xPayment);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.detail).toMatch(/disallowed program/);
    }
  });

  it('rejects a chain-id mismatch (mainnet auth against a devnet adapter)', async () => {
    const payer = Keypair.generate();
    const operator = Keypair.generate();
    const adapter = new SolanaAdapter({
      chainId: 'solana-devnet',
      rpcUrl: 'https://api.devnet.solana.com',
      receivingWallet: operator.publicKey.toBase58(),
    });

    const req = adapter.buildPaymentRequirements(
      { chain: 'solana-devnet', asset: USDC_ADDRESSES['solana-devnet'], amount: '1000' },
      { payTo: operator.publicKey.toBase58() },
    );

    const receiverAta = getAssociatedTokenAddressSync(DEVNET_USDC, operator.publicKey, true);
    const txBase64 = buildSignedTransfer({
      payer,
      receiverAta,
      amount: BigInt(req.amount),
      memo: req.nonce,
    });

    // Encode the envelope with chain=solana (mainnet) instead of devnet.
    const xPayment = Buffer.from(
      JSON.stringify({
        v: '1',
        chain: 'solana',
        scheme: 'exact',
        nonce: req.nonce,
        validUntil: req.validUntil,
        payTo: req.payTo,
        mint: USDC_ADDRESSES['solana'],
        amount: req.amount,
        transaction: txBase64,
      }),
    ).toString('base64');

    const result = await adapter.verifyPayment(req, xPayment);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('CHAIN_MISMATCH');
    }
  });

  // Sanity: helper functions are touched so coverage doesn't show them as
  // dead code on the off-chance a future test removes the only reference.
  it('uses the createAssociatedTokenAccountInstruction helper for type safety', () => {
    const payer = Keypair.generate();
    const operator = Keypair.generate();
    const operatorAta = getAssociatedTokenAddressSync(DEVNET_USDC, operator.publicKey, true);
    const ix = createAssociatedTokenAccountInstruction(
      payer.publicKey,
      operatorAta,
      operator.publicKey,
      DEVNET_USDC,
    );
    expect(ix.programId.toBase58()).toBe(SOLANA_PROGRAMS.ASSOCIATED_TOKEN);
  });
});
