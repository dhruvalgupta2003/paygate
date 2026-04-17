import type { MiddlewareHandler } from 'hono';
import Redis from 'ioredis';
import { getEnv } from '../config/env.js';
import { getLogger } from '../lib/logger.js';
import { ErrorCode, PayGateError } from '../lib/errors.js';
import { metrics } from '../lib/metrics.js';

/**
 * Token-bucket-ish fixed-window rate limiter backed by Redis.
 *
 * Two windows per key:
 *   - perSecond  : fails with RATE_LIMITED if > env.PAYGATE_API_RATE_LIMIT_PER_SECOND
 *   - perMinute  : fails with RATE_LIMITED if > env.PAYGATE_API_RATE_LIMIT_PER_MINUTE
 *
 * Key derivation: prefer admin pubkey or JWT subject (set by auth
 * middleware).  Fall back to IP + path for unauth paths (health/metrics).
 *
 * If Redis is unreachable we fail-open for up to 30 s (docs/architecture.md).
 */

let redisClient: Redis | undefined;
let failOpenUntil = 0;

function getRedis(): Redis {
  if (redisClient !== undefined) return redisClient;
  const env = getEnv();
  redisClient = new Redis(env.PAYGATE_REDIS_URL, {
    maxRetriesPerRequest: 2,
    enableOfflineQueue: false,
    connectTimeout: 2000,
    commandTimeout: 500,
    lazyConnect: false,
  });
  redisClient.on('error', (err) => {
    getLogger().warn({ err: err.message }, 'redis error (rate-limit)');
  });
  return redisClient;
}

export async function closeRedis(): Promise<void> {
  if (redisClient !== undefined) {
    await redisClient.quit();
    redisClient = undefined;
  }
}

export interface RateLimitOptions {
  /** Override the global per-second ceiling. */
  readonly perSecond?: number;
  /** Override the global per-minute ceiling. */
  readonly perMinute?: number;
  /** Derive the rate-limit key. Defaults to auth subject or IP. */
  readonly keyFn?: (c: import('hono').Context) => string;
}

export function rateLimitMiddleware(opts: RateLimitOptions = {}): MiddlewareHandler {
  return async (c, next) => {
    const env = getEnv();
    const perSecond = opts.perSecond ?? env.PAYGATE_API_RATE_LIMIT_PER_SECOND;
    const perMinute = opts.perMinute ?? env.PAYGATE_API_RATE_LIMIT_PER_MINUTE;
    const key = (opts.keyFn ?? defaultKeyFn)(c);
    const route = c.req.routePath ?? c.req.path;

    if (Date.now() < failOpenUntil) {
      await next();
      return;
    }

    let sec: number;
    let min: number;
    try {
      const redis = getRedis();
      const now = Math.floor(Date.now() / 1000);
      const secKey = `pg:api:rl:s:${key}:${now}`;
      const minKey = `pg:api:rl:m:${key}:${Math.floor(now / 60)}`;
      const pipe = redis.multi();
      pipe.incr(secKey);
      pipe.expire(secKey, 2);
      pipe.incr(minKey);
      pipe.expire(minKey, 70);
      const results = await pipe.exec();
      if (results === null) throw new Error('redis pipeline returned null');
      sec = Number(results[0]?.[1] ?? 0);
      min = Number(results[2]?.[1] ?? 0);
    } catch (err) {
      // Fail-open for 30 s; after that, fail-closed (SERVICE_DEGRADED).
      if (failOpenUntil === 0) failOpenUntil = Date.now() + 30_000;
      getLogger().warn({ err: (err as Error).message }, 'rate-limit degraded; failing open');
      if (Date.now() < failOpenUntil) {
        await next();
        return;
      }
      throw new PayGateError({
        code: ErrorCode.SERVICE_DEGRADED,
        detail: 'rate limiter unavailable',
      });
    }
    // Successful call — reset fail-open marker.
    failOpenUntil = 0;

    if (sec > perSecond || min > perMinute) {
      metrics.rateLimitDropsTotal.labels(route).inc();
      const retryAfterMs = sec > perSecond ? 1000 : 60_000;
      c.header('Retry-After', String(Math.ceil(retryAfterMs / 1000)));
      throw new PayGateError({
        code: ErrorCode.RATE_LIMITED,
        detail: `rate limit exceeded (perSecond=${perSecond}, perMinute=${perMinute})`,
        retryAfterMs,
      });
    }

    c.header('X-Ratelimit-Remaining', String(Math.max(0, perMinute - min)));
    c.header('X-Ratelimit-Reset', String(60));

    await next();
  };
}

function defaultKeyFn(c: import('hono').Context): string {
  const auth = c.get('auth') as { subject: string } | undefined;
  if (auth !== undefined) return `sub:${auth.subject}`;
  const fwd = c.req.header('x-forwarded-for');
  const ip = (fwd?.split(',')[0] ?? '').trim() || c.req.header('cf-connecting-ip') || 'unknown';
  return `ip:${ip}:${c.req.path}`;
}
