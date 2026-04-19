import type { MiddlewareHandler } from 'hono';
import { verify as jwtVerify } from 'hono/jwt';
import type { JWTPayload as HonoJWTPayload } from 'hono/utils/jwt/types';
import { z } from 'zod';
import { getEnv } from '../config/env.js';
import { LimenError, ErrorCode } from '../lib/errors.js';
import { metrics } from '../lib/metrics.js';
import { verifyAdminSignature } from '../lib/signature.js';

/**
 * Unified auth middleware.  Either:
 *   1. Authorization: Bearer <jwt>  (dashboard session)
 *   2. X-Limen-Admin: ed25519:<base64-pub>:<base64-sig>  (operator script)
 *
 * On success, populates `c.var.auth = { kind, subject, projectId? }`.
 * On failure, throws LimenError(UNAUTHORIZED) — the error middleware
 * renders the canonical envelope.
 */

export interface JwtClaims extends HonoJWTPayload {
  readonly sub: string;
  readonly projectId: string | undefined;
  readonly role: 'owner' | 'admin' | 'viewer';
  readonly exp?: number;
}

const jwtClaimsSchema = z.object({
  sub: z.string().min(1),
  projectId: z.string().uuid().optional(),
  role: z.enum(['owner', 'admin', 'viewer']),
  exp: z.number().int().optional(),
});

export interface AuthContext {
  readonly kind: 'jwt' | 'ed25519';
  readonly subject: string;
  readonly projectId: string | undefined;
  readonly role: 'owner' | 'admin' | 'viewer';
}

declare module 'hono' {
  interface ContextVariableMap {
    auth: AuthContext;
    requestId: string;
    logger: import('pino').Logger;
    cspNonce: string;
    rawBody: Buffer;
    routePattern: string;
  }
}

export function authMiddleware(options: { requireRole?: AuthContext['role'] } = {}): MiddlewareHandler {
  return async (c, next) => {
    const env = getEnv();
    const authz = c.req.header('authorization');
    const admin = c.req.header('x-limen-admin');

    let auth: AuthContext | null = null;

    if (typeof admin === 'string' && admin.length > 0) {
      const body = c.get('rawBody') ?? Buffer.from('');
      const result = verifyAdminSignature(admin, { method: c.req.method, path: c.req.path, body }, {
        allowedKeys: env.LIMEN_ADMIN_PUBKEY_ALLOWLIST,
      });
      if (!result.ok) {
        metrics.authFailuresTotal.labels('ed25519', result.reason).inc();
        throw new LimenError({
          code: ErrorCode.UNAUTHORIZED,
          detail: `admin signature rejected: ${result.reason}`,
        });
      }
      auth = { kind: 'ed25519', subject: result.pubKey, projectId: undefined, role: 'admin' };
    } else if (typeof authz === 'string' && authz.toLowerCase().startsWith('bearer ')) {
      const token = authz.slice(7).trim();
      if (token.length === 0) {
        metrics.authFailuresTotal.labels('jwt', 'empty').inc();
        throw new LimenError({ code: ErrorCode.UNAUTHORIZED, detail: 'empty bearer token' });
      }
      let payload: HonoJWTPayload;
      try {
        payload = await jwtVerify(token, env.LIMEN_JWT_SECRET, 'HS256');
      } catch (e) {
        metrics.authFailuresTotal.labels('jwt', e instanceof Error ? e.name : 'unknown').inc();
        throw new LimenError({ code: ErrorCode.UNAUTHORIZED, detail: 'invalid or expired token' });
      }
      const parsed = jwtClaimsSchema.safeParse(payload);
      if (!parsed.success) {
        metrics.authFailuresTotal.labels('jwt', 'claims').inc();
        throw new LimenError({ code: ErrorCode.UNAUTHORIZED, detail: 'invalid jwt claims' });
      }
      auth = {
        kind: 'jwt',
        subject: parsed.data.sub,
        projectId: parsed.data.projectId,
        role: parsed.data.role,
      };
    } else {
      metrics.authFailuresTotal.labels('none', 'missing').inc();
      throw new LimenError({ code: ErrorCode.UNAUTHORIZED, detail: 'authentication required' });
    }

    if (options.requireRole !== undefined && !hasAtLeastRole(auth.role, options.requireRole)) {
      throw new LimenError({
        code: ErrorCode.FORBIDDEN,
        detail: `requires role ${options.requireRole}; have ${auth.role}`,
      });
    }

    c.set('auth', auth);
    await next();
  };
}

function hasAtLeastRole(have: AuthContext['role'], want: AuthContext['role']): boolean {
  const rank: Record<AuthContext['role'], number> = { viewer: 0, admin: 1, owner: 2 };
  return rank[have] >= rank[want];
}

/**
 * Middleware that buffers the request body (capped) so that admin signature
 * verification can run over the raw bytes.  Must be installed before
 * authMiddleware on protected routes.
 */
export function rawBodyMiddleware(maxBytes = 5 * 1024 * 1024): MiddlewareHandler {
  return async (c, next) => {
    if (c.req.method === 'GET' || c.req.method === 'HEAD') {
      c.set('rawBody', Buffer.alloc(0));
      await next();
      return;
    }
    const ab = await c.req.arrayBuffer();
    const buf = Buffer.from(ab);
    if (buf.length > maxBytes) {
      throw new LimenError({
        code: ErrorCode.VALIDATION_FAILED,
        detail: `body exceeds ${maxBytes} bytes`,
      });
    }
    c.set('rawBody', buf);
    await next();
  };
}
