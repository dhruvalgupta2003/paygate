/**
 * Two-wallet (non-self-loop) tests for BaseAdapter.
 *
 * These exist primarily to prove that the verification + submission paths
 * correctly carry distinct payer/recipient addresses end-to-end — i.e. that
 * an agent with wallet A can pay an operator with wallet B.  Earlier demos
 * accidentally signed with the same wallet they configured as receiver,
 * which silently masked recipient-mismatch bugs.
 */

import { describe, it, expect } from 'vitest';
import { createWalletClient, decodeFunctionData, getAddress, http, type Hex } from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { BaseAdapter, type MinimalWalletClient } from '../src/chains/base.js';
import { EIP712_DOMAIN, USDC_ADDRESSES } from '../src/constants.js';

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

const USDC_ABI = [
  {
    name: 'transferWithAuthorization',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' },
      { name: 'v', type: 'uint8' },
      { name: 'r', type: 'bytes32' },
      { name: 's', type: 'bytes32' },
    ],
    outputs: [],
  },
] as const;

interface SignedAuth {
  readonly from: `0x${string}`;
  readonly to: `0x${string}`;
  readonly value: bigint;
  readonly validAfter: bigint;
  readonly validBefore: bigint;
  readonly nonce: `0x${string}`;
  readonly v: number;
  readonly r: `0x${string}`;
  readonly s: `0x${string}`;
}

async function signAuthAsWalletA(opts: {
  payerPk: Hex;
  payTo: `0x${string}`;
  value: bigint;
  validAfter: number;
  validBefore: number;
}): Promise<SignedAuth> {
  const account = privateKeyToAccount(opts.payerPk);
  const wallet = createWalletClient({ account, chain: baseSepolia, transport: http() });
  const authNonce: `0x${string}` = `0x${'ab'.repeat(32)}`;
  const sig = await wallet.signTypedData({
    domain: EIP712_DOMAIN['base-sepolia'],
    types: EIP712_TYPES,
    primaryType: 'TransferWithAuthorization',
    message: {
      from: account.address,
      to: opts.payTo,
      value: opts.value,
      validAfter: BigInt(opts.validAfter),
      validBefore: BigInt(opts.validBefore),
      nonce: authNonce,
    },
  });
  // viem's parseSignature returns r/s/v
  const { parseSignature } = await import('viem');
  const { r, s, v } = parseSignature(sig);
  return {
    from: account.address,
    to: opts.payTo,
    value: opts.value,
    validAfter: BigInt(opts.validAfter),
    validBefore: BigInt(opts.validBefore),
    nonce: authNonce,
    v: Number(v ?? 27),
    r,
    s,
  };
}

function encodeXPayment(req: {
  chain: 'base-sepolia';
  nonce: string;
  validUntil: number;
  payTo: string;
  asset: string;
  amount: string;
}, auth: SignedAuth): string {
  return Buffer.from(
    JSON.stringify({
      v: '1',
      chain: req.chain,
      scheme: 'exact',
      nonce: req.nonce,
      validUntil: req.validUntil,
      payTo: req.payTo,
      asset: req.asset,
      amount: req.amount,
      authorization: {
        from: auth.from,
        to: auth.to,
        value: auth.value.toString(),
        validAfter: Number(auth.validAfter),
        validBefore: Number(auth.validBefore),
        nonce: auth.nonce,
        v: auth.v,
        r: auth.r,
        s: auth.s,
      },
    }),
  ).toString('base64');
}

describe('BaseAdapter — two-wallet (non-self-loop) flow', () => {
  it('verifies a payment from wallet A to operator wallet B in dev mode', async () => {
    const operatorPk = generatePrivateKey();
    const payerPk = generatePrivateKey();
    const operatorAddr = privateKeyToAccount(operatorPk).address;
    const payerAddr = privateKeyToAccount(payerPk).address;

    expect(operatorAddr).not.toBe(payerAddr);

    const adapter = new BaseAdapter({
      chainId: 'base-sepolia',
      rpcUrl: 'https://sepolia.base.org',
      receivingWallet: operatorAddr,
      devMode: true,
    });

    const req = adapter.buildPaymentRequirements(
      { chain: 'base-sepolia', asset: USDC_ADDRESSES['base-sepolia'], amount: '1000' },
      { payTo: operatorAddr },
    );

    const auth = await signAuthAsWalletA({
      payerPk,
      payTo: getAddress(req.payTo) as `0x${string}`,
      value: BigInt(req.amount),
      validAfter: Math.floor(Date.now() / 1000) - 60,
      validBefore: req.validUntil,
    });
    const xPayment = encodeXPayment(
      { chain: 'base-sepolia', nonce: req.nonce, validUntil: req.validUntil, payTo: req.payTo, asset: req.asset, amount: req.amount },
      auth,
    );

    const result = await adapter.verifyPayment(req, xPayment);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payer).toBe(payerAddr);
      expect(result.recipient).toBe(operatorAddr);
      expect(result.payer).not.toBe(result.recipient);
      expect(result.settledAmount).toBe('1000');
    }
  });

  it('rejects a self-loop where authorization.to ≠ configured receiver', async () => {
    const operatorPk = generatePrivateKey();
    const payerPk = generatePrivateKey();
    const operatorAddr = privateKeyToAccount(operatorPk).address;
    const payerAddr = privateKeyToAccount(payerPk).address;

    const adapter = new BaseAdapter({
      chainId: 'base-sepolia',
      rpcUrl: 'https://sepolia.base.org',
      receivingWallet: operatorAddr,
      devMode: true,
    });

    const req = adapter.buildPaymentRequirements(
      { chain: 'base-sepolia', asset: USDC_ADDRESSES['base-sepolia'], amount: '1000' },
      { payTo: operatorAddr },
    );

    // Payer signs an authorization paying THEMSELVES instead of the operator.
    const auth = await signAuthAsWalletA({
      payerPk,
      payTo: payerAddr as `0x${string}`,
      value: BigInt(req.amount),
      validAfter: Math.floor(Date.now() / 1000) - 60,
      validBefore: req.validUntil,
    });
    // Tamper the envelope to claim it's paying the operator.
    const xPayment = encodeXPayment(
      { chain: 'base-sepolia', nonce: req.nonce, validUntil: req.validUntil, payTo: req.payTo, asset: req.asset, amount: req.amount },
      auth,
    );

    const result = await adapter.verifyPayment(req, xPayment);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Either the signature recovery fails (because the auth.to doesn't
      // match what we hashed) or the recipient check fires.  Both prove
      // the adapter refuses to settle a self-loop forgery.
      expect(['INVALID_SIGNATURE', 'RECIPIENT_MISMATCH']).toContain(result.code);
    }
  });

  it('submitTransferWithAuthorization builds calldata routing A → B on USDC', async () => {
    const operatorPk = generatePrivateKey();
    const payerPk = generatePrivateKey();
    const operatorAddr = privateKeyToAccount(operatorPk).address;
    const payerAddr = privateKeyToAccount(payerPk).address;

    const adapter = new BaseAdapter({
      chainId: 'base-sepolia',
      rpcUrl: 'https://sepolia.base.org',
      receivingWallet: operatorAddr,
      devMode: true,
    });

    const auth = await signAuthAsWalletA({
      payerPk,
      payTo: operatorAddr as `0x${string}`,
      value: 1234n,
      validAfter: Math.floor(Date.now() / 1000) - 60,
      validBefore: Math.floor(Date.now() / 1000) + 600,
    });

    let captured: { to: `0x${string}`; data: `0x${string}` } | undefined;
    const fakeWallet: MinimalWalletClient = {
      async sendTransaction(args) {
        captured = args;
        return ('0x' + 'ee'.repeat(32)) as `0x${string}`;
      },
    };

    const txHash = await adapter.submitTransferWithAuthorization(
      {
        v: '1',
        chain: 'base-sepolia',
        scheme: 'exact',
        nonce: 'demo',
        validUntil: Math.floor(Date.now() / 1000) + 600,
        payTo: operatorAddr,
        asset: USDC_ADDRESSES['base-sepolia'],
        amount: '1234',
        authorization: {
          from: auth.from,
          to: auth.to,
          value: auth.value.toString(),
          validAfter: Number(auth.validAfter),
          validBefore: Number(auth.validBefore),
          nonce: auth.nonce,
          v: auth.v,
          r: auth.r,
          s: auth.s,
        },
      },
      fakeWallet,
    );

    expect(txHash).toMatch(/^0x[a-f0-9]{64}$/);
    expect(captured).toBeDefined();
    expect(getAddress(captured!.to)).toBe(getAddress(USDC_ADDRESSES['base-sepolia']));

    const decoded = decodeFunctionData({ abi: USDC_ABI, data: captured!.data });
    expect(decoded.functionName).toBe('transferWithAuthorization');
    const args = decoded.args as readonly unknown[];
    expect(getAddress(args[0] as `0x${string}`)).toBe(payerAddr);
    expect(getAddress(args[1] as `0x${string}`)).toBe(operatorAddr);
    expect(args[2]).toBe(1234n);
  });
});
