import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { and, desc, eq, lt, sql } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { transactions, endpoints } from '../db/schema.js';

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
  });
