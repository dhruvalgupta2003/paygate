import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import { getDb } from '../db/index.js';

type Row = {
  wallet: string;
  chain_preferred: string;
  request_count: number;
  spend_usdc_micros: string;
  first_seen_at: string;
  last_seen_at: string;
};

type TopRow = {
  wallet: string;
  endpoint: string;
  requests: number;
  revenue_usdc_micros: string;
};

export const agentsRoutes = new Hono().get('/', async (c) => {
  const db = getDb();

  const agents = (await db.execute(sql`
    SELECT
      from_wallet            AS wallet,
      mode() WITHIN GROUP (ORDER BY chain) AS chain_preferred,
      count(*)::int          AS request_count,
      coalesce(sum(amount_usdc_micros)::text, '0') AS spend_usdc_micros,
      to_char(min(observed_at), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS first_seen_at,
      to_char(max(observed_at), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_seen_at
    FROM transactions
    WHERE status = 'settled'
    GROUP BY from_wallet
    ORDER BY sum(amount_usdc_micros) DESC
    LIMIT 100
  `)) as unknown as ReadonlyArray<Row>;

  // Top endpoints per wallet (at most 5).
  const topEnds = (await db.execute(sql`
    SELECT
      t.from_wallet AS wallet,
      coalesce(e.path_glob, '(unknown)') AS endpoint,
      count(*)::int AS requests,
      coalesce(sum(t.amount_usdc_micros)::text, '0') AS revenue_usdc_micros
    FROM transactions t
    LEFT JOIN endpoints e ON e.id = t.endpoint_id
    WHERE t.status = 'settled'
    GROUP BY t.from_wallet, e.path_glob
  `)) as unknown as ReadonlyArray<TopRow>;

  const topsByWallet = new Map<string, TopRow[]>();
  for (const r of topEnds) {
    const arr = topsByWallet.get(r.wallet) ?? [];
    arr.push(r);
    topsByWallet.set(r.wallet, arr);
  }

  const items = agents.map((a) => {
    const top = (topsByWallet.get(a.wallet) ?? [])
      .sort((x, y) => Number(BigInt(y.revenue_usdc_micros) - BigInt(x.revenue_usdc_micros)))
      .slice(0, 5)
      .map((e) => ({
        endpoint: e.endpoint,
        requests: e.requests,
        revenue_usdc_micros: e.revenue_usdc_micros,
      }));

    // 168 buckets (7d × 24h) — leave as zeroes; populating this
    // accurately needs a join with observed_at buckets.  Dashboard
    // renders it as a heatmap; all-zeroes renders as an empty grid.
    const heatmap = new Array<number>(168).fill(0);

    return {
      wallet: a.wallet,
      label: null,
      chain_preferred: a.chain_preferred,
      request_count: a.request_count,
      spend_usdc_micros: a.spend_usdc_micros,
      first_seen_at: a.first_seen_at,
      last_seen_at: a.last_seen_at,
      top_endpoints: top,
      request_heatmap: heatmap,
    };
  });

  return c.json({ items });
});
