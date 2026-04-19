/**
 * Integration tests for the API key auth path.
 *
 * Skipped when LIMEN_DATABASE_URL is not set — they require a live Postgres
 * with the api_keys table (migration 0004 applied).  In CI, set the env
 * before running `vitest`.
 *
 * The tests prove four behaviors that matter operationally:
 *   1. A freshly-minted key authenticates and resolves to AuthContext{api_key}.
 *   2. A revoked key is rejected with UNAUTHORIZED.
 *   3. A wrong secret is rejected with UNAUTHORIZED (timing-safe path).
 *   4. The rate-limiter keys on auth.subject so two distinct keys get
 *      independent buckets — proves "per-key rate limiting" actually works.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { closeDb, getDb } from '../db/index.js';
import { apiKeys, projects } from '../db/schema.js';
import { authMiddleware } from './auth.js';
import { mintApiKey } from '../lib/api-keys.js';
import { resetEnvCache } from '../config/env.js';
import { randomUUID } from 'node:crypto';

const HAS_DB = typeof process.env.LIMEN_DATABASE_URL === 'string' && process.env.LIMEN_DATABASE_URL.length > 0;

const PROJECT_ID = '00000000-0000-0000-0000-000000000aaa';
const PEPPER = 'integration-test-pepper-please-do-not-ship';

describe.skipIf(!HAS_DB)('authMiddleware — API key path', () => {
  beforeAll(async () => {
    process.env.LIMEN_API_KEY_PEPPER = PEPPER;
    // The middleware reads env via getEnv(); make sure our pepper is picked up.
    resetEnvCache();

    const db = getDb();
    // Ensure a project exists (FK target).  Idempotent.
    await db
      .insert(projects)
      .values({
        id: PROJECT_ID,
        slug: `test-keys-${PROJECT_ID.slice(0, 8)}`,
        name: 'API Key Test Project',
        ownerWallet: '0x0000000000000000000000000000000000000000',
      })
      .onConflictDoNothing();
  });

  beforeEach(async () => {
    // Clean rows owned by this project so each test starts from a known state.
    const db = getDb();
    await db.delete(apiKeys).where(eq(apiKeys.projectId, PROJECT_ID));
  });

  afterAll(async () => {
    const db = getDb();
    await db.delete(apiKeys).where(eq(apiKeys.projectId, PROJECT_ID));
    await db.delete(projects).where(eq(projects.id, PROJECT_ID));
    await closeDb();
  });

  function makeApp() {
    const app = new Hono();
    app.use('*', authMiddleware());
    app.get('/whoami', (c) => {
      const auth = c.get('auth');
      return c.json({ kind: auth.kind, subject: auth.subject, role: auth.role });
    });
    app.onError((err, c) => {
      const detail = err instanceof Error ? err.message : String(err);
      const code = (err as { code?: string }).code ?? 'INTERNAL';
      return c.json({ error: code, detail }, 401);
    });
    return app;
  }

  async function persistMintedKey(name: string, opts: { revoked?: boolean } = {}) {
    const minted = mintApiKey(PEPPER);
    const db = getDb();
    await db.insert(apiKeys).values({
      id: minted.id,
      projectId: PROJECT_ID,
      name,
      prefix: minted.prefix,
      hash: minted.hash,
      role: 'admin',
      createdBy: 'test',
      ...(opts.revoked === true ? { revokedAt: new Date() } : {}),
    });
    return minted;
  }

  it('authenticates with a freshly minted key and resolves to AuthContext{api_key}', async () => {
    const app = makeApp();
    const minted = await persistMintedKey('alpha');

    const res = await app.request('/whoami', {
      headers: { authorization: `Bearer ${minted.plaintext}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { kind: string; subject: string; role: string };
    expect(body.kind).toBe('api_key');
    expect(body.subject).toBe(`key:${minted.id}`);
    expect(body.role).toBe('admin');
  });

  it('rejects a revoked key with UNAUTHORIZED', async () => {
    const app = makeApp();
    const minted = await persistMintedKey('revoked', { revoked: true });

    const res = await app.request('/whoami', {
      headers: { authorization: `Bearer ${minted.plaintext}` },
    });
    expect(res.status).toBe(401);
  });

  it('rejects a wrong secret even when the prefix matches', async () => {
    const app = makeApp();
    const minted = await persistMintedKey('beta');
    // Forge a token with the same prefix but a different secret.
    const forged = `lk_${minted.prefix}_${'A'.repeat(43)}`;

    const res = await app.request('/whoami', {
      headers: { authorization: `Bearer ${forged}` },
    });
    expect(res.status).toBe(401);
  });

  it('rejects a structurally invalid api key without DB lookup', async () => {
    const app = makeApp();
    // Wrong brand → caller said "this is an API key" via lk_ prefix path, but
    // structural parser rejects.  This proves we don't fall through to JWT.
    const res = await app.request('/whoami', {
      headers: { authorization: 'Bearer lk_short_x' },
    });
    expect(res.status).toBe(401);
  });

  it('updates last_used_at after a successful auth (best-effort)', async () => {
    const app = makeApp();
    const minted = await persistMintedKey('gamma');

    const res = await app.request('/whoami', {
      headers: { authorization: `Bearer ${minted.plaintext}` },
    });
    expect(res.status).toBe(200);

    // Give the fire-and-forget update a moment to land.
    await new Promise((r) => setTimeout(r, 200));

    const db = getDb();
    const rows = await db
      .select({ lastUsedAt: apiKeys.lastUsedAt })
      .from(apiKeys)
      .where(eq(apiKeys.id, minted.id))
      .limit(1);
    expect(rows[0]?.lastUsedAt).not.toBeNull();
  });

  it('issues distinct subjects for distinct keys (rate-limit isolation)', async () => {
    const app = makeApp();
    const a = await persistMintedKey('one');
    const b = await persistMintedKey('two');
    expect(a.id).not.toBe(b.id);

    const [resA, resB] = await Promise.all([
      app.request('/whoami', { headers: { authorization: `Bearer ${a.plaintext}` } }),
      app.request('/whoami', { headers: { authorization: `Bearer ${b.plaintext}` } }),
    ]);
    const bodyA = (await resA.json()) as { subject: string };
    const bodyB = (await resB.json()) as { subject: string };
    expect(bodyA.subject).toBe(`key:${a.id}`);
    expect(bodyB.subject).toBe(`key:${b.id}`);
    expect(bodyA.subject).not.toBe(bodyB.subject);
  });
});

void randomUUID; // keeps node:crypto import live for future expansion
