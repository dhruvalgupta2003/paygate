import type { ChainId } from './constants.js';

// --------------------------------------------------------------------------
// Payment requirements — what the server advertises in a 402 response.
// --------------------------------------------------------------------------
export interface PaymentRequirements {
  readonly scheme: 'exact';
  readonly chain: ChainId;
  readonly asset: string;
  /** Amount in the asset's smallest unit as a base-10 string. */
  readonly amount: string;
  readonly payTo: string;
  readonly nonce: string;
  readonly digest: string;
  readonly validUntil: number;
  readonly facilitator?: string | undefined;
  readonly description?: string | undefined;
  readonly operator?:
    | {
        readonly name: string;
        readonly url?: string | undefined;
      }
    | undefined;
}

// --------------------------------------------------------------------------
// Payment auth — what the client sends in the X-PAYMENT header.
// --------------------------------------------------------------------------
export interface EvmPaymentAuth {
  readonly v: '1';
  readonly chain: 'base' | 'base-sepolia';
  readonly scheme: 'exact';
  readonly nonce: string;
  readonly validUntil: number;
  readonly payTo: string;
  readonly asset: string;
  readonly amount: string;
  readonly authorization: {
    readonly from: string;
    readonly to: string;
    readonly value: string;
    readonly validAfter: number;
    readonly validBefore: number;
    readonly nonce: `0x${string}`;
    readonly v: number;
    readonly r: `0x${string}`;
    readonly s: `0x${string}`;
  };
  readonly settlementTxHash?: string | undefined;
}

export interface SolanaPaymentAuth {
  readonly v: '1';
  readonly chain: 'solana' | 'solana-devnet';
  readonly scheme: 'exact';
  readonly nonce: string;
  readonly validUntil: number;
  readonly payTo: string;
  readonly mint: string;
  readonly amount: string;
  /** base64 versioned transaction, signed by the payer. */
  readonly transaction: string;
  readonly settlementSignature?: string | undefined;
}

export type PaymentAuth = EvmPaymentAuth | SolanaPaymentAuth;

// --------------------------------------------------------------------------
// Verification + settlement result.
// --------------------------------------------------------------------------
export interface VerifyOk {
  readonly ok: true;
  readonly settledAmount: string;
  readonly payer: string;
  readonly recipient: string;
  readonly chain: ChainId;
  readonly asset: string;
  readonly observedAt: number;
}

export interface VerifyFail {
  readonly ok: false;
  readonly code: string;
  readonly detail: string;
  readonly retryable: boolean;
}

export type VerifyResult = VerifyOk | VerifyFail;

export interface SettlementProof {
  readonly chain: ChainId;
  readonly txHash: string;
  readonly block?: number | undefined;
  readonly slot?: number | undefined;
  readonly amount: string;
  readonly payer: string;
  readonly recipient: string;
  readonly observedAt: number;
}

export interface PriceSpec {
  readonly chain: ChainId;
  readonly asset: string;
  readonly amount: string;
}

export interface RequirementOpts {
  readonly payTo: string;
  readonly validUntilSeconds?: number;
  readonly description?: string;
  readonly operator?: PaymentRequirements['operator'];
  readonly facilitator?: string;
}

// --------------------------------------------------------------------------
// ChainAdapter — each chain plugs in via this shape.
// --------------------------------------------------------------------------
export interface ChainAdapter {
  readonly id: ChainId;
  buildPaymentRequirements(spec: PriceSpec, opts: RequirementOpts): PaymentRequirements;
  verifyPayment(req: PaymentRequirements, xPayment: string): Promise<VerifyResult>;
  confirmPayment(proof: SettlementProof): Promise<VerifyResult>;
}

// --------------------------------------------------------------------------
// Logger surface — our own thin shape so the concrete logger can be swapped.
// --------------------------------------------------------------------------
export interface Logger {
  trace(obj: object, msg?: string): void;
  debug(obj: object, msg?: string): void;
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
  fatal(obj: object, msg?: string): void;
  child(bindings: Readonly<Record<string, unknown>>): Logger;
}

// --------------------------------------------------------------------------
// Compliance surface.
// --------------------------------------------------------------------------
export interface ComplianceDecision {
  readonly allowed: boolean;
  readonly reason?: string;
  readonly list?: string;
}

export interface ComplianceScreen {
  screenWallet(wallet: string, chain: ChainId): Promise<ComplianceDecision>;
  screenGeo(ipOrCountry: string): Promise<ComplianceDecision>;
}

// --------------------------------------------------------------------------
// Replay / nonce guard interface.
// --------------------------------------------------------------------------
export interface NonceStore {
  /** Set if absent; return true on success. */
  claim(nonce: string, ttlSeconds: number): Promise<boolean>;
  /** Store the digest tied to a nonce for later verification. */
  putRequirement(nonce: string, digest: string, ttlSeconds: number): Promise<void>;
  getRequirement(nonce: string): Promise<string | null>;
}

// --------------------------------------------------------------------------
// Framework-agnostic request/response shapes used by the core proxy.
// --------------------------------------------------------------------------
export interface LimenRequest {
  readonly method: string;
  readonly url: string;
  readonly path: string;
  readonly query: Readonly<Record<string, string | readonly string[] | undefined>>;
  readonly headers: Readonly<Record<string, string | readonly string[] | undefined>>;
  readonly ip: string | undefined;
  readonly body: ArrayBuffer | Uint8Array | undefined;
}

export interface LimenResponse {
  status: number;
  headers: Record<string, string>;
  body: Uint8Array | string | undefined;
}

export interface ForwardOptions {
  readonly upstream: string;
  readonly timeoutMs?: number;
}
