import { cn } from '~/lib/cn';

interface LogoProps {
  size?: number;
  withWordmark?: boolean;
  className?: string;
}

/**
 * PayGate mark — two posts + one stamp. Three filled rectangles, full stop.
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
        aria-label="PayGate"
        className="shrink-0 select-none"
      >
        <title>PayGate</title>
        <g fill="currentColor">
          <rect x="44" y="32" width="44" height="192" rx="3" />
          <rect x="168" y="32" width="44" height="192" rx="3" />
          <rect x="106" y="106" width="44" height="44" rx="3" />
        </g>
      </svg>
      {withWordmark ? (
        <span
          className="pg-wordmark text-[19px] font-medium tracking-[-0.04em] text-ink lowercase"
          style={{ fontFamily: "'Space Grotesk', 'Inter', 'InterVariable', system-ui, sans-serif" }}
        >
          paygate
        </span>
      ) : null}
    </span>
  );
}
