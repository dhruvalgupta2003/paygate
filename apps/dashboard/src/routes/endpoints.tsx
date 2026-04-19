import { createFileRoute } from '@tanstack/react-router';
import { useEndpoints, useUpdateEndpoint } from '../hooks/useEndpoints';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { SparkLine } from '../components/charts/SparkLine';
import { useToast } from '../components/ui/Toast';
import { formatUsdc } from '../lib/format';

export const Route = createFileRoute('/endpoints')({
  component: EndpointsRoute,
});

function EndpointsRoute() {
  const endpoints = useEndpoints();
  const update = useUpdateEndpoint();
  const toast = useToast();
  const list = endpoints.data ?? [];

  const onToggle = (id: string, next: boolean) => {
    update.mutate(
      { id, enabled: next },
      {
        onError: (err) => {
          toast.push({
            kind: 'error',
            title: 'Failed to update endpoint',
            description: err instanceof Error ? err.message : 'unknown error',
          });
        },
        onSuccess: () => {
          toast.push({
            kind: 'success',
            title: next ? 'Endpoint enabled' : 'Endpoint disabled',
          });
        },
      },
    );
  };

  return (
    <>
      <PageHeader
        title="Endpoints"
        description="Configure prices, toggle availability, review 7-day traffic."
        actions={<Button variant="primary">Add endpoint</Button>}
      />

      <div className="grid gap-3">
        {list.map((ep) => (
          <div
            key={ep.id}
            className="flex items-center justify-between rounded-xl border border-ink-200/80 bg-cloud p-4 transition-shadow hover:shadow-[0_0_0_1px_theme(colors.cobalt.500)] dark:border-ink-800/80 dark:bg-ink-900"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <code className="truncate text-sm">{ep.path_glob}</code>
                <span className="rounded bg-cobalt-50 px-1.5 py-0.5 text-[10px] uppercase tracking-widest text-cobalt-700 dark:bg-cobalt-900/40 dark:text-cobalt-300">
                  {ep.method}
                </span>
                {!ep.enabled ? (
                  <span className="rounded bg-ink-200 px-1.5 py-0.5 text-[10px] uppercase tracking-widest text-ink-600 dark:bg-ink-700 dark:text-ink-300">
                    disabled
                  </span>
                ) : null}
              </div>
              <p className="mt-1 truncate text-xs text-ink-500">
                {ep.description ?? '—'}
              </p>
            </div>
            <div className="flex items-center gap-6">
              <SparkLine data={ep.requests_7d} tone="cobalt" className="h-8 w-20" />
              <div className="text-right">
                <div className="text-xs text-ink-500">7d revenue</div>
                <div className="tabular-nums text-sm font-medium">
                  {formatUsdc(ep.revenue_7d_micros)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-ink-500">per call</div>
                <div className="tabular-nums text-sm font-medium">
                  {formatUsdc(ep.price_usdc_micros, { decimals: 4 })}
                </div>
              </div>
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  checked={ep.enabled}
                  disabled={update.isPending}
                  onChange={(e) => onToggle(ep.id, e.target.checked)}
                  aria-label={`${ep.enabled ? 'Disable' : 'Enable'} ${ep.path_glob}`}
                  className="peer sr-only"
                />
                <span className="h-5 w-9 rounded-full bg-ink-300 transition-colors peer-checked:bg-cobalt-600 peer-disabled:opacity-60 dark:bg-ink-700" />
                <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform peer-checked:translate-x-4" />
              </label>
            </div>
          </div>
        ))}

        {endpoints.isLoading ? (
          <div className="rounded-xl border border-dashed border-ink-200 bg-cloud p-12 text-center text-sm text-ink-500 dark:border-ink-700 dark:bg-ink-900">
            Loading endpoints…
          </div>
        ) : null}

        {!endpoints.isLoading && list.length === 0 ? (
          <div className="rounded-xl border border-dashed border-ink-300 bg-cloud p-12 text-center text-sm text-ink-500 dark:border-ink-700 dark:bg-ink-900">
            No endpoints configured yet. Add one or import your{' '}
            <code className="text-xs">limen.config.yml</code>.
          </div>
        ) : null}
      </div>
    </>
  );
}
