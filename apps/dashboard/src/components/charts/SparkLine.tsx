import { cn } from '../../lib/cn';

const TONES = {
  cobalt: '#2856B3',
  copper: '#B86E3C',
  mint: '#059669',
  indigo: '#4F46E5',
  emerald: '#10B981',
  amber: '#F59E0B',
  rose: '#F43F5E',
} as const;

interface Props {
  data: readonly number[];
  tone?: keyof typeof TONES;
  className?: string;
}

export function SparkLine({ data, tone = 'indigo', className }: Props) {
  if (data.length === 0) return <div className={className} />;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = Math.max(1e-9, max - min);
  const points = data
    .map((v, i) => {
      const x = (i / Math.max(1, data.length - 1)) * 100;
      const y = 100 - ((v - min) / range) * 100;
      return `${x},${y}`;
    })
    .join(' ');
  const area = `0,100 ${points} 100,100`;
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={cn('overflow-visible', className)}>
      <defs>
        <linearGradient id={`spark-${tone}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={TONES[tone]} stopOpacity="0.35" />
          <stop offset="100%" stopColor={TONES[tone]} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#spark-${tone})`} />
      <polyline points={points} fill="none" stroke={TONES[tone]} strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
