import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { CheckCircle2, CircleAlert, Info, X } from 'lucide-react';
import { cn } from '~/lib/cn';

type ToastKind = 'success' | 'error' | 'info';

interface Toast {
  id: string;
  title: string;
  description?: string;
  kind: ToastKind;
}

interface ToastCtx {
  push(toast: Omit<Toast, 'id'>): void;
}

const Ctx = createContext<ToastCtx | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { ...t, id }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== id));
    }, 4000);
  }, []);

  const ctx = useMemo<ToastCtx>(() => ({ push }), [push]);

  return (
    <Ctx.Provider value={ctx}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={(id) => setToasts((p) => p.filter((x) => x.id !== id))} />
    </Ctx.Provider>
  );
}

export function useToast(): ToastCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-[min(360px,calc(100vw-2rem))]"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  useEffect(() => {
    /* handled in provider */
  }, []);
  const Icon =
    toast.kind === 'success' ? CheckCircle2 : toast.kind === 'error' ? CircleAlert : Info;
  const tone =
    toast.kind === 'success'
      ? 'text-state-success'
      : toast.kind === 'error'
        ? 'text-state-danger'
        : 'text-indigo-500';
  return (
    <div
      className={cn(
        'flex items-start gap-3 p-3.5 rounded-lg',
        'bg-canvas-raised border border-ink/10 dark:border-white/10 shadow-lg',
        'animate-slide-in',
      )}
    >
      <Icon className={cn('size-4 mt-0.5 shrink-0', tone)} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-ink">{toast.title}</div>
        {toast.description ? (
          <div className="mt-0.5 text-xs text-ink-muted">{toast.description}</div>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="shrink-0 p-1 text-ink-soft hover:text-ink rounded-md"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
