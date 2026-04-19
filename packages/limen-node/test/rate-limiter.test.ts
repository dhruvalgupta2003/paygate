import { describe, it, expect } from 'vitest';
import { InMemoryRateLimiter } from '../src/utils/rate-limiter.js';

describe('InMemoryRateLimiter', () => {
  it('allows up to the configured limit and then denies', async () => {
    const rl = new InMemoryRateLimiter();
    let denied = 0;
    for (let i = 0; i < 10; i++) {
      const d = await rl.checkAndConsume('k', { scope: 'wallet', limit: 5, windowSeconds: 60 });
      if (!d.allowed) denied++;
    }
    expect(denied).toBeGreaterThanOrEqual(4);
  });

  it('scopes separately', async () => {
    const rl = new InMemoryRateLimiter();
    const a = await rl.checkAndConsume('k', { scope: 'wallet', limit: 1, windowSeconds: 60 });
    const b = await rl.checkAndConsume('k', { scope: 'ip', limit: 1, windowSeconds: 60 });
    expect(a.allowed).toBe(true);
    expect(b.allowed).toBe(true);
  });
});
