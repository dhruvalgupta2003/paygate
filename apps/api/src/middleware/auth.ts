import type { MiddlewareHandler } from 'hono';
import { verify as jwtVerify } from 'hono/jwt';
import type { JWTPayload as HonoJWTPayload } from 'hono/utils/jwt/types';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getEnv } from '../config/env.js';
import { getDb } from '../db/index.js';
import { apiKeys } from '../db/schema.js';
import { LimenError, ErrorCode } from '../lib/errors.js';
import { hashSecret, KEY_BRAND, parseApiKey, verifyHash } from '../lib/api-keys.js';
import { getLogger } from '../lib/logger.js';
import { metrics } from '../lib/metrics.js';
import { verifyAdminSignature } from '../lib/signature.js';

/**
 * Unified auth middleware.  One of:
 *   1. Authorization: Bearer <jwt>  (dashboard session)
 *   2. Authorization: Bearer lk_<prefix>_<secret>  (API key)
 *   3. X-Limen-Admin: ed25519:<base64-pub>:<base64-sig>  (operator script)
 *
 * On success, populates `c.var.auth = { kind, subject, projectId?, role }`.
 * `subject` is what the rate limiter keys on, so API keys naturally get
 * per-key isolation: subject = `key:<id>`.
 *
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
  readonly kind: 'jwt' | 'ed25519' | 'api_key';
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

      // API keys are routed through the same Authorization header but use a
      // distinct brand prefix so we can disambiguate without trying both.
      if (token.startsWith(`${KEY_BRAND}_`)) {
        auth = await verifyApiKey(token, env.LIMEN_API_KEY_PEPPER);
      } else {
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
      }
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
 * Verify an `lk_<prefix>_<secret>` bearer token against the api_keys table.
 *
 * - Structural parse rejects malformed tokens before any DB roundtrip.
 * - Lookup is by uniquely-indexed prefix (O(1)) — never scan the whole table.
 * - Hash compare is timing-safe; missing-row and bad-hash both feed the same
 *   "invalid api key" failure to avoid leaking enumeration signal.
 * - Revoked keys are rejected even if the hash matches.
 * - last_used_at is updated fire-and-forget so auth latency stays sub-ms.
 */
async function verifyApiKey(token: string, pepper: string): Promise<AuthContext> {
  const parsed = parseApiKey(token);
  if (parsed === null) {
    metrics.authFailuresTotal.labels('api_key', 'malformed').inc();
    throw new LimenError({ code: ErrorCode.UNAUTHORIZED, detail: 'invalid api key' });
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.prefix, parsed.prefix))
    .limit(1);
  const row = rows[0];

  const expectedHash = hashSecret(parsed.secret, pepper);
  if (row === undefined || !verifyHash(expectedHash, row.hash)) {
    metrics.authFailuresTotal.labels('api_key', 'mismatch').inc();
    throw new LimenError({ code: ErrorCode.UNAUTHORIZED, detail: 'invalid api key' });
  }

  if (row.revokedAt !== null) {
    metrics.authFailuresTotal.labels('api_key', 'revoked').inc();
    throw new LimenError({ code: ErrorCode.UNAUTHORIZED, detail: 'api key revoked' });
  }

  // Fire-and-forget bump; surface failures only at debug to avoid log noise.
  void db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, row.id))
    .catch((err: unknown) => {
      getLogger().debug({ err: (err as Error).message, keyId: row.id }, 'api key last_used_at update failed');
    });

  const role = (row.role as AuthContext['role']) ?? 'admin';
  return {
    kind: 'api_key',
    subject: `key:${row.id}`,
    projectId: row.projectId,
    role,
  };
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
