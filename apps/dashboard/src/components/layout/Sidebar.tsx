import { Link, useRouterState } from '@tanstack/react-router';
import { Logo } from '../ui/Logo';
import { cn } from '../../lib/cn';

const NAV: Array<{ label: string; to: string }> = [
  { label: 'Overview', to: '/' },
  { label: 'Transactions', to: '/transactions' },
  { label: 'Endpoints', to: '/endpoints' },
  { label: 'Agents', to: '/agents' },
  { label: 'Compliance', to: '/compliance' },
  { label: 'Webhooks', to: '/webhooks' },
  { label: 'Directory', to: '/directory' },
  { label: 'Settings', to: '/settings' },
];

export function Sidebar() {
  const { location } = useRouterState();
  return (
    <aside className="sticky top-0 hidden h-screen w-60 flex-col gap-4 border-r border-ink-200/60 bg-cloud px-5 py-6 dark:border-ink-800/60 dark:bg-ink-900 lg:flex">
      <Link to="/" className="flex items-center gap-3 font-semibold tracking-tight">
        <Logo className="h-9 w-9" />
        <span className="text-lg">paygate</span>
      </Link>

      <nav className="flex flex-col gap-1 pt-4">
        {NAV.map((item) => {
          const active = location.pathname === item.to ||
            (item.to !== '/' && location.pathname.startsWith(item.to));
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                'rounded-lg px-3 py-2 text-sm transition-colors',
                'hover:bg-indigo-50 hover:text-indigo-700',
                'dark:hover:bg-indigo-900/30 dark:hover:text-indigo-200',
                active
                  ? 'bg-indigo-600 text-white shadow-[0_0_0_1px_rgb(79_70_229)] hover:bg-indigo-600 hover:text-white dark:hover:bg-indigo-600 dark:hover:text-white'
                  : 'text-ink-700 dark:text-ink-300',
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto pt-6 text-[11px] text-ink-500">v0.1.0 · self-hosted</div>
    </aside>
  );
}
