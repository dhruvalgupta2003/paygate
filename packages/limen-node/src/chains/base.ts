import {
  createPublicClient,
  http,
  getAddress,
  hexToBytes,
  recoverTypedDataAddress,
  type Address,
  type Hex,
} from 'viem';
import { base, baseSepolia } from 'viem/chains';

// Minimal interface we actually use.  Avoids leaking viem's deeply-generic
// PublicClient type through our .d.ts — tsup's DTS rollup chokes on it.
interface MinimalRpcClient {
  readContract: (args: {
    address: Address;
    abi: readonly unknown[];
    functionName: string;
    args?: readonly unknown[];
  }) => Promise<unknown>;
  getTransactionReceipt: (args: { hash: Hex }) => Promise<{
    status: 'success' | 'reverted';
    blockNumber: bigint;
    to: Address | null;
    logs: ReadonlyArray<{ address: Address; topics: readonly Hex[]; data: Hex }>;
  }>;
  getBlockNumber: () => Promise<bigint>;
}

// USDC's ERC-20 Transfer event signature topic.
// keccak256("Transfer(address,address,uint256)")
const TRANSFER_TOPIC: Hex =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

function topicToAddress(topic: Hex): Address {
  // topics are left-padded 32-byte values; address is the last 20 bytes
  return getAddress(`0x${topic.slice(26)}`);
}
import {
  EIP712_DOMAIN,
  EvmChainId,
  USDC_ADDRESSES,
  X402_VERSION,
} from '../constants.js';
import { LimenError } from '../errors.js';
import {
  type ChainAdapter,
  type EvmPaymentAuth,
  type PaymentRequirements,
  type PriceSpec,
  type RequirementOpts,
  type SettlementProof,
  type VerifyResult,
} from '../types.js';
import { digestRequirements } from '../utils/digest.js';
import { epochSeconds, generateNonce } from '../utils/nonce.js';
import { decodePaymentHeader, isEvmAuth } from '../proxy/handshake.js';

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
    name: 'authorizationState',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'authorizer', type: 'address' },
      { name: 'nonce', type: 'bytes32' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
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

export interface BaseAdapterOptions {
  readonly chainId: 'base' | 'base-sepolia';
  readonly rpcUrl: string;
  readonly confirmations?: number;
  readonly receivingWallet: string;
  readonly facilitatorUrl?: string;
  /** If true, skip the on-chain `authorizationState` nonce check.  Use only
   *  for local demo / dev runs where the agent is not actually settling. */
  readonly devMode?: boolean;
}

export class BaseAdapter implements ChainAdapter {
  // Narrowed to EVM chains — EIP712_DOMAIN only has entries for base/base-sepolia.
  readonly id: 'base' | 'base-sepolia';
  private readonly client: MinimalRpcClient;
  private readonly usdc: Address;
  private readonly receiver: Address;
  private readonly confirmations: number;
  private readonly facilitatorUrl: string | undefined;
  private readonly devMode: boolean;
  private readonly chainMeta: typeof base | typeof baseSepolia;

  constructor(opts: BaseAdapterOptions) {
    this.id = opts.chainId;
    this.chainMeta = opts.chainId === 'base' ? base : baseSepolia;
    this.client = createPublicClient({
      chain: this.chainMeta,
      transport: http(opts.rpcUrl, { batch: true, retryCount: 2, retryDelay: 200 }),
    }) as unknown as MinimalRpcClient;
    this.devMode = opts.devMode === true;
    this.usdc = getAddress(USDC_ADDRESSES[opts.chainId]);
    this.receiver = getAddress(opts.receivingWallet);
    this.confirmations = opts.confirmations ?? 2;
    this.facilitatorUrl = opts.facilitatorUrl;
  }

  buildPaymentRequirements(spec: PriceSpec, opts: RequirementOpts): PaymentRequirements {
    if (spec.chain !== this.id) {
      throw new LimenError({
        code: 'CHAIN_MISMATCH',
        detail: `adapter ${this.id} cannot serve chain ${spec.chain}`,
      });
    }
    const ttl = opts.validUntilSeconds ?? 300;
    const digestable: Omit<PaymentRequirements, 'digest' | 'nonce'> = {
      scheme: 'exact',
      chain: this.id,
      asset: this.usdc,
      amount: spec.amount,
      payTo: this.receiver,
      validUntil: epochSeconds() + ttl,
      ...(this.facilitatorUrl !== undefined ? { facilitator: this.facilitatorUrl } : {}),
      ...(opts.description !== undefined ? { description: opts.description } : {}),
      ...(opts.operator !== undefined ? { operator: opts.operator } : {}),
    };
    const partialDigest = digestRequirements({ ...digestable, nonce: '' });
    const nonce = generateNonce(partialDigest);
    const almost = { ...digestable, nonce };
    const digest = digestRequirements(almost);
    return { ...almost, digest };
  }

  async verifyPayment(req: PaymentRequirements, xPayment: string): Promise<VerifyResult> {
    const auth = decodePaymentHeader(xPayment);
    if (!isEvmAuth(auth)) {
      return { ok: false, code: 'CHAIN_MISMATCH', detail: 'non-evm auth for evm chain', retryable: false };
    }
    if (auth.chain !== req.chain) {
      return { ok: false, code: 'CHAIN_MISMATCH', detail: `req=${req.chain} auth=${auth.chain}`, retryable: false };
    }
    if (getAddress(auth.asset) !== this.usdc) {
      return { ok: false, code: 'ASSET_MISMATCH', detail: `asset != canonical USDC`, retryable: false };
    }
    if (getAddress(auth.payTo) !== this.receiver) {
      return { ok: false, code: 'RECIPIENT_MISMATCH', detail: `payTo != configured wallet`, retryable: false };
    }
    if (auth.nonce !== req.nonce) {
      return { ok: false, code: 'DIGEST_MISMATCH', detail: 'nonce mismatch', retryable: false };
    }
    const nowSec = epochSeconds();
    if (nowSec > req.validUntil) {
      return { ok: false, code: 'EXPIRED_AUTHORIZATION', detail: 'requirements expired', retryable: true };
    }
    if (nowSec < auth.authorization.validAfter || nowSec > auth.authorization.validBefore) {
      return {
        ok: false,
        code: 'EXPIRED_AUTHORIZATION',
        detail: 'EIP-3009 authorization is not currently valid',
        retryable: true,
      };
    }

    const requiredValue = BigInt(req.amount);
    const providedValue = BigInt(auth.authorization.value);
    if (providedValue < requiredValue) {
      return {
        ok: false,
        code: 'AMOUNT_INSUFFICIENT',
        detail: `required ${requiredValue}, got ${providedValue}`,
        retryable: true,
      };
    }
    if (getAddress(auth.authorization.to) !== this.receiver) {
      return { ok: false, code: 'RECIPIENT_MISMATCH', detail: `authorization.to != receiver`, retryable: false };
    }

    // Signature verification (I6).  Constant-time via viem.
    const recovered = await recoverTypedDataAddress({
      domain: EIP712_DOMAIN[this.id],
      types: EIP712_TYPES,
      primaryType: 'TransferWithAuthorization',
      message: {
        from: getAddress(auth.authorization.from),
        to: getAddress(auth.authorization.to),
        value: providedValue,
        validAfter: BigInt(auth.authorization.validAfter),
        validBefore: BigInt(auth.authorization.validBefore),
        nonce: auth.authorization.nonce,
      },
      signature: buildSignature(auth),
    });
    if (recovered.toLowerCase() !== auth.authorization.from.toLowerCase()) {
      return { ok: false, code: 'INVALID_SIGNATURE', detail: 'signature does not recover to from', retryable: false };
    }

    // Authorization-nonce sanity.
    const nonceBytes = hexToBytes(auth.authorization.nonce);
    if (nonceBytes.length !== 32) {
      return {
        ok: false,
        code: 'INVALID_SIGNATURE',
        detail: 'authorization nonce must be bytes32',
        retryable: false,
      };
    }

    // Dev mode short-circuits.  Signature verification still ran above.
    if (this.devMode) {
      return {
        ok: true,
        settledAmount: String(providedValue),
        payer: getAddress(auth.authorization.from),
        recipient: this.receiver,
        chain: this.id,
        asset: this.usdc,
        observedAt: nowSec,
      };
    }

    // Production path: the agent must have already submitted the transfer
    // and given us the tx hash.  We confirm the transfer happened on-chain
    // with the right (from, to, value).  Limen doesn't submit txs in
    // v0.x — that responsibility is on the agent or the facilitator.
    if (!auth.settlementTxHash) {
      // Check whether the auth was already used (possibly by a different
      // submitter) and provide a useful error either way.
      try {
        const used = await this.client.readContract({
          address: this.usdc,
          abi: USDC_ABI,
          functionName: 'authorizationState',
          args: [getAddress(auth.authorization.from), auth.authorization.nonce],
        });
        if (used === true) {
          return {
            ok: false,
            code: 'NONCE_REUSED',
            detail:
              'authorization nonce already consumed on-chain; include the settlement tx hash in X-PAYMENT.settlementTxHash so Limen can verify it',
            retryable: false,
          };
        }
        return {
          ok: false,
          code: 'SETTLEMENT_PENDING',
          detail:
            'authorization signed but not yet submitted on-chain; submit transferWithAuthorization and retry with X-PAYMENT.settlementTxHash',
          retryable: true,
        };
      } catch (err) {
        return {
          ok: false,
          code: 'RPC_UNAVAILABLE',
          detail: `rpc call failed: ${(err as Error).message}`,
          retryable: true,
        };
      }
    }

    return this.confirmEvmSettlement(
      auth.settlementTxHash as Hex,
      getAddress(auth.authorization.from),
      providedValue,
      nowSec,
    );
  }

  /** Verify an already-submitted Transfer event matches the signed auth. */
  private async confirmEvmSettlement(
    txHash: Hex,
    expectedFrom: Address,
    expectedValue: bigint,
    observedAt: number,
  ): Promise<VerifyResult> {
    let receipt: Awaited<ReturnType<MinimalRpcClient['getTransactionReceipt']>>;
    try {
      receipt = await this.client.getTransactionReceipt({ hash: txHash });
    } catch (err) {
      return {
        ok: false,
        code: 'SETTLEMENT_PENDING',
        detail: `tx ${txHash} not yet visible: ${(err as Error).message}`,
        retryable: true,
      };
    }

    if (receipt.status !== 'success') {
      return { ok: false, code: 'SETTLEMENT_FAILED', detail: 'tx reverted', retryable: false };
    }

    const txTo = receipt.to === null ? null : getAddress(receipt.to);
    if (txTo !== this.usdc) {
      return {
        ok: false,
        code: 'ASSET_MISMATCH',
        detail: `tx.to=${txTo ?? 'null'} is not the USDC contract ${this.usdc}`,
        retryable: false,
      };
    }

    // Find a matching ERC-20 Transfer log.
    const match = receipt.logs.find((log) => {
      if (getAddress(log.address) !== this.usdc) return false;
      if (log.topics[0] !== TRANSFER_TOPIC) return false;
      if (log.topics.length < 3) return false;
      const fromTopic = log.topics[1];
      const toTopic = log.topics[2];
      if (!fromTopic || !toTopic) return false;
      const from = topicToAddress(fromTopic);
      const to = topicToAddress(toTopic);
      if (from !== expectedFrom) return false;
      if (to !== this.receiver) return false;
      const value = BigInt(log.data || '0x0');
      return value >= expectedValue;
    });

    if (!match) {
      return {
        ok: false,
        code: 'AMOUNT_INSUFFICIENT',
        detail: `no matching USDC Transfer (from=${expectedFrom}, to=${this.receiver}, value≥${expectedValue}) in tx ${txHash}`,
        retryable: false,
      };
    }

    // Confirmation depth.
    //
    // Convention (matches viem, ethers, bitcoin-style counting): "N
    // confirmations" means the tx's own block plus (N-1) blocks on top.
    // So "1 confirmation" = "the tx is included in the canonical chain"
    // — which is the moment the receipt exists at all.
    //
    // `latest - receipt.blockNumber` can be negative on load-balanced
    // public RPCs (one replica already saw the block, another hasn't);
    // clamp to 0.
    let latest: bigint;
    try {
      latest = await this.client.getBlockNumber();
    } catch (err) {
      return {
        ok: false,
        code: 'RPC_UNAVAILABLE',
        detail: `getBlockNumber failed: ${(err as Error).message}`,
        retryable: true,
      };
    }
    const blocksAtopTx = Math.max(0, Number(latest - receipt.blockNumber));
    const confirmations = blocksAtopTx + 1;
    if (confirmations < this.confirmations) {
      return {
        ok: false,
        code: 'SETTLEMENT_PENDING',
        detail: `need ${this.confirmations} confirmations, have ${confirmations}`,
        retryable: true,
      };
    }

    return {
      ok: true,
      settledAmount: String(expectedValue),
      payer: expectedFrom,
      recipient: this.receiver,
      chain: this.id,
      asset: this.usdc,
      observedAt,
    };
  }

  async confirmPayment(proof: SettlementProof): Promise<VerifyResult> {
    try {
      const receipt = await this.client.getTransactionReceipt({ hash: proof.txHash as Hex });
      if (receipt.status !== 'success') {
        return { ok: false, code: 'SETTLEMENT_FAILED', detail: `tx reverted`, retryable: true };
      }
      if (getAddress(receipt.to ?? '0x0') !== this.usdc) {
        return { ok: false, code: 'ASSET_MISMATCH', detail: 'tx.to != USDC', retryable: false };
      }
      const latest = await this.client.getBlockNumber();
      const confirmations = Number(latest - receipt.blockNumber);
      if (confirmations < this.confirmations) {
        return {
          ok: false,
          code: 'SETTLEMENT_PENDING',
          detail: `need ${this.confirmations} confirmations, have ${confirmations}`,
          retryable: true,
        };
      }
      return {
        ok: true,
        settledAmount: proof.amount,
        payer: proof.payer,
        recipient: proof.recipient,
        chain: this.id,
        asset: this.usdc,
        observedAt: proof.observedAt,
      };
    } catch (err) {
      return {
        ok: false,
        code: 'RPC_UNAVAILABLE',
        detail: `rpc error: ${(err as Error).message}`,
        retryable: true,
      };
    }
  }

  /** Submit the signed authorization on-chain (direct mode). */
  async submitTransferWithAuthorization(auth: EvmPaymentAuth, signerWalletClient: unknown): Promise<Hex> {
    // Implementation requires a wallet client (out of scope for the core
    // adapter; facilitator mode is the recommended production path).
    throw new LimenError({
      code: 'BAD_CONFIG',
      detail: 'direct-submission requires a configured signer; use facilitator mode',
      cause: { auth: auth.nonce, signerWalletClient: typeof signerWalletClient },
    });
  }
}

function buildSignature(auth: EvmPaymentAuth): Hex {
  // v/r/s → flat 65-byte signature.
  const v = auth.authorization.v;
  const vByte = v === 27 || v === 28 ? v : v + 27;
  const r = auth.authorization.r.slice(2).padStart(64, '0');
  const s = auth.authorization.s.slice(2).padStart(64, '0');
  return `0x${r}${s}${vByte.toString(16).padStart(2, '0')}` as Hex;
}

// Tiny helper to confirm we're wired up correctly at import-time.
export const BASE_ADAPTER_X402_VERSION = X402_VERSION;
export const BASE_ADAPTER_CHAIN_ID = EvmChainId;
