import { cn } from '~/lib/cn';

interface LogoProps {
  size?: number;
  withWordmark?: boolean;
  className?: string;
}

/**
 * Limen mark — a doorway standing on its threshold.
 * Two posts + lintel describe the doorway; the wider line beneath is the
 * limen itself (the foundation, what we sell). Single-stroke, currentColor.
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
        <g fill="none" stroke="currentColor" strokeLinecap="square" strokeLinejoin="miter">
          <path d="M 72 192 L 72 72 L 184 72 L 184 192" strokeWidth="14" />
          <line x1="52" y1="204" x2="204" y2="204" strokeWidth="18" />
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
