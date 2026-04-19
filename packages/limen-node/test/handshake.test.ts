import { describe, it, expect } from 'vitest';
import { decodePaymentHeader } from '../src/proxy/handshake.js';

const evm = {
  v: '1',
  chain: 'base',
  scheme: 'exact',
  nonce: '01J2E3F4C5K6P7Q8R9S0T1U2V3.aaaaaaaaaaaaaaaa',
  validUntil: 1_718_640_300,
  payTo: '0x0000000000000000000000000000000000000001',
  asset: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
  amount: '1000',
  authorization: {
    from: '0x0000000000000000000000000000000000000002',
    to: '0x0000000000000000000000000000000000000001',
    value: '1000',
    validAfter: 0,
    validBefore: 9_999_999_999,
    nonce: `0x${'a'.repeat(64)}`,
    v: 27,
    r: `0x${'b'.repeat(64)}`,
    s: `0x${'c'.repeat(64)}`,
  },
} as const;

describe('X-PAYMENT decoder', () => {
  it('decodes a valid EVM header', () => {
    const header = Buffer.from(JSON.stringify(evm)).toString('base64');
    const auth = decodePaymentHeader(header);
    expect(auth.chain).toBe('base');
    expect(auth.nonce.startsWith('01J')).toBe(true);
  });

  it('rejects non-base64', () => {
    expect(() => decodePaymentHeader('not_base64_$$')).toThrow();
  });

  it('rejects malformed schema', () => {
    const bad = Buffer.from(JSON.stringify({ ...evm, chain: 'ethereum' })).toString('base64');
    expect(() => decodePaymentHeader(bad)).toThrow();
  });

  it('rejects header too large', () => {
    const huge = 'A'.repeat(20_000);
    expect(() => decodePaymentHeader(huge)).toThrow(/header/i);
  });
});
