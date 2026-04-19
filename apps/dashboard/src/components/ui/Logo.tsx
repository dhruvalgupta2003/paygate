import { cn } from '~/lib/cn';

interface LogoProps {
  size?: number;
  withWordmark?: boolean;
  className?: string;
}

/**
 * Limen mark — two horizontal beams separated by a generous gap.
 * The gap IS the limen: the threshold an agent crosses from free to paid.
 * Inlined so it inherits the surrounding `color` via `currentColor`.
 */
export function Logo({ size = 28, withWordmark = false, className }: LogoProps) {
  return (
    <span className={cn('inline-flex items-center gap-2.5 text-ink', className)}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 256 256"
        role="img"
        aria-label="Limen"
        className="shrink-0 select-none"
      >
        <title>Limen</title>
        <g fill="currentColor">
          <rect x="48" y="88" width="160" height="14" rx="2" />
          <rect x="48" y="144" width="160" height="24" rx="2" />
        </g>
      </svg>
      {withWordmark ? (
        <span
          className="limen-wordmark text-[19px] font-medium tracking-[-0.045em] text-ink lowercase"
          style={{ fontFamily: "'Space Grotesk', 'Inter', 'InterVariable', system-ui, sans-serif" }}
        >
          limen
        </span>
      ) : null}
    </span>
  );
}
