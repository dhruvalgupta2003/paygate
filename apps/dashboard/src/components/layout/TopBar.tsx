import { useTheme } from '../../hooks/useTheme';
import { StatusDot } from '../status/StatusDot';

export function TopBar() {
  const { theme, cycleTheme } = useTheme();
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-ink-200/60 bg-cloud/70 px-8 py-3 backdrop-blur dark:border-ink-800/60 dark:bg-ink-900/70">
      <div className="flex items-center gap-3 text-sm text-ink-500">
        <StatusDot tone="ok" />
        <span className="font-medium text-ink-700 dark:text-ink-200">production</span>
        <span className="text-ink-400">·</span>
        <span>{import.meta.env.VITE_API_URL ?? 'http://localhost:4020'}</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={cycleTheme}
          className="rounded-md border border-ink-200 px-3 py-1.5 text-xs text-ink-600 transition-colors hover:bg-indigo-50 hover:text-indigo-700 dark:border-ink-700 dark:text-ink-300 dark:hover:bg-indigo-900/30 dark:hover:text-indigo-200"
        >
          {theme}
        </button>
      </div>
    </header>
  );
}
