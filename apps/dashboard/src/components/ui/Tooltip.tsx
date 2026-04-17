import { useState, type ReactNode, type ReactElement, useId } from 'react';
import { cn } from '~/lib/cn';

interface TooltipProps {
  label: ReactNode;
  children: ReactElement;
  side?: 'top' | 'bottom' | 'left' | 'right';
}

const SIDE: Record<NonNullable<TooltipProps['side']>, string> = {
  top: '-top-1.5 left-1/2 -translate-x-1/2 -translate-y-full',
  bottom: '-bottom-1.5 left-1/2 -translate-x-1/2 translate-y-full',
  left: 'top-1/2 -left-1.5 -translate-x-full -translate-y-1/2',
  right: 'top-1/2 -right-1.5 translate-x-full -translate-y-1/2',
};

export function Tooltip({ label, children, side = 'top' }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className="relative inline-flex">
      <span
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        aria-describedby={open ? id : undefined}
      >
        {children}
      </span>
      {open ? (
        <span
          id={id}
          role="tooltip"
          className={cn(
            'absolute z-40 whitespace-nowrap text-[11px] font-medium',
            'px-2 py-1 rounded-md pointer-events-none',
            'bg-ink text-canvas shadow-lg',
            'dark:bg-canvas-raised dark:text-ink dark:border dark:border-white/10',
            SIDE[side],
          )}
        >
          {label}
        </span>
      ) : null}
    </span>
  );
}
