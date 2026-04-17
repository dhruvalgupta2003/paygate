import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export function BentoGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'grid gap-5',
        'grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 lg:grid-rows-[repeat(3,minmax(0,1fr))]',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function BentoCell({
  children,
  className,
  span = 'md',
}: {
  children: ReactNode;
  className?: string;
  span?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const spanClass = {
    sm: 'lg:col-span-2 lg:row-span-1',
    md: 'lg:col-span-3 lg:row-span-1',
    lg: 'lg:col-span-4 lg:row-span-2',
    xl: 'lg:col-span-6 lg:row-span-1',
  }[span];
  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-2xl border border-ink-200/80 bg-cloud p-6 transition-shadow',
        'hover:shadow-[0_0_0_1px_rgb(99_102_241),0_12px_32px_-16px_rgb(79_70_229/0.25)]',
        'dark:border-ink-800/80 dark:bg-ink-900',
        spanClass,
        className,
      )}
    >
      {children}
    </div>
  );
}
