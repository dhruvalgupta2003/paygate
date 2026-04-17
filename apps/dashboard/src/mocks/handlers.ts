import { http, HttpResponse, delay } from 'msw';
import type { AnalyticsSummary, Timeseries, TimeseriesPoint } from '~/lib/schemas';
import { RANGE_MS, RANGE_STEP_MS, type TimeRange } from '~/lib/time';
import {
  MOCK_AGENTS,
  MOCK_AUDIT_LOG,
  MOCK_COMPLIANCE,
  MOCK_DIRECTORY,
  MOCK_ENDPOINTS,
  MOCK_SETTINGS,
  MOCK_TRANSACTIONS,
  MOCK_WEBHOOK_DELIVERIES,
  MOCK_WEBHOOKS,
} from './fixtures';

const API_BASE =
  (import.meta.env['VITE_API_URL'] as string | undefined) ??
  'http://localhost:4020';
const PREFIX = `${API_BASE}/_paygate/v1`;

function rangeFrom(param: string | null): TimeRange {
  if (param && (['1h', '24h', '7d', '30d', '90d'] as string[]).includes(param)) {
    return param as TimeRange;
  }
  return '24h';
}

function buildSummary(range: TimeRange): AnalyticsSummary {
  const ms = RANGE_MS[range];
  const rangeStart = Date.now() - ms;
  const prevStart = rangeStart - ms;
  const curr = MOCK_TRANSACTIONS.filter(
    (t) => new Date(t.observed_at).getTime() >= rangeStart,
  );
  const prev = MOCK_TRANSACTIONS.filter((t) => {
    const ts = new Date(t.observed_at).getTime();
    return ts >= prevStart && ts < rangeStart;
  });

  const revenue = curr.reduce(
    (acc, t) => acc + BigInt(t.amount_usdc_micros),
    0n,
  );
  const prevRev = prev.reduce(
    (acc, t) => acc + BigInt(t.amount_usdc_micros),
    0n,
  );

  const wallets = new Set(curr.map((t) => t.from_wallet));
  const prevWallets = new Set(prev.map((t) => t.from_wallet));

  const verifyTimes = curr.map((t) => t.verify_ms).sort((a, b) => a - b);
  const prevVerify = prev.map((t) => t.verify_ms).sort((a, b) => a - b);

  const p99 =
    verifyTimes[Math.floor(verifyTimes.length * 0.99)] ??
    verifyTimes[verifyTimes.length - 1] ??
    0;
  const prevP99 =
    prevVerify[Math.floor(prevVerify.length * 0.99)] ??
    prevVerify[prevVerify.length - 1] ??
    0;

  const endpointAgg = new Map<
    string,
    { path: string; endpoint_id: string; requests: number; revenue: bigint }
  >();
  for (const t of curr) {
    const cur = endpointAgg.get(t.endpoint_id) ?? {
      path: t.endpoint,
      endpoint_id: t.endpoint_id,
      requests: 0,
      revenue: 0n,
    };
    endpointAgg.set(t.endpoint_id, {
      ...cur,
      requests: cur.requests + 1,
      revenue: cur.revenue + BigInt(t.amount_usdc_micros),
    });
  }

  const topEndpoints = [...endpointAgg.values()]
    .sort((a, b) => Number(b.revenue - a.revenue))
    .slice(0, 8)
    .map((e) => ({
      path: e.path,
      endpoint_id: e.endpoint_id,
      requests: e.requests,
      revenue_usdc_micros: e.revenue.toString(),
    }));

  return {
    range,
    revenue_usdc_micros: revenue.toString(),
    previous_revenue_usdc_micros: prevRev.toString(),
    requests: curr.length,
    previous_requests: prev.length,
    active_wallets: wallets.size,
    previous_active_wallets: prevWallets.size,
    verify_p99_ms: p99,
    previous_verify_p99_ms: prevP99,
    top_endpoints: topEndpoints,
    top_agents: MOCK_AGENTS.slice(0, 5).map((a) => ({
      wallet: a.wallet,
      requests: a.request_count,
      revenue_usdc_micros: a.spend_usdc_micros,
    })),
  };
}

function buildTimeseries(metric: string, range: TimeRange): Timeseries {
  const step = RANGE_STEP_MS[range];
  const total = RANGE_MS[range];
  const buckets = Math.max(1, Math.floor(total / step));
  const now = Date.now();
  const points: TimeseriesPoint[] = [];
  for (let i = buckets - 1; i >= 0; i--) {
    const t = new Date(now - i * step);
    const start = t.getTime() - step;
    const end = t.getTime();
    const inBucket = MOCK_TRANSACTIONS.filter((tx) => {
      const ts = new Date(tx.observed_at).getTime();
      return ts >= start && ts < end;
    });
    const byChain: Record<string, number> = {};
    let total = 0;
    for (const tx of inBucket) {
      const val =
        metric === 'revenue_usdc'
          ? Number(tx.amount_usdc_micros) / 1_000_000
          : metric === 'requests_total'
            ? 1
            : 0;
      byChain[tx.chain] = (byChain[tx.chain] ?? 0) + val;
      total += val;
    }
    points.push({
      t: t.toISOString(),
      v: total,
      // Only expose chain split for revenue-style metrics.
      ...(metric === 'revenue_usdc' ? { by_chain: byChain as TimeseriesPoint['by_chain'] } : {}),
    });
  }
  return {
    metric,
    step: `${step}ms`,
    range,
    points,
  };
}

export const handlers = [
  http.get(`${PREFIX}/analytics/summary`, async ({ request }) => {
    await delay(180);
    const url = new URL(request.url);
    const range = rangeFrom(url.searchParams.get('range'));
    return HttpResponse.json(buildSummary(range));
  }),

  http.get(`${PREFIX}/analytics/timeseries`, async ({ request }) => {
    await delay(120);
    const url = new URL(request.url);
    const metric = url.searchParams.get('metric') ?? 'revenue_usdc';
    const range = rangeFrom(url.searchParams.get('range'));
    return HttpResponse.json(buildTimeseries(metric, range));
  }),

  http.get(`${PREFIX}/transactions`, async ({ request }) => {
    await delay(200);
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get('limit') ?? '50');
    const cursor = url.searchParams.get('cursor');
    const chain = url.searchParams.get('chain');
    const status = url.searchParams.get('status');
    const q = url.searchParams.get('q')?.toLowerCase();

    let filtered = MOCK_TRANSACTIONS;
    if (chain && chain !== 'all') {
      filtered = filtered.filter((t) => t.chain === chain);
    }
    if (status && status !== 'all') {
      filtered = filtered.filter((t) => t.status === status);
    }
    if (q) {
      filtered = filtered.filter(
        (t) =>
          t.from_wallet.toLowerCase().includes(q) ||
          t.endpoint.toLowerCase().includes(q) ||
          t.tx_hash.toLowerCase().includes(q),
      );
    }

    let startIdx = 0;
    if (cursor) {
      const parsed = Number.parseInt(cursor, 10);
      if (!Number.isNaN(parsed)) startIdx = parsed;
    }
    const page = filtered.slice(startIdx, startIdx + limit);
    const nextIdx = startIdx + page.length;
    const next = nextIdx < filtered.length ? String(nextIdx) : null;

    return HttpResponse.json({
      items: page,
      next_cursor: next,
      total: filtered.length,
    });
  }),

  http.get(`${PREFIX}/endpoints`, async () => {
    await delay(140);
    return HttpResponse.json({ items: MOCK_ENDPOINTS });
  }),

  http.patch(`${PREFIX}/endpoints/:id`, async ({ request, params }) => {
    await delay(240);
    const body = (await request.json()) as {
      price_usdc_micros?: string;
      enabled?: boolean;
    };
    const endpoint = MOCK_ENDPOINTS.find((e) => e.id === params['id']);
    if (!endpoint) {
      return HttpResponse.json(
        { error: 'NOT_FOUND', detail: 'Endpoint not found' },
        { status: 404 },
      );
    }
    const updated = { ...endpoint };
    if (body.price_usdc_micros !== undefined) {
      updated.price_usdc_micros = body.price_usdc_micros;
    }
    if (body.enabled !== undefined) {
      updated.enabled = body.enabled;
    }
    // Mutate the fixture for subsequent reads.
    const idx = MOCK_ENDPOINTS.findIndex((e) => e.id === endpoint.id);
    if (idx >= 0) {
      MOCK_ENDPOINTS.splice(idx, 1, updated);
    }
    return HttpResponse.json(updated);
  }),

  http.get(`${PREFIX}/agents`, async () => {
    await delay(180);
    return HttpResponse.json({ items: MOCK_AGENTS });
  }),

  http.get(`${PREFIX}/webhooks`, async () => {
    await delay(120);
    return HttpResponse.json({ items: MOCK_WEBHOOKS });
  }),

  http.get(`${PREFIX}/webhooks/deliveries`, async ({ request }) => {
    await delay(140);
    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const list =
      status && status !== 'all'
        ? MOCK_WEBHOOK_DELIVERIES.filter((d) => d.status === status)
        : MOCK_WEBHOOK_DELIVERIES;
    return HttpResponse.json({ items: list });
  }),

  http.post(
    `${PREFIX}/webhooks/deliveries/:id/redeliver`,
    async ({ params }) => {
      await delay(320);
      return HttpResponse.json({ id: params['id'], status: 'pending' });
    },
  ),

  http.get(`${PREFIX}/compliance`, async () => {
    await delay(120);
    return HttpResponse.json({ items: MOCK_COMPLIANCE });
  }),

  http.get(`${PREFIX}/audit/log`, async () => {
    await delay(160);
    return HttpResponse.json({ items: MOCK_AUDIT_LOG });
  }),

  http.post(`${PREFIX}/audit/verify`, async () => {
    await delay(800);
    const anomaly = MOCK_AUDIT_LOG.find((a) => !a.verified);
    return HttpResponse.json({
      ok: !anomaly,
      checked: MOCK_AUDIT_LOG.length,
      failures: anomaly ? [anomaly.id] : [],
    });
  }),

  http.get(`${PREFIX}/directory/listing`, async () => {
    await delay(110);
    return HttpResponse.json(MOCK_DIRECTORY);
  }),

  http.get(`${PREFIX}/settings`, async () => {
    await delay(110);
    return HttpResponse.json(MOCK_SETTINGS);
  }),

  http.patch(`${PREFIX}/settings`, async ({ request }) => {
    await delay(240);
    const patch = (await request.json()) as Record<string, unknown>;
    Object.assign(MOCK_SETTINGS, patch);
    return HttpResponse.json(MOCK_SETTINGS);
  }),

  http.post(`${PREFIX}/settings/rotate-admin-key`, async () => {
    await delay(600);
    MOCK_SETTINGS.admin_key_last_rotated_at = new Date().toISOString();
    return HttpResponse.json({
      ok: true,
      rotated_at: MOCK_SETTINGS.admin_key_last_rotated_at,
    });
  }),
];
