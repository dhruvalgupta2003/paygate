import { z } from 'zod';
import { MAX_X_PAYMENT_HEADER_BYTES, X402_VERSION } from '../constants.js';
import { PayGateError } from '../errors.js';
import type {
  EvmPaymentAuth,
  PaymentAuth,
  PaymentRequirements,
  SolanaPaymentAuth,
} from '../types.js';

// --- PaymentRequirements encoder ------------------------------------------
export function encodeRequirements(req: PaymentRequirements): {
  status: 402;
  headers: Record<string, string>;
  body: Record<string, unknown>;
} {
  return {
    status: 402,
    headers: {
      'Content-Type': 'application/vnd.x402+json',
      'x402-version': X402_VERSION,
      'Cache-Control': 'no-store',
    },
    body: {
      error: 'PAYMENT_REQUIRED',
      paymentRequirements: req,
      retryable: true,
      docs: 'https://paygate.dev/docs/errors#payment_required',
    },
  };
}

// --- X-PAYMENT header decoder ---------------------------------------------
const evmAuth = z.object({
  v: z.literal('1'),
  chain: z.enum(['base', 'base-sepolia']),
  scheme: z.literal('exact'),
  nonce: z.string().min(1),
  validUntil: z.number().int().positive(),
  payTo: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  asset: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  amount: z.string().regex(/^\d+$/),
  authorization: z.object({
    from: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    to: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    value: z.string().regex(/^\d+$/),
    validAfter: z.number().int().nonnegative(),
    validBefore: z.number().int().positive(),
    nonce: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
    v: z.number().int(),
    r: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
    s: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  }),
  settlementTxHash: z.string().optional(),
});

const solanaAuth = z.object({
  v: z.literal('1'),
  chain: z.enum(['solana', 'solana-devnet']),
  scheme: z.literal('exact'),
  nonce: z.string().min(1),
  validUntil: z.number().int().positive(),
  payTo: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
  mint: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
  amount: z.string().regex(/^\d+$/),
  transaction: z.string().min(1),
  settlementSignature: z.string().optional(),
});

const paymentAuthSchema = z.union([evmAuth, solanaAuth]);

export function decodePaymentHeader(headerValue: string): PaymentAuth {
  if (headerValue.length > MAX_X_PAYMENT_HEADER_BYTES) {
    throw new PayGateError({
      code: 'INVALID_PAYMENT_HEADER',
      detail: `X-PAYMENT header exceeds ${MAX_X_PAYMENT_HEADER_BYTES} bytes`,
    });
  }
  let jsonStr: string;
  try {
    jsonStr = Buffer.from(headerValue, 'base64').toString('utf-8');
  } catch (err) {
    throw new PayGateError({
      code: 'INVALID_PAYMENT_HEADER',
      detail: 'X-PAYMENT header must be valid base64',
      cause: err,
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    throw new PayGateError({
      code: 'INVALID_PAYMENT_HEADER',
      detail: 'X-PAYMENT body must be valid JSON',
      cause: err,
    });
  }

  const result = paymentAuthSchema.safeParse(parsed);
  if (!result.success) {
    throw new PayGateError({
      code: 'INVALID_PAYMENT_HEADER',
      detail: `X-PAYMENT schema validation failed: ${result.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    });
  }
  return result.data as PaymentAuth;
}

export function isEvmAuth(a: PaymentAuth): a is EvmPaymentAuth {
  return a.chain === 'base' || a.chain === 'base-sepolia';
}

export function isSolanaAuth(a: PaymentAuth): a is SolanaPaymentAuth {
  return a.chain === 'solana' || a.chain === 'solana-devnet';
}
