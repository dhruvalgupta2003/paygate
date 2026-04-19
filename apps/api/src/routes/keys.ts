import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { desc, eq } from 'drizzle-orm';
import { getEnv } from '../config/env.js';
import { getDb } from '../db/index.js';
import { apiKeys, projects } from '../db/schema.js';
import { mintApiKey } from '../lib/api-keys.js';
import { LimenError, ErrorCode } from '../lib/errors.js';

/**
 * Admin routes for managing API keys.
 *
 * Mounted under `/_limen/v1/keys` behind authMiddleware so creating/revoking
 * keys requires an existing JWT, ed25519 admin signature, OR an active
 * key with admin role (bootstrapping is via the dashboard JWT or the
 * operator ed25519 path).
 *
 * The plaintext secret is shown ONCE on POST and never again — there is no
 * "view secret" endpoint by design.
 */

const create = z.object({
  name: z.string().trim().min(1).max(80),
  role: z.enum(['viewer', 'admin', 'owner']).default('admin'),
});

async function firstProjectId(): Promise<string | null> {
  const db = getDb();
  const rows = await db.select({ id: projects.id }).from(projects).limit(1);
  return rows[0]?.id ?? null;
}

export const keysRoutes = new Hono()
  .get('/', async (c) => {
    const db = getDb();
    const rows = await db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        prefix: apiKeys.prefix,
        role: apiKeys.role,
        createdBy: apiKeys.createdBy,
        createdAt: apiKeys.createdAt,
        lastUsedAt: apiKeys.lastUsedAt,
        revokedAt: apiKeys.revokedAt,
      })
      .from(apiKeys)
      .orderBy(desc(apiKeys.createdAt));

    return c.json({
      items: rows.map((r) => ({
        id: r.id,
        name: r.name,
        // Returned for display only — full secret is not recoverable.
        masked: `lk_${r.prefix}_${'•'.repeat(8)}`,
        role: r.role,
        created_by: r.createdBy,
        created_at: r.createdAt.toISOString(),
        last_used_at: r.lastUsedAt?.toISOString() ?? null,
        revoked_at: r.revokedAt?.toISOString() ?? null,
      })),
    });
  })
  .post('/', zValidator('json', create), async (c) => {
    const body = c.req.valid('json');
    const db = getDb();
    const env = getEnv();
    const projectId = await firstProjectId();
    if (projectId === null) {
      throw new LimenError({
        code: ErrorCode.NOT_FOUND,
        detail: 'no project exists yet — create a project before issuing keys',
      });
    }

    // Auth may be absent in unauthenticated dev mode; record 'system' so we
    // still satisfy the NOT NULL constraint without crashing.
    const auth = c.get('auth') as { subject?: string } | undefined;
    const createdBy = typeof auth?.subject === 'string' ? auth.subject : 'system';
    const minted = mintApiKey(env.LIMEN_API_KEY_PEPPER);
    await db.insert(apiKeys).values({
      id: minted.id,
      projectId,
      name: body.name,
      prefix: minted.prefix,
      hash: minted.hash,
      role: body.role,
      createdBy,
    });

    return c.json(
      {
        id: minted.id,
        name: body.name,
        role: body.role,
        // ONE-TIME plaintext.  Caller MUST capture this — there is no
        // recovery path on the server.
        secret: minted.plaintext,
        created_at: new Date().toISOString(),
      },
      201,
    );
  })
  .delete('/:id', async (c) => {
    const id = c.req.param('id');
    const db = getDb();
    const result = await db
      .update(apiKeys)
      .set({ revokedAt: new Date() })
      .where(eq(apiKeys.id, id))
      .returning({ id: apiKeys.id });

    if (result.length === 0) {
      throw new LimenError({ code: ErrorCode.NOT_FOUND, detail: 'api key not found' });
    }

    return c.body(null, 204);
  });
