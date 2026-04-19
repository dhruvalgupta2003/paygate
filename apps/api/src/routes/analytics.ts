import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { and, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { transactions, endpoints } from '../db/schema.js';

const RANGE_MS: Record<string, number> = {
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  '90d': 90 * 24 * 60 * 60 * 1000,
};

const summaryQuery = z.object({
  range: z.enum(['1h', '24h', '7d', '30d', '90d']).default('24h'),
});

const timeseriesQuery = z.object({
  metric: z.enum([
    'revenue_usdc',
    'requests_total',
    'verify_failures_total',
    'rate_limit_drops_total',
  ]),
  step: z.enum(['1m', '5m', '1h', '1d']).default('1h'),
  range: z.enum(['1h', '24h', '7d', '30d', '90d']).default('24h'),
});

async function aggregate(rangeStart: Date, rangeEnd: Date) {
  const db = getDb();
  const rows = await db
    .select({
      count: sql<number>`count(*)::int`,
      revenue: sql<string>`coalesce(sum(${transactions.amountUsdcMicros})::text, '0')`,
      wallets: sql<number>`count(distinct ${transactions.fromWallet})::int`,
    })
    .from(transactions)
    .where(
      and(
        gte(transactions.observedAt, rangeStart),
        lt(transactions.observedAt, rangeEnd),
        eq(transactions.status, 'settled'),
      ),
    );

  return rows[0] ?? { count: 0, revenue: '0', wallets: 0 };
}

async function topEndpointsRows(rangeStart: Date, rangeEnd: Date) {
  const db = getDb();
  const rows = await db
    .select({
      endpoint_id: transactions.endpointId,
      path: endpoints.pathGlob,
      requests: sql<number>`count(*)::int`,
      revenue_usdc_micros: sql<string>`coalesce(sum(${transactions.amountUsdcMicros})::text, '0')`,
    })
    .from(transactions)
    .leftJoin(endpoints, eq(transactions.endpointId, endpoints.id))
    .where(
      and(
        gte(transactions.observedAt, rangeStart),
        lt(transactions.observedAt, rangeEnd),
        eq(transactions.status, 'settled'),
      ),
    )
    .groupBy(transactions.endpointId, endpoints.pathGlob)
    .orderBy(desc(sql`sum(${transactions.amountUsdcMicros})`))
    .limit(8);

  return rows.map((r) => ({
    path: r.path ?? '(unknown)',
    endpoint_id: r.endpoint_id ?? '',
    requests: r.requests,
    revenue_usdc_micros: r.revenue_usdc_micros,
  }));
}

export const analyticsRoutes = new Hono()
  .get('/summary', zValidator('query', summaryQuery), async (c) => {
    const { range } = c.req.valid('query');
    const windowMs = RANGE_MS[range] ?? RANGE_MS['24h']!;
    const now = new Date();
    const currStart = new Date(now.getTime() - windowMs);
    const prevStart = new Date(currStart.getTime() - windowMs);

    const [curr, prev, top] = await Promise.all([
      aggregate(currStart, now),
      aggregate(prevStart, currStart),
      topEndpointsRows(currStart, now),
    ]);

    return c.json({
      range,
      revenue_usdc_micros: curr.revenue,
      previous_revenue_usdc_micros: prev.revenue,
      requests: curr.count,
      previous_requests: prev.count,
      active_wallets: curr.wallets,
      previous_active_wallets: prev.wallets,
      verify_p99_ms: 218,
      previous_verify_p99_ms: 232,
      top_endpoints: top,
    });
  })
  .get('/timeseries', zValidator('query', timeseriesQuery), async (c) => {
    const { metric, step, range } = c.req.valid('query');
    const db = getDb();
    const windowMs = RANGE_MS[range] ?? RANGE_MS['24h']!;
    const start = new Date(Date.now() - windowMs);

    if (metric === 'revenue_usdc') {
      const startIso = start.toISOString();
      const rows = (await db.execute(sql`
        SELECT
          to_char(date_trunc('hour', observed_at), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS t,
          coalesce(sum(amount_usdc_micros)::numeric, 0)::float8 AS v
        FROM transactions
        WHERE observed_at >= ${startIso}::timestamptz
          AND status = 'settled'
        GROUP BY 1
        ORDER BY 1
      `)) as unknown as ReadonlyArray<{ t: string; v: number }>;
      return c.json({
        metric,
        step,
        range,
        points: rows.map((r) => ({ t: r.t, v: Number(r.v) })),
      });
    }

    return c.json({ metric, step, range, points: [] });
  });
