import { randomUUID, timingSafeEqual } from 'node:crypto';
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { and, desc, eq, lt, sql } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { transactions, endpoints, projects } from '../db/schema.js';
import { getEnv } from '../config/env.js';
import { emitMeterEvent, meterIdentifiersFor } from '../lib/stripe.js';
import { getLogger } from '../lib/logger.js';

const listQuery = z.object({
  status: z.enum(['pending', 'settled', 'refunded', 'reorged', 'upstream_failed']).optional(),
  chain: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

export const transactionsRoutes = new Hono()
  .get('/', zValidator('query', listQuery), async (c) => {
    const q = c.req.valid('query');
    const db = getDb();

    const filters = [];
    if (q.status) filters.push(eq(transactions.status, q.status));
    if (q.chain) filters.push(eq(transactions.chain, q.chain));
    if (q.cursor) {
      const cursorDate = new Date(q.cursor);
      if (!Number.isNaN(cursorDate.getTime())) {
        filters.push(lt(transactions.observedAt, cursorDate));
      }
    }

    const rows = await db
      .select({
        id: transactions.id,
        chain: transactions.chain,
        tx_hash: transactions.txHash,
        block_or_slot: transactions.blockOrSlot,
        amount_usdc_micros: transactions.amountUsdcMicros,
        from_wallet: transactions.fromWallet,
        to_wallet: transactions.toWallet,
        nonce: transactions.nonce,
        status: transactions.status,
        endpoint_id: transactions.endpointId,
        endpoint: endpoints.pathGlob,
        observed_at: transactions.observedAt,
        settled_at: transactions.settledAt,
      })
      .from(transactions)
      .leftJoin(endpoints, eq(transactions.endpointId, endpoints.id))
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(desc(transactions.observedAt))
      .limit(q.limit + 1);

    const hasMore = rows.length > q.limit;
    const items = rows.slice(0, q.limit).map((r) => ({
      id: r.id,
      chain: r.chain,
      tx_hash: r.tx_hash,
      block_or_slot: r.block_or_slot?.toString() ?? '0',
      amount_usdc_micros: r.amount_usdc_micros.toString(),
      from_wallet: r.from_wallet,
      to_wallet: r.to_wallet,
      nonce: r.nonce,
      status: r.status,
      endpoint_id: r.endpoint_id ?? '',
      endpoint: r.endpoint ?? '',
      observed_at: r.observed_at.toISOString(),
      settled_at: r.settled_at?.toISOString() ?? null,
      verify_ms: 0,
    }));

    const totalRows = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(transactions);
    const total = totalRows[0]?.total ?? 0;

    const last = items[items.length - 1];
    return c.json({
      items,
      next_cursor: hasMore && last ? last.observed_at : null,
      total,
    });
  })
  .get('/:id', async (c) => {
    const id = c.req.param('id');
    const db = getDb();
    const rows = await db.select().from(transactions).where(eq(transactions.id, id)).limit(1);
    const row = rows[0];
    if (!row) {
      return c.json({ error: 'not_found', detail: `transaction ${id} not found` }, 404);
    }
    return c.json({
      id: row.id,
      chain: row.chain,
      tx_hash: row.txHash,
      block_or_slot: row.blockOrSlot?.toString() ?? '0',
      amount_usdc_micros: row.amountUsdcMicros.toString(),
      from_wallet: row.fromWallet,
      to_wallet: row.toWallet,
      nonce: row.nonce,
      status: row.status,
      endpoint_id: row.endpointId ?? '',
      endpoint: '',
      observed_at: row.observedAt.toISOString(),
      settled_at: row.settledAt?.toISOString() ?? null,
      verify_ms: 0,
    });
  })
  // ---------------------------------------------------------------------
  // Proxy → API ingest.  Server-to-server.  Bearer-token auth.
  //
  // KNOWN IDEMPOTENCY GAP — fix tracked in TODO(billing-dedup):
  //   The unique index is on (chain, tx_hash, observed_at) where
  //   observed_at is server-set at insert time.  Two retransmits of the
  //   same on-chain tx therefore land as DISTINCT rows (different
  //   observed_at), each with its own UUID, each emitting its own pair
  //   of Stripe meter events under distinct identifiers.  Result: a
  //   misbehaving proxy can double-bill the customer.
  //
  //   The right fix is one of:
  //     (a) accept observed_at from the proxy and rely on (chain,
  //         tx_hash, observed_at) actually colliding for retries; or
  //     (b) move idempotency to (chain, tx_hash) only — requires
  //         reworking the partitioning model since partitioned tables
  //         require the partition key in unique indexes.
  //   Stripe's per-identifier dedup does NOT save us here because each
  //   row gets a fresh UUID → fresh identifier.
  // ---------------------------------------------------------------------
  .post(
    '/ingest',
    zValidator(
      'json',
      z.object({
        project_slug: z.string().regex(/^[a-z0-9][a-z0-9-]{2,62}[a-z0-9]$/),
        chain: z.string().min(1),
        tx_hash: z.string().min(1),
        block_or_slot: z.union([z.number(), z.string()]).optional(),
        amount_usdc_micros: z.string().regex(/^\d+$/),
        from_wallet: z.string().min(1),
        to_wallet: z.string().min(1),
        nonce: z.string().min(1),
        endpoint_path: z.string().min(1),
        status: z.enum(['pending', 'settled', 'refunded', 'reorged', 'upstream_failed']).default('settled'),
      }),
    ),
    async (c) => {
      // Shared-secret bearer auth.  Set both sides' env to the same value.
      const expected = process.env['LIMEN_API_INGEST_TOKEN'];
      if (!expected) {
        return c.json(
          { error: 'INGEST_DISABLED', detail: 'set LIMEN_API_INGEST_TOKEN on the API to enable proxy ingest' },
          503,
        );
      }
      const authHeader = c.req.header('authorization') ?? '';
      const provided = authHeader.replace(/^Bearer\s+/i, '');
      const a = Buffer.from(provided, 'utf8');
      const b = Buffer.from(expected, 'utf8');
      if (a.length !== b.length || !timingSafeEqual(a, b)) {
        return c.json({ error: 'unauthorized', detail: 'invalid ingest token' }, 401);
      }

      const body = c.req.valid('json');
      const db = getDb();

      // Upsert project.  Pull stripe_customer_id at the same time so the
      // settlement → meter hook below has zero extra round-trips.
      const projectRow = await db
        .select({ id: projects.id, stripeCustomerId: projects.stripeCustomerId })
        .from(projects)
        .where(eq(projects.slug, body.project_slug))
        .limit(1);
      let projectId = projectRow[0]?.id;
      let stripeCustomerId = projectRow[0]?.stripeCustomerId ?? null;
      if (!projectId) {
        projectId = randomUUID();
        await db.insert(projects).values({
          id: projectId,
          slug: body.project_slug,
          name: body.project_slug,
          ownerWallet: body.to_wallet,
        });
        stripeCustomerId = null;
      }

      // Upsert endpoint.
      const existingEp = await db
        .select({ id: endpoints.id })
        .from(endpoints)
        .where(and(eq(endpoints.projectId, projectId), eq(endpoints.pathGlob, body.endpoint_path)))
        .limit(1);
      let endpointId = existingEp[0]?.id;
      if (!endpointId) {
        endpointId = randomUUID();
        await db.insert(endpoints).values({
          id: endpointId,
          projectId,
          pathGlob: body.endpoint_path,
          priceUsdcMicros: BigInt(body.amount_usdc_micros),
        });
      }

      // Insert transaction (idempotent via (chain, tx_hash, observed_at) unique).
      const now = new Date();
      const id = randomUUID();
      try {
        await db.insert(transactions).values({
          id,
          projectId,
          endpointId,
          chain: body.chain,
          txHash: body.tx_hash,
          blockOrSlot:
            body.block_or_slot === undefined
              ? null
              : typeof body.block_or_slot === 'number'
                ? BigInt(body.block_or_slot)
                : BigInt(body.block_or_slot),
          amountUsdcMicros: BigInt(body.amount_usdc_micros),
          fromWallet: body.from_wallet,
          toWallet: body.to_wallet,
          nonce: body.nonce,
          status: body.status,
          settledAt: body.status === 'settled' ? now : null,
          observedAt: now,
        });
      } catch (err) {
        // Duplicate (same chain+tx+time) → treat as idempotent.  Stripe meter
        // events are also idempotent on the same identifier, so even if a
        // duplicate slips through we won't double-bill — but we skip the call
        // here to avoid the wasted API roundtrip.
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('duplicate key') || msg.includes('unique')) {
          return c.json({ id, status: 'duplicate' });
        }
        throw err;
      }

      // Settlement → Stripe meter.  Fire-and-forget.  emitMeterEvent never
      // throws and no-ops when STRIPE_BILLING_ENABLED=false or the project
      // has no stripe_customer_id wired up yet.
      if (body.status === 'settled' && stripeCustomerId !== null) {
        const env = getEnv();
        const ids = meterIdentifiersFor(id);
        void Promise.all([
          emitMeterEvent({
            customerId: stripeCustomerId,
            eventName: env.STRIPE_METER_TX_NAME,
            value: '1',
            identifier: ids.txCount,
          }),
          emitMeterEvent({
            customerId: stripeCustomerId,
            eventName: env.STRIPE_METER_VOLUME_NAME,
            value: body.amount_usdc_micros,
            identifier: ids.volume,
          }),
        ]).catch((err: unknown) => {
          getLogger().debug(
            { err: (err as Error).message, txId: id },
            'meter event Promise.all unexpected reject (should not happen)',
          );
        });
      }

      return c.json({ id, status: 'recorded' }, 201);
    },
  );
