import { SparkLine } from '../charts/SparkLine';

interface Props {
  label: string;
  value: string;
  trend?: number;
  spark?: readonly number[];
  tone?: 'indigo' | 'emerald' | 'amber' | 'rose';
}

export function KPICard({ label, value, trend, spark, tone = 'indigo' }: Props) {
  const up = (trend ?? 0) >= 0;
  const trendChip = trend !== undefined
    ? `${up ? '+' : ''}${trend.toFixed(1)}%`
    : null;
  return (
    <div className="flex h-full flex-col justify-between">
      <div>
        <div className="text-xs uppercase tracking-widest text-ink-500 dark:text-ink-400">
          {label}
        </div>
        <div className="mt-2 text-4xl font-semibold tabular-nums tracking-tight text-ink-900 dark:text-ink-50">
          {value}
        </div>
      </div>
      <div className="mt-4 flex items-end justify-between gap-3">
        {trendChip ? (
          <span
            className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${
              up
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                : 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'
            }`}
          >
            {trendChip}
          </span>
        ) : <span />}
        {spark ? <SparkLine data={spark} tone={tone} className="h-10 w-24" /> : null}
      </div>
    </div>
  );
}
