/**
 * Public error surface.  Codes are stable strings; do not rename without a
 * major version bump.  See docs/error-handling.md for semantics.
 */

export const ErrorCode = {
  PAYMENT_REQUIRED: 'PAYMENT_REQUIRED',
  INVALID_PAYMENT_HEADER: 'INVALID_PAYMENT_HEADER',
  INVALID_SIGNATURE: 'INVALID_SIGNATURE',
  EXPIRED_AUTHORIZATION: 'EXPIRED_AUTHORIZATION',
  NONCE_REUSED: 'NONCE_REUSED',
  NONCE_UNKNOWN: 'NONCE_UNKNOWN',
  DIGEST_MISMATCH: 'DIGEST_MISMATCH',
  RECIPIENT_MISMATCH: 'RECIPIENT_MISMATCH',
  CHAIN_MISMATCH: 'CHAIN_MISMATCH',
  ASSET_MISMATCH: 'ASSET_MISMATCH',
  AMOUNT_INSUFFICIENT: 'AMOUNT_INSUFFICIENT',
  SETTLEMENT_PENDING: 'SETTLEMENT_PENDING',
  SETTLEMENT_FAILED: 'SETTLEMENT_FAILED',
  COMPLIANCE_BLOCKED: 'COMPLIANCE_BLOCKED',
  RATE_LIMITED: 'RATE_LIMITED',
  UPSTREAM_FAILED: 'UPSTREAM_FAILED',
  UPSTREAM_TIMEOUT: 'UPSTREAM_TIMEOUT',
  SERVICE_DEGRADED: 'SERVICE_DEGRADED',
  RPC_UNAVAILABLE: 'RPC_UNAVAILABLE',
  BAD_CONFIG: 'BAD_CONFIG',
  INTERNAL: 'INTERNAL',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

interface StatusRow {
  readonly http: number;
  readonly retryable: boolean;
}

const STATUS: Record<ErrorCode, StatusRow> = {
  PAYMENT_REQUIRED: { http: 402, retryable: true },
  INVALID_PAYMENT_HEADER: { http: 400, retryable: false },
  INVALID_SIGNATURE: { http: 402, retryable: false },
  EXPIRED_AUTHORIZATION: { http: 402, retryable: true },
  NONCE_REUSED: { http: 402, retryable: false },
  NONCE_UNKNOWN: { http: 402, retryable: true },
  DIGEST_MISMATCH: { http: 402, retryable: false },
  RECIPIENT_MISMATCH: { http: 402, retryable: false },
  CHAIN_MISMATCH: { http: 402, retryable: false },
  ASSET_MISMATCH: { http: 402, retryable: false },
  AMOUNT_INSUFFICIENT: { http: 402, retryable: true },
  SETTLEMENT_PENDING: { http: 202, retryable: true },
  SETTLEMENT_FAILED: { http: 402, retryable: true },
  COMPLIANCE_BLOCKED: { http: 451, retryable: false },
  RATE_LIMITED: { http: 429, retryable: true },
  UPSTREAM_FAILED: { http: 502, retryable: true },
  UPSTREAM_TIMEOUT: { http: 504, retryable: true },
  SERVICE_DEGRADED: { http: 503, retryable: true },
  RPC_UNAVAILABLE: { http: 503, retryable: true },
  BAD_CONFIG: { http: 500, retryable: false },
  INTERNAL: { http: 500, retryable: true },
};

export interface PayGateErrorInit {
  readonly code: ErrorCode;
  readonly detail?: string;
  readonly cause?: unknown;
  readonly retryAfterMs?: number;
  readonly extra?: Readonly<Record<string, unknown>>;
}

export class PayGateError extends Error {
  readonly code: ErrorCode;
  readonly http: number;
  readonly retryable: boolean;
  readonly detail: string;
  readonly retryAfterMs: number | undefined;
  readonly extra: Readonly<Record<string, unknown>>;

  constructor(init: PayGateErrorInit) {
    super(init.detail ?? init.code);
    this.name = 'PayGateError';
    this.code = init.code;
    this.detail = init.detail ?? init.code;
    const row = STATUS[init.code];
    this.http = row.http;
    this.retryable = row.retryable;
    this.retryAfterMs = init.retryAfterMs;
    this.extra = init.extra ?? {};
    if (init.cause !== undefined) {
      Object.defineProperty(this, 'cause', { value: init.cause, enumerable: false });
    }
  }

  toJSON(): Readonly<Record<string, unknown>> {
    return {
      error: this.code,
      detail: this.detail,
      retryable: this.retryable,
      ...(this.retryAfterMs !== undefined ? { retryAfterMs: this.retryAfterMs } : {}),
      docs: `https://paygate.dev/docs/errors#${this.code.toLowerCase()}`,
      ...this.extra,
    };
  }
}

export function isPayGateError(e: unknown): e is PayGateError {
  return e instanceof PayGateError;
}

export function errHttpStatus(code: ErrorCode): number {
  return STATUS[code].http;
}

export function errIsRetryable(code: ErrorCode): boolean {
  return STATUS[code].retryable;
}
