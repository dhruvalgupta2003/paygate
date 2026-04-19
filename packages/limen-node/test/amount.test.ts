import { describe, it, expect } from 'vitest';
import { usdcToMicros, microsToUsdc } from '../src/utils/amount.js';

describe('amount utilities', () => {
  it('converts whole USDC to micros', () => {
    expect(usdcToMicros('1')).toBe(1_000_000n);
    expect(usdcToMicros('1.000000')).toBe(1_000_000n);
  });

  it('handles fractional USDC up to 6 decimals', () => {
    expect(usdcToMicros('0.001')).toBe(1_000n);
    expect(usdcToMicros('0.000001')).toBe(1n);
    expect(usdcToMicros('0')).toBe(0n);
  });

  it('rejects invalid amounts', () => {
    expect(() => usdcToMicros('-1')).toThrow();
    expect(() => usdcToMicros('1.0000001')).toThrow();
    expect(() => usdcToMicros('not a number')).toThrow();
    expect(() => usdcToMicros('1e10')).toThrow();
  });

  it('round-trips micros to USDC', () => {
    expect(microsToUsdc(0n)).toBe('0.000000');
    expect(microsToUsdc(1n)).toBe('0.000001');
    expect(microsToUsdc(1_000_000n)).toBe('1.000000');
    expect(microsToUsdc(1_234_560n)).toBe('1.234560');
  });
});
