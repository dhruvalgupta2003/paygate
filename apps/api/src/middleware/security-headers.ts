import type { MiddlewareHandler } from 'hono';
import { randomBytes } from 'node:crypto';

/**
 * Sets the security headers mandated by docs/security.md § 11 on every
 * response.  CSP is only applied to HTML responses (dashboard-rendered);
 * for JSON endpoints it is redundant and adds no safety.
 */

const STATIC_HEADERS: ReadonlyArray<readonly [string, string]> = [
  ['Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload'],
  ['X-Content-Type-Options', 'nosniff'],
  ['X-Frame-Options', 'DENY'],
  ['Referrer-Policy', 'strict-origin-when-cross-origin'],
  [
    'Permissions-Policy',
    'accelerometer=(), camera=(), microphone=(), geolocation=(), payment=(self)',
  ],
  ['X-DNS-Prefetch-Control', 'off'],
];

export function securityHeadersMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    const nonce = randomBytes(16).toString('base64');
    c.set('cspNonce', nonce);
    await next();

    for (const [k, v] of STATIC_HEADERS) c.header(k, v);

    const ct = c.res.headers.get('content-type') ?? '';
    if (ct.includes('text/html')) {
      c.header(
        'Content-Security-Policy',
        `default-src 'self'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'`,
      );
    }
  };
}
