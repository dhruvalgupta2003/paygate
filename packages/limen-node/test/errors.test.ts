import { describe, it, expect } from 'vitest';
import { LimenError, isLimenError } from '../src/errors.js';

describe('LimenError', () => {
  it('carries stable status + retryability', () => {
    const e = new LimenError({ code: 'RATE_LIMITED', detail: 'slow down', retryAfterMs: 2000 });
    expect(e.http).toBe(429);
    expect(e.retryable).toBe(true);
    expect(e.retryAfterMs).toBe(2000);
  });

  it('serializes to a stable JSON shape', () => {
    const e = new LimenError({ code: 'AMOUNT_INSUFFICIENT', detail: 'short' });
    const j = e.toJSON() as Record<string, unknown>;
    expect(j['error']).toBe('AMOUNT_INSUFFICIENT');
    expect(j['retryable']).toBe(true);
    expect(j['docs']).toContain('amount_insufficient');
  });

  it('type-guards correctly', () => {
    expect(isLimenError(new LimenError({ code: 'INTERNAL' }))).toBe(true);
    expect(isLimenError(new Error('not'))).toBe(false);
  });
});
