import { describe, it, expect } from 'vitest';
import { canonicalJson, digestRequirements, constantTimeEqualString } from '../src/utils/digest.js';

describe('canonicalJson', () => {
  it('is key-order independent', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
  });
  it('escapes as JSON', () => {
    expect(canonicalJson('a"b')).toBe('"a\\"b"');
  });
  it('deeply canonicalises objects and arrays', () => {
    const x = { z: [3, { y: 1, x: 0 }], a: null };
    const y = { a: null, z: [3, { x: 0, y: 1 }] };
    expect(canonicalJson(x)).toBe(canonicalJson(y));
  });
});

describe('digestRequirements', () => {
  it('produces a sha256: prefixed 64-hex string', () => {
    const d = digestRequirements({
      scheme: 'exact',
      chain: 'base',
      asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      amount: '1000',
      payTo: '0x0000000000000000000000000000000000000001',
      nonce: 'N',
      validUntil: 1,
    });
    expect(d).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
  it('is stable regardless of key order', () => {
    const a = digestRequirements({
      scheme: 'exact',
      chain: 'base',
      asset: 'X',
      amount: '1',
      payTo: 'P',
      nonce: 'N',
      validUntil: 1,
    });
    const b = digestRequirements({
      validUntil: 1,
      nonce: 'N',
      payTo: 'P',
      amount: '1',
      asset: 'X',
      chain: 'base',
      scheme: 'exact',
    });
    expect(a).toBe(b);
  });
});

describe('constantTimeEqualString', () => {
  it('matches equal strings', () => {
    expect(constantTimeEqualString('abc', 'abc')).toBe(true);
  });
  it('rejects differing strings', () => {
    expect(constantTimeEqualString('abc', 'abd')).toBe(false);
    expect(constantTimeEqualString('abc', 'ab')).toBe(false);
  });
});
