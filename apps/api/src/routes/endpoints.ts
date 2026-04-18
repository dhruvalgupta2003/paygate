import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { endpoints, transactions } from '../db/schema.js';

const patchBody = z
  .object({
    price_usdc_micros: z.string().regex(/^\d+$/).optional(),
    enabled: z.boolean().optional(),
  })
  .refine((v) => v.price_usdc_micros !== undefined || v.enabled !== undefined, {
    message: 'at least one of price_usdc_micros or enabled required',
  });

/**
 * Build a dashboard-shaped Endpoint DTO from a row + its last-7d aggregates.
 * The dashboard's Zod schema requires requests_7d to be exactly 7 numbers.
 */
function buildRequestsArray(rows: ReadonlyArray<{ day: number; count: number }>, len = 7): number[] {
  const arr = new Array(len).fill(0) as number[];
  for (const r of rows) {
    if (r.day >= 0 && r.day < len) arr[len - 1 - r.day] = r.count;
  }
  return arr;
}

export const endpointsRoutes = new Hono()
  .get('/', async (c) => {
    const db = getDb();
    const rows = await db.select().from(endpoints).orderBy(desc(endpoints.createdAt));

    // Per-endpoint 7d: bucket by day offset.  Cutoff inlined as SQL
    // interval to avoid binding a JS Date through the driver.
    const agg = (await db.execute(sql`
      SELECT
        endpoint_id,
        EXTRACT(day FROM (NOW() - observed_at))::int AS day,
        count(*)::int AS count,
        coalesce(sum(amount_usdc_micros)::text, '0') AS revenue
      FROM transactions
      WHERE observed_at >= NOW() - INTERVAL '7 days'
        AND status = 'settled'
      GROUP BY endpoint_id, day
    `)) as unknown as ReadonlyArray<{
      endpoint_id: string | null;
      day: number;
      count: number;
      revenue: string;
    }>;

    const byId = new Map<string, Array<{ day: number; count: number; revenue: bigint }>>();
    for (const r of agg) {
      if (!r.endpoint_id) continue;
      const cur = byId.get(r.endpoint_id) ?? [];
      cur.push({ day: r.day, count: r.count, revenue: BigInt(r.revenue) });
      byId.set(r.endpoint_id, cur);
    }

    const items = rows.map((ep) => {
      const bucket = byId.get(ep.id) ?? [];
      const totalRevenue = bucket.reduce((a, b) => a + b.revenue, 0n);
      return {
        id: ep.id,
        path_glob: ep.pathGlob,
        method:
          Array.isArray(ep.method) && ep.method.length > 0
            ? (ep.method[0] as string)
            : 'ANY',
        description: null,
        price_usdc_micros: ep.priceUsdcMicros.toString(),
        enabled: ep.enabled,
        tags: ep.tags ?? [],
        chains: ['base-sepolia'] as string[], // TODO: derive from recent tx chain mix
        created_at: ep.createdAt.toISOString(),
        requests_7d: buildRequestsArray(bucket),
        revenue_7d_micros: totalRevenue.toString(),
      };
    });

    return c.json({ items });
  })
  .patch('/:id', zValidator('json', patchBody), async (c) => {
    const id = c.req.param('id');
    const body = c.req.valid('json');
    const db = getDb();

    const update: Record<string, unknown> = {};
    if (body.price_usdc_micros !== undefined) {
      update['priceUsdcMicros'] = BigInt(body.price_usdc_micros);
    }
    if (body.enabled !== undefined) update['enabled'] = body.enabled;

    await db.update(endpoints).set(update).where(eq(endpoints.id, id));

    const rows = await db.select().from(endpoints).where(eq(endpoints.id, id)).limit(1);
    const ep = rows[0];
    if (!ep) return c.json({ error: 'not_found' }, 404);

    return c.json({
      id: ep.id,
      path_glob: ep.pathGlob,
      method:
        Array.isArray(ep.method) && ep.method.length > 0
          ? (ep.method[0] as string)
          : 'ANY',
      description: ep.description ?? null,
      price_usdc_micros: ep.priceUsdcMicros.toString(),
      enabled: ep.enabled,
      tags: ep.tags ?? [],
      chains: ['base-sepolia'],
      created_at: ep.createdAt.toISOString(),
      requests_7d: [0, 0, 0, 0, 0, 0, 0],
      revenue_7d_micros: '0',
    });
  });

// Silence "unused" from tsc if aggregation changes.
void and;
void gte;
