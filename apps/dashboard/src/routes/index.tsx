import { createFileRoute } from '@tanstack/react-router';
import { useAnalyticsSummary, useAnalyticsTimeseries } from '../hooks/useAnalytics';
import { PageHeader } from '../components/layout/PageHeader';
import { BentoCell, BentoGrid } from '../components/bento/BentoGrid';
import { KPICard } from '../components/bento/KPICard';
import { AreaChart } from '../components/charts/AreaChart';
import { formatUsdc } from '../lib/format';

export const Route = createFileRoute('/')({
  component: Overview,
});

function trendPct(curr: number | bigint, prev: number | bigint): number {
  const c = Number(curr);
  const p = Number(prev);
  if (p === 0) return 0;
  return ((c - p) / p) * 100;
}

function Overview() {
  const summary = useAnalyticsSummary('24h');
  const revenue = useAnalyticsTimeseries('revenue_usdc', '1h', '24h');

  const data = (revenue.data?.points ?? []).map((p) => ({
    t: new Date(p.t).toLocaleTimeString([], { hour: '2-digit' }),
    base: Number(p.v),
    solana: Number(p.v) * 0.4,
  }));

  const s = summary.data;

  return (
    <>
      <PageHeader
        title="Overview"
        description="Last 24 hours of agent-paid traffic across every chain."
      />
      <BentoGrid>
        <BentoCell span="sm">
          <KPICard
            label="Revenue 24h"
            value={s ? formatUsdc(s.revenue_usdc_micros) : '—'}
            trend={s ? trendPct(BigInt(s.revenue_usdc_micros), BigInt(s.previous_revenue_usdc_micros)) : 0}
            spark={[2, 3, 2, 4, 6, 5, 8, 10, 9, 12]}
            tone="indigo"
          />
        </BentoCell>
        <BentoCell span="sm">
          <KPICard
            label="Requests"
            value={s ? s.requests.toLocaleString() : '—'}
            trend={s ? trendPct(s.requests, s.previous_requests) : 0}
            spark={[20, 30, 40, 55, 38, 47, 62, 70, 60, 80]}
            tone="emerald"
          />
        </BentoCell>
        <BentoCell span="sm">
          <KPICard
            label="Active wallets"
            value={s ? s.active_wallets.toLocaleString() : '—'}
            trend={s ? trendPct(s.active_wallets, s.previous_active_wallets) : 0}
            spark={[4, 5, 5, 6, 7, 7, 8, 9, 9, 10]}
            tone="amber"
          />
        </BentoCell>
        <BentoCell span="sm">
          <KPICard
            label="Verify p99"
            value={s ? `${Math.round(s.verify_p99_ms)} ms` : '—'}
            trend={s ? trendPct(s.verify_p99_ms, s.previous_verify_p99_ms) : 0}
            spark={[300, 280, 260, 250, 230, 230, 220, 218, 215, 218]}
            tone="rose"
          />
        </BentoCell>

        <BentoCell span="lg">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-medium uppercase tracking-widest text-ink-500">
              Revenue · 24h
            </h2>
            <span className="text-xs text-ink-400">stacked by chain</span>
          </div>
          <AreaChart
            data={data}
            xKey="t"
            series={[
              { key: 'base', color: '#4F46E5' },
              { key: 'solana', color: '#22D3EE' },
            ]}
            height={260}
          />
        </BentoCell>

        <BentoCell span="md">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-widest text-ink-500">
            Top endpoints
          </h2>
          <ul className="space-y-3 text-sm">
            {(s?.top_endpoints ?? []).slice(0, 5).map((e) => (
              <li
                key={e.path}
                className="flex items-center justify-between rounded-lg bg-ink-100/60 px-3 py-2 dark:bg-ink-800/40"
              >
                <code className="truncate text-[12px]">{e.path}</code>
                <span className="text-xs tabular-nums text-ink-700 dark:text-ink-200">
                  {formatUsdc(e.revenue_usdc_micros)}
                </span>
              </li>
            ))}
            {(s?.top_endpoints?.length ?? 0) === 0 ? (
              <li className="rounded-lg border border-dashed border-ink-200 p-4 text-center text-xs text-ink-500 dark:border-ink-700">
                No endpoint data yet.
              </li>
            ) : null}
          </ul>
        </BentoCell>
      </BentoGrid>
    </>
  );
}
