import { useTheme } from '../../hooks/useTheme';
import { StatusDot } from '../status/StatusDot';

export function TopBar() {
  const { mode, toggle } = useTheme();
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-ink-200/60 bg-cloud/70 px-8 py-3 backdrop-blur dark:border-ink-800/60 dark:bg-ink-900/70">
      <div className="flex items-center gap-3 text-sm text-ink-500">
        <StatusDot status="ok" withLabel={false} />
        <span className="font-medium text-ink-700 dark:text-ink-200">production</span>
        <span className="text-ink-400">·</span>
        <span>{import.meta.env.VITE_API_URL ?? 'http://localhost:4020'}</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggle}
          className="rounded-md border border-ink-200 px-3 py-1.5 text-xs text-ink-600 transition-colors hover:bg-cobalt-50 hover:text-cobalt-700 dark:border-ink-700 dark:text-ink-300 dark:hover:bg-cobalt-900/30 dark:hover:text-cobalt-200"
        >
          {mode}
        </button>
      </div>
    </header>
  );
}
