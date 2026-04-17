import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '~/lib/cn';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
  accent?: boolean;
  tone?: 'default' | 'sunken' | 'inverse';
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { interactive = false, accent = false, tone = 'default', className, children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        'pg-card',
        interactive && 'pg-card--interactive',
        accent && 'pg-accent-top',
        tone === 'sunken' && 'bg-canvas-sunken dark:bg-canvas-sunken',
        tone === 'inverse' &&
          'bg-ink text-canvas border-ink-3 dark:bg-ink-2',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
});

export function CardHeader({
  title,
  description,
  right,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-4 px-5 pt-5 pb-3',
        className,
      )}
    >
      <div className="min-w-0">
        <div className="pg-label text-ink-muted">{title}</div>
        {description ? (
          <div className="mt-1 text-xs text-ink-soft">{description}</div>
        ) : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

export function CardBody({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <div className={cn('px-5 pb-5', className)}>{children}</div>;
}
