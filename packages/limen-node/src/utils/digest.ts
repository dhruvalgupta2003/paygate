import { createHash, timingSafeEqual } from 'node:crypto';
import type { PaymentRequirements } from '../types.js';

/**
 * Canonical JSON: sorted keys, no extraneous whitespace, UTF-8.
 * We hash this to bind a payment authorization to the exact requirements
 * the server issued.  Any divergence = digest mismatch = reject.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalJson(v)).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
    .join(',')}}`;
}

export function digestRequirements(
  req: Omit<PaymentRequirements, 'digest'>,
): string {
  const canon = canonicalJson(req);
  const hex = createHash('sha256').update(canon).digest('hex');
  return `sha256:${hex}`;
}

export function constantTimeEqualString(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
