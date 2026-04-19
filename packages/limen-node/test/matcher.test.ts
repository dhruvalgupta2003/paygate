import { describe, it, expect } from 'vitest';
import { compileMatcher } from '../src/proxy/matcher.js';

describe('path matcher', () => {
  const matcher = compileMatcher(
    [
      { path: '/api/v1/weather/*', price_usdc: '0.001' },
      { path: '/api/v1/premium/**', price_usdc: '0.05' },
      { path: '/api/v1/bulk', method: ['POST'], price_usdc: '1' },
    ],
    (s) => BigInt(Math.round(Number(s) * 1e6)),
  );

  it('matches single-segment glob', () => {
    const m = matcher.findMatch('/api/v1/weather/sf', 'GET');
    expect(m?.endpoint.path).toBe('/api/v1/weather/*');
  });

  it('matches multi-segment glob', () => {
    expect(matcher.findMatch('/api/v1/premium/a/b/c', 'GET')?.endpoint.path).toBe(
      '/api/v1/premium/**',
    );
  });

  it('ignores method mismatches', () => {
    expect(matcher.findMatch('/api/v1/bulk', 'GET')).toBeUndefined();
    expect(matcher.findMatch('/api/v1/bulk', 'POST')?.endpoint.path).toBe('/api/v1/bulk');
  });

  it('returns undefined when no rule matches', () => {
    expect(matcher.findMatch('/unpaywalled', 'GET')).toBeUndefined();
  });
});
