import type { Redis } from 'ioredis';

export interface RateLimitSpec {
  readonly scope: 'wallet' | 'ip' | 'endpoint' | 'global';
  readonly limit: number;
  readonly windowSeconds: number;
}

export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly resetInSeconds: number;
}

// Token-bucket via Redis Lua.  Atomic + wall-clock agnostic.
const LUA = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local refill = limit / window

local last = redis.call("HMGET", key, "tokens", "ts")
local tokens = tonumber(last[1])
local ts = tonumber(last[2])

if tokens == nil or ts == nil then
  tokens = limit
  ts = now
end

local delta = math.max(0, now - ts)
tokens = math.min(limit, tokens + delta * refill)

local allowed = 0
if tokens >= 1 then
  tokens = tokens - 1
  allowed = 1
end

redis.call("HMSET", key, "tokens", tokens, "ts", now)
redis.call("EXPIRE", key, window * 2)

local reset = math.ceil((1 - tokens) / refill)
if reset < 0 then reset = 0 end
return { allowed, math.floor(tokens), reset }
`;

export class RedisRateLimiter {
  private scriptSha: string | undefined;

  constructor(
    private readonly redis: Redis,
    private readonly keyPrefix = 'paygate:rl:',
  ) {}

  async checkAndConsume(key: string, spec: RateLimitSpec): Promise<RateLimitDecision> {
    const k = `${this.keyPrefix}${spec.scope}:${key}`;
    const now = Date.now() / 1000;
    const res = (await this.runLua(k, spec.limit, spec.windowSeconds, now)) as [
      number,
      number,
      number,
    ];
    const [allowed, remaining, reset] = res;
    return { allowed: allowed === 1, remaining, resetInSeconds: reset };
  }

  private async runLua(
    key: string,
    limit: number,
    windowSeconds: number,
    now: number,
  ): Promise<unknown> {
    if (this.scriptSha === undefined) {
      this.scriptSha = (await this.redis.script('LOAD', LUA)) as string;
    }
    try {
      return await this.redis.evalsha(
        this.scriptSha,
        1,
        key,
        String(limit),
        String(windowSeconds),
        String(now),
      );
    } catch (err) {
      // NOSCRIPT — redis may have flushed script cache (eviction, failover).
      if ((err as Error).message.includes('NOSCRIPT')) {
        this.scriptSha = undefined;
        return this.runLua(key, limit, windowSeconds, now);
      }
      throw err;
    }
  }
}

export class InMemoryRateLimiter {
  private readonly buckets = new Map<string, { tokens: number; ts: number }>();

  async checkAndConsume(key: string, spec: RateLimitSpec): Promise<RateLimitDecision> {
    const now = Date.now() / 1000;
    const k = `${spec.scope}:${key}`;
    const refill = spec.limit / spec.windowSeconds;
    const cur = this.buckets.get(k) ?? { tokens: spec.limit, ts: now };
    const elapsed = Math.max(0, now - cur.ts);
    const tokens = Math.min(spec.limit, cur.tokens + elapsed * refill);
    if (tokens < 1) {
      this.buckets.set(k, { tokens, ts: now });
      return {
        allowed: false,
        remaining: Math.floor(tokens),
        resetInSeconds: Math.ceil((1 - tokens) / refill),
      };
    }
    const next = tokens - 1;
    this.buckets.set(k, { tokens: next, ts: now });
    return { allowed: true, remaining: Math.floor(next), resetInSeconds: 0 };
  }
}
