import { useEffect, type ReactNode } from 'react';
import { cn } from '~/lib/cn';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  tone?: 'default' | 'danger';
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  tone = 'default',
}: ModalProps) {
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
      className="fixed inset-0 z-50 grid place-items-center p-4"
    >
      <button
        type="button"
        aria-label="Close dialog"
        onClick={onClose}
        className="absolute inset-0 bg-ink/40 backdrop-blur-[3px]"
      />
      <div
        className={cn(
          'relative w-full max-w-md bg-canvas-raised rounded-xl shadow-2xl',
          'border border-ink/10 dark:border-white/10',
          'animate-slide-in overflow-hidden',
        )}
      >
        {tone === 'danger' ? (
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 h-[2px] bg-state-danger/80"
          />
        ) : null}
        <div className="flex items-start justify-between gap-3 p-5 pb-3">
          <div className="min-w-0">
            {title ? (
              <div className="pg-headline text-base">{title}</div>
            ) : null}
            {description ? (
              <div className="mt-1 text-sm text-ink-muted">{description}</div>
            ) : null}
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="inline-flex size-8 items-center justify-center rounded-md text-ink-muted hover:text-ink hover:bg-paper dark:hover:bg-white/5"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="px-5 pb-4">{children}</div>
        {footer ? (
          <div className="px-5 py-4 border-t border-ink/10 dark:border-white/10 bg-canvas-sunken/60">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
