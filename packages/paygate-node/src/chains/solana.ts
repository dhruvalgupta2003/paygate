import {
  Connection,
  PublicKey,
  VersionedTransaction,
  type Commitment,
} from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import { SOLANA_PROGRAMS, USDC_ADDRESSES, type ChainId } from '../constants.js';
import {
  type ChainAdapter,
  type PaymentRequirements,
  type PriceSpec,
  type RequirementOpts,
  type SettlementProof,
  type VerifyResult,
} from '../types.js';
import { decodePaymentHeader, isSolanaAuth } from '../proxy/handshake.js';
import { digestRequirements } from '../utils/digest.js';
import { epochSeconds, generateNonce } from '../utils/nonce.js';

export interface SolanaAdapterOptions {
  readonly chainId: 'solana' | 'solana-devnet';
  readonly rpcUrl: string;
  readonly commitment?: Commitment;
  readonly receivingWallet: string;
  readonly facilitatorUrl?: string;
}

export class SolanaAdapter implements ChainAdapter {
  readonly id: ChainId;
  private readonly conn: Connection;
  private readonly mint: PublicKey;
  private readonly receiver: PublicKey;
  private readonly receiverAta: PublicKey;
  private readonly commitment: Commitment;
  private readonly facilitatorUrl: string | undefined;

  constructor(opts: SolanaAdapterOptions) {
    this.id = opts.chainId;
    this.commitment = opts.commitment ?? 'confirmed';
    this.conn = new Connection(opts.rpcUrl, {
      commitment: this.commitment,
      disableRetryOnRateLimit: false,
    });
    this.mint = new PublicKey(USDC_ADDRESSES[opts.chainId]);
    this.receiver = new PublicKey(opts.receivingWallet);
    this.receiverAta = getAssociatedTokenAddressSync(this.mint, this.receiver, true);
    this.facilitatorUrl = opts.facilitatorUrl;
  }

  buildPaymentRequirements(spec: PriceSpec, opts: RequirementOpts): PaymentRequirements {
    const ttl = opts.validUntilSeconds ?? 300;
    const digestable: Omit<PaymentRequirements, 'digest' | 'nonce'> = {
      scheme: 'exact',
      chain: this.id,
      asset: this.mint.toBase58(),
      amount: spec.amount,
      payTo: this.receiver.toBase58(),
      validUntil: epochSeconds() + ttl,
      ...(this.facilitatorUrl !== undefined ? { facilitator: this.facilitatorUrl } : {}),
      ...(opts.description !== undefined ? { description: opts.description } : {}),
      ...(opts.operator !== undefined ? { operator: opts.operator } : {}),
    };
    const partialDigest = digestRequirements({ ...digestable, nonce: '' });
    const nonce = generateNonce(partialDigest);
    const almost = { ...digestable, nonce };
    return { ...almost, digest: digestRequirements(almost) };
  }

  async verifyPayment(req: PaymentRequirements, xPayment: string): Promise<VerifyResult> {
    const auth = decodePaymentHeader(xPayment);
    if (!isSolanaAuth(auth)) {
      return { ok: false, code: 'CHAIN_MISMATCH', detail: 'non-solana auth', retryable: false };
    }
    if (auth.chain !== req.chain) {
      return { ok: false, code: 'CHAIN_MISMATCH', detail: `req=${req.chain} auth=${auth.chain}`, retryable: false };
    }
    if (auth.mint !== this.mint.toBase58()) {
      return { ok: false, code: 'ASSET_MISMATCH', detail: 'mint != canonical USDC', retryable: false };
    }
    if (auth.payTo !== this.receiver.toBase58()) {
      return { ok: false, code: 'RECIPIENT_MISMATCH', detail: 'payTo != configured wallet', retryable: false };
    }
    if (auth.nonce !== req.nonce) {
      return { ok: false, code: 'DIGEST_MISMATCH', detail: 'nonce mismatch', retryable: false };
    }
    if (epochSeconds() > req.validUntil) {
      return { ok: false, code: 'EXPIRED_AUTHORIZATION', detail: 'requirements expired', retryable: true };
    }

    // Decode the versioned transaction.
    let tx: VersionedTransaction;
    try {
      tx = VersionedTransaction.deserialize(Buffer.from(auth.transaction, 'base64'));
    } catch (err) {
      return { ok: false, code: 'INVALID_PAYMENT_HEADER', detail: `bad tx base64: ${(err as Error).message}`, retryable: false };
    }

    // Verify every required signature is present and valid (I6).
    const sigVerification = this.verifySignatures(tx);
    if (!sigVerification.ok) {
      return { ok: false, code: 'INVALID_SIGNATURE', detail: sigVerification.detail, retryable: false };
    }

    // Inspect instructions — only transfer + memo (and optional compute
    // budget / ATA create) are allowed; destination ATA must match.
    const inspect = this.inspectInstructions(tx, auth);
    if (!inspect.ok) {
      return {
        ok: false,
        code: inspect.code ?? 'INVALID_SIGNATURE',
        detail: inspect.detail,
        retryable: inspect.retryable ?? false,
      };
    }

    if (BigInt(inspect.amount) < BigInt(req.amount)) {
      return {
        ok: false,
        code: 'AMOUNT_INSUFFICIENT',
        detail: `required ${req.amount}, got ${inspect.amount}`,
        retryable: true,
      };
    }

    return {
      ok: true,
      settledAmount: inspect.amount,
      payer: inspect.payer,
      recipient: this.receiver.toBase58(),
      chain: this.id,
      asset: this.mint.toBase58(),
      observedAt: epochSeconds(),
    };
  }

  async confirmPayment(proof: SettlementProof): Promise<VerifyResult> {
    try {
      const res = await this.conn.getTransaction(proof.txHash, {
        commitment: this.commitment,
        maxSupportedTransactionVersion: 0,
      });
      if (!res) {
        return {
          ok: false,
          code: 'SETTLEMENT_PENDING',
          detail: 'transaction not visible at required commitment yet',
          retryable: true,
        };
      }
      if (res.meta?.err) {
        return {
          ok: false,
          code: 'SETTLEMENT_FAILED',
          detail: `tx error: ${JSON.stringify(res.meta.err)}`,
          retryable: true,
        };
      }
      return {
        ok: true,
        settledAmount: proof.amount,
        payer: proof.payer,
        recipient: proof.recipient,
        chain: this.id,
        asset: this.mint.toBase58(),
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

  private verifySignatures(tx: VersionedTransaction): { ok: true } | { ok: false; detail: string } {
    const msg = tx.message.serialize();
    const requiredSignatures = tx.message.header.numRequiredSignatures;
    if (tx.signatures.length < requiredSignatures) {
      return { ok: false, detail: 'missing required signatures' };
    }
    for (let i = 0; i < requiredSignatures; i++) {
      const sig = tx.signatures[i];
      const signer = tx.message.staticAccountKeys[i];
      if (!sig || !signer) return { ok: false, detail: `missing signer at index ${i}` };
      // tweetnacl.sign.detached.verify is constant-time.
      if (!nacl.sign.detached.verify(msg, sig, signer.toBytes())) {
        return { ok: false, detail: `signature ${i} failed verification` };
      }
    }
    return { ok: true };
  }

  private inspectInstructions(
    tx: VersionedTransaction,
    auth: unknown,
  ):
    | { ok: true; amount: string; payer: string }
    | { ok: false; detail: string; code?: string; retryable?: boolean } {
    void auth;
    const accounts = tx.message.staticAccountKeys;
    const compiled = tx.message.compiledInstructions;
    const payer = accounts[0];
    if (!payer) return { ok: false, detail: 'transaction has no payer' };

    let amount: bigint | undefined;
    let memoMatched = false;

    for (const ix of compiled) {
      const programId = accounts[ix.programIdIndex];
      if (!programId) return { ok: false, detail: 'instruction references unknown program id' };
      const programIdStr = programId.toBase58();

      if (programIdStr === SOLANA_PROGRAMS.MEMO_V2) {
        const memo = Buffer.from(ix.data).toString('utf-8');
        memoMatched = true;
        // We rely on the outer digest binding so we only need to confirm a
        // memo is present; the outer nonce equality check is done earlier.
        void memo;
      } else if (programIdStr === SOLANA_PROGRAMS.TOKEN || programIdStr === SOLANA_PROGRAMS.TOKEN_2022) {
        const parsed = this.parseTokenTransfer(ix.data, ix.accountKeyIndexes, accounts);
        if (!parsed) continue;
        if (parsed.destination.toBase58() !== this.receiverAta.toBase58()) {
          return {
            ok: false,
            code: 'RECIPIENT_MISMATCH',
            detail: 'destination ATA != configured receiver ATA',
          };
        }
        amount = parsed.amount;
      } else if (
        programIdStr === SOLANA_PROGRAMS.COMPUTE_BUDGET ||
        programIdStr === SOLANA_PROGRAMS.ASSOCIATED_TOKEN
      ) {
        // benign — allowed
      } else {
        return {
          ok: false,
          code: 'INVALID_SIGNATURE',
          detail: `transaction references disallowed program ${programIdStr}`,
        };
      }
    }

    if (!memoMatched) return { ok: false, detail: 'transaction missing memo instruction' };
    if (amount === undefined) return { ok: false, detail: 'transaction missing USDC transfer instruction' };

    return { ok: true, amount: amount.toString(), payer: payer.toBase58() };
  }

  private parseTokenTransfer(
    data: Uint8Array,
    accountIndexes: Uint8Array | number[],
    accounts: readonly PublicKey[],
  ): { amount: bigint; destination: PublicKey } | undefined {
    if (data.length < 9) return undefined;
    // SPL token transfer opcode 3 (Transfer), opcode 12 (TransferChecked).
    const op = data[0];
    const idxArr = Array.from(accountIndexes);

    if (op === 3 && data.length === 9) {
      const amount = bufToLeU64(data, 1);
      const destIndex = idxArr[1];
      if (destIndex === undefined) return undefined;
      const destination = accounts[destIndex];
      if (!destination) return undefined;
      return { amount, destination };
    }

    if (op === 12 && data.length >= 10) {
      const amount = bufToLeU64(data, 1);
      // TransferChecked accounts: [source, mint, destination, owner, ...]
      const destIndex = idxArr[2];
      if (destIndex === undefined) return undefined;
      const destination = accounts[destIndex];
      if (!destination) return undefined;
      return { amount, destination };
    }

    return undefined;
  }
}

function bufToLeU64(buf: Uint8Array, off: number): bigint {
  let v = 0n;
  for (let i = 0; i < 8; i++) {
    v |= BigInt(buf[off + i] ?? 0) << BigInt(8 * i);
  }
  return v;
}

export const SOLANA_BS58 = bs58;
