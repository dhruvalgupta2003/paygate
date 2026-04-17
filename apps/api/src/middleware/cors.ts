import { cors } from 'hono/cors';
import type { MiddlewareHandler } from 'hono';
import { getEnv } from '../config/env.js';

/**
 * Strict origin allowlist from PAYGATE_DASHBOARD_URL.  Never `*` in
 * production.  If the inbound Origin is not on the list, we still reply with
 * no ACAO header — the browser blocks the response, which is the intended
 * behaviour.
 */

export function corsMiddleware(): MiddlewareHandler {
  const env = getEnv();
  const origins = env.PAYGATE_DASHBOARD_URL;
  return cors({
    origin: (origin) => (origins.includes(origin) ? origin : null),
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: [
      'Content-Type',
      'Authorization',
      'X-PayGate-Admin',
      'X-PayGate-Signature',
      'X-Request-Id',
    ],
    exposeHeaders: ['X-Request-Id', 'X-Ratelimit-Remaining', 'X-Ratelimit-Reset'],
    credentials: true,
    maxAge: 600,
  });
}
