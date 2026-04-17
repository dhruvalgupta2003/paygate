import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '~/lib/cn';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  width?: 'sm' | 'md' | 'lg';
  footer?: ReactNode;
}

const WIDTHS: Record<NonNullable<DrawerProps['width']>, string> = {
  sm: 'w-full sm:max-w-sm',
  md: 'w-full sm:max-w-md lg:max-w-lg',
  lg: 'w-full sm:max-w-xl lg:max-w-2xl',
};

export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  width = 'md',
  footer,
}: DrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={typeof title === 'string' ? title : undefined}
      className="fixed inset-0 z-50 flex justify-end"
    >
      <button
        type="button"
        aria-label="Close drawer"
        onClick={onClose}
        className="absolute inset-0 bg-ink/30 backdrop-blur-[2px] animate-[slide-in_180ms_cubic-bezier(0.16,1,0.3,1)]"
      />
      <div
        className={cn(
          'relative h-full flex flex-col bg-canvas-raised border-l border-ink/10',
          'dark:border-white/10 shadow-[-20px_0_48px_-24px_rgba(11,10,26,0.18)]',
          'animate-[slide-in_260ms_cubic-bezier(0.16,1,0.3,1)]',
          WIDTHS[width],
        )}
      >
        <div className="flex items-start justify-between gap-4 p-5 pg-hairline">
          <div className="min-w-0">
            {title ? (
              <div className="pg-headline text-base text-ink leading-tight">
                {title}
              </div>
            ) : null}
            {description ? (
              <div className="mt-1 text-xs text-ink-muted">{description}</div>
            ) : null}
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className={cn(
              'inline-flex size-8 items-center justify-center rounded-md',
              'text-ink-muted hover:text-ink hover:bg-paper',
              'dark:hover:bg-white/5 transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40',
            )}
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="flex-1 overflow-auto px-5 py-4">{children}</div>
        {footer ? (
          <div className="p-4 border-t border-ink/10 dark:border-white/10 bg-canvas-sunken/50">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
