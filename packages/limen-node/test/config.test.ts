import { describe, it, expect } from 'vitest';
import { loadConfigFromString } from '../src/config.js';

describe('config loader', () => {
  it('parses a minimum-viable YAML config', () => {
    const cfg = loadConfigFromString(`
version: 1
wallets:
  base: "0x0000000000000000000000000000000000000001"
endpoints:
  - path: /api/v1/*
    price_usdc: 0.001
`);
    // Numeric YAML values are normalised to USDC's 6-decimal precision.
    expect(cfg.endpoints[0]?.price_usdc).toBe('0.001000');
    expect(cfg.defaults.chain).toBe('base');
  });

  it('rejects endpoints without price', () => {
    expect(() =>
      loadConfigFromString(`
version: 1
wallets:
  base: "0x0000000000000000000000000000000000000001"
endpoints:
  - path: /foo
`),
    ).toThrow(/price/i);
  });

  it('rejects a malformed EVM address', () => {
    expect(() =>
      loadConfigFromString(`
version: 1
wallets:
  base: "not-an-address"
endpoints:
  - path: /foo
    price_usdc: 0.001
`),
    ).toThrow();
  });

  it('rejects when no wallets are configured', () => {
    expect(() =>
      loadConfigFromString(`
version: 1
wallets: {}
endpoints:
  - path: /foo
    price_usdc: 0.001
`),
    ).toThrow(/wallet/i);
  });
});
