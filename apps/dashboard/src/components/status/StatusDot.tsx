import { cn } from '~/lib/cn';

type Status = 'settled' | 'pending' | 'failed' | 'refunded' | 'reorged' | 'blocked' | 'ok';

const PALETTE: Record<Status, { dot: string; label: string; pulse: boolean; text: string }> = {
  settled: { dot: 'bg-state-success', label: 'Settled', pulse: false, text: 'text-state-success' },
  ok: { dot: 'bg-state-success', label: 'OK', pulse: false, text: 'text-state-success' },
  pending: { dot: 'bg-state-warn', label: 'Pending', pulse: true, text: 'text-state-warn' },
  failed: { dot: 'bg-state-danger', label: 'Failed', pulse: false, text: 'text-state-danger' },
  refunded: { dot: 'bg-indigo-400', label: 'Refunded', pulse: false, text: 'text-indigo-400' },
  reorged: { dot: 'bg-state-warn', label: 'Reorged', pulse: false, text: 'text-state-warn' },
  blocked: { dot: 'bg-state-danger', label: 'Blocked', pulse: false, text: 'text-state-danger' },
};

interface Props {
  status: Status;
  withLabel?: boolean;
  className?: string;
}

export function StatusDot({ status, withLabel = true, className }: Props) {
  const conf = PALETTE[status];
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs', className)}>
      <span
        className={cn(
          'relative inline-block size-1.5 rounded-full',
          conf.dot,
          conf.pulse && 'pg-live-dot',
        )}
        aria-hidden
      />
      {withLabel ? (
        <span className={cn('pg-numeric', conf.text)}>{conf.label}</span>
      ) : null}
    </span>
  );
}
