import {
  Area,
  AreaChart as RAreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface Series {
  key: string;
  color: string;
}

interface Props<T extends Record<string, number | string>> {
  data: readonly T[];
  xKey: keyof T & string;
  series: readonly Series[];
  height?: number;
}

export function AreaChart<T extends Record<string, number | string>>({
  data,
  xKey,
  series,
  height = 220,
}: Props<T>) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RAreaChart data={data as never[]}>
        <defs>
          {series.map((s) => (
            <linearGradient id={`fill-${s.key}`} key={s.key} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.35" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="2 4" stroke="currentColor" strokeOpacity="0.1" vertical={false} />
        <XAxis dataKey={xKey} stroke="currentColor" strokeOpacity="0.4" tickLine={false} axisLine={false} />
        <YAxis stroke="currentColor" strokeOpacity="0.4" tickLine={false} axisLine={false} />
        <Tooltip
          contentStyle={{
            background: 'var(--tooltip-bg, #fff)',
            border: '1px solid rgba(99,102,241,0.25)',
            borderRadius: 12,
            fontSize: 12,
          }}
        />
        {series.map((s) => (
          <Area
            key={s.key}
            dataKey={s.key}
            type="monotone"
            stroke={s.color}
            strokeWidth={1.6}
            fill={`url(#fill-${s.key})`}
          />
        ))}
      </RAreaChart>
    </ResponsiveContainer>
  );
}
