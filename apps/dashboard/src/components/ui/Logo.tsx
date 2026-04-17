import { cn } from '~/lib/cn';

interface LogoProps {
  size?: number;
  withWordmark?: boolean;
  className?: string;
}

/**
 * PayGate mark. Always renders from /logo.svg so we retain the canonical asset.
 */
export function Logo({ size = 32, withWordmark = false, className }: LogoProps) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <img
        src="/logo.svg"
        width={size}
        height={size}
        alt="PayGate"
        className="shrink-0 select-none"
        draggable={false}
      />
      {withWordmark ? (
        <span className="pg-display text-[18px] font-semibold tracking-tight text-ink">
          paygate
        </span>
      ) : null}
    </span>
  );
}
