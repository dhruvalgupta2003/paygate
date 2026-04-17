import type { Redis } from 'ioredis';
import type { NonceStore } from '../types.js';

export class RedisNonceStore implements NonceStore {
  constructor(
    private readonly redis: Redis,
    private readonly keyPrefix = 'paygate:',
  ) {}

  async claim(nonce: string, ttlSeconds: number): Promise<boolean> {
    const reply = await this.redis.set(
      `${this.keyPrefix}nonce:${nonce}`,
      '1',
      'EX',
      ttlSeconds,
      'NX',
    );
    return reply === 'OK';
  }

  async putRequirement(nonce: string, digest: string, ttlSeconds: number): Promise<void> {
    await this.redis.set(
      `${this.keyPrefix}req:${nonce}`,
      digest,
      'EX',
      ttlSeconds,
      'NX',
    );
  }

  async getRequirement(nonce: string): Promise<string | null> {
    const value = await this.redis.get(`${this.keyPrefix}req:${nonce}`);
    return value ?? null;
  }
}

interface Entry {
  value: string;
  expiresAt: number;
}

export class InMemoryNonceStore implements NonceStore {
  private readonly nonces = new Map<string, number>();
  private readonly requirements = new Map<string, Entry>();

  async claim(nonce: string, ttlSeconds: number): Promise<boolean> {
    this.sweep();
    const existing = this.nonces.get(nonce);
    if (existing !== undefined) return false;
    this.nonces.set(nonce, Date.now() + ttlSeconds * 1000);
    return true;
  }

  async putRequirement(nonce: string, digest: string, ttlSeconds: number): Promise<void> {
    this.requirements.set(nonce, { value: digest, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async getRequirement(nonce: string): Promise<string | null> {
    const e = this.requirements.get(nonce);
    if (!e) return null;
    if (Date.now() > e.expiresAt) {
      this.requirements.delete(nonce);
      return null;
    }
    return e.value;
  }

  private sweep(): void {
    const now = Date.now();
    for (const [k, exp] of this.nonces) {
      if (exp <= now) this.nonces.delete(k);
    }
    for (const [k, e] of this.requirements) {
      if (e.expiresAt <= now) this.requirements.delete(k);
    }
  }
}
