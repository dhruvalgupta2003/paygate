import { fetch } from 'undici';
import { DEFAULT_FACILITATOR_URL } from '../constants.js';
import { PayGateError } from '../errors.js';
import type { PaymentRequirements, VerifyResult } from '../types.js';

export interface FacilitatorClientOptions {
  readonly url?: string;
  readonly apiKey?: string;
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
}

export class FacilitatorClient {
  private readonly url: string;
  private readonly headers: Record<string, string>;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: FacilitatorClientOptions = {}) {
    this.url = (opts.url ?? DEFAULT_FACILITATOR_URL).replace(/\/$/, '');
    this.headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'paygate-node/0.1',
      ...(opts.apiKey !== undefined ? { Authorization: `Bearer ${opts.apiKey}` } : {}),
    };
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 4_000;
  }

  async verify(req: PaymentRequirements, xPayment: string): Promise<VerifyResult> {
    return this.post('/verify', { paymentRequirements: req, xPayment });
  }

  async settle(req: PaymentRequirements, xPayment: string): Promise<VerifyResult> {
    return this.post('/settle', { paymentRequirements: req, xPayment });
  }

  async health(): Promise<boolean> {
    try {
      const res = await this.fetchImpl(`${this.url}/health`, {
        method: 'GET',
        headers: this.headers,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  private async post(path: string, body: unknown): Promise<VerifyResult> {
    const res = await this.fetchImpl(`${this.url}${path}`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    const text = await res.text();
    let payload: Record<string, unknown>;
    try {
      payload = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch (err) {
      throw new PayGateError({
        code: 'RPC_UNAVAILABLE',
        detail: `facilitator returned non-json at ${path}: ${text.slice(0, 120)}`,
        cause: err,
      });
    }

    if (!res.ok) {
      return {
        ok: false,
        code: typeof payload.error === 'string' ? payload.error : 'RPC_UNAVAILABLE',
        detail: typeof payload.detail === 'string' ? payload.detail : `facilitator ${res.status}`,
        retryable: res.status >= 500 || res.status === 408 || res.status === 429,
      };
    }

    if (payload.ok === true) {
      return payload as unknown as VerifyResult;
    }
    return payload as unknown as VerifyResult;
  }
}
