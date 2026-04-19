import { describe, it, expect } from 'vitest';
import { InMemoryNonceStore } from '../src/utils/nonce-store.js';

describe('InMemoryNonceStore', () => {
  it('claims a nonce exactly once', async () => {
    const s = new InMemoryNonceStore();
    expect(await s.claim('nonce-a', 60)).toBe(true);
    expect(await s.claim('nonce-a', 60)).toBe(false);
  });

  it('stores + returns requirement digest', async () => {
    const s = new InMemoryNonceStore();
    await s.putRequirement('nonce-b', 'sha256:xxx', 60);
    expect(await s.getRequirement('nonce-b')).toBe('sha256:xxx');
    expect(await s.getRequirement('nonce-c')).toBeNull();
  });

  it('expires requirements after TTL', async () => {
    const s = new InMemoryNonceStore();
    await s.putRequirement('nonce-d', 'digest', 0);
    // Force-clear by getting after putting with 0 TTL; a small sleep would
    // also work but we keep tests hermetic.
    await new Promise((r) => setTimeout(r, 5));
    expect(await s.getRequirement('nonce-d')).toBeNull();
  });
});
