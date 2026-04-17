import { createFileRoute } from '@tanstack/react-router';
import { useEndpoints } from '../hooks/useEndpoints';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { SparkLine } from '../components/charts/SparkLine';

export const Route = createFileRoute('/endpoints')({
  component: EndpointsRoute,
});

function EndpointsRoute() {
  const endpoints = useEndpoints();
  return (
    <>
      <PageHeader
        title="Endpoints"
        description="Configure prices, toggle availability, review 7-day traffic."
        actions={<Button variant="primary">Add endpoint</Button>}
      />

      <div className="grid gap-3">
        {(endpoints.data ?? []).map((ep) => (
          <div
            key={ep.id}
            className="flex items-center justify-between rounded-xl border border-ink-200/80 bg-cloud p-4 transition-shadow hover:shadow-[0_0_0_1px_rgb(99_102_241)] dark:border-ink-800/80 dark:bg-ink-900"
          >
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <code className="text-sm">{ep.path}</code>
                <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] uppercase tracking-widest text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                  {ep.method?.join(',') ?? 'ANY'}
                </span>
              </div>
              <p className="mt-1 text-xs text-ink-500">{ep.description ?? '—'}</p>
            </div>
            <div className="flex items-center gap-6">
              <SparkLine
                data={[2, 3, 2, 4, 6, 5, 8]}
                tone="indigo"
                className="h-8 w-20"
              />
              <div className="text-right">
                <div className="text-xs text-ink-500">price</div>
                <div className="tabular-nums text-sm font-medium">{ep.price_usdc} USDC</div>
              </div>
              <label className="relative inline-flex cursor-pointer items-center">
                <input type="checkbox" defaultChecked={ep.enabled} className="peer sr-only" />
                <span className="h-5 w-9 rounded-full bg-ink-300 transition-colors peer-checked:bg-indigo-600 dark:bg-ink-700" />
                <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform peer-checked:translate-x-4" />
              </label>
            </div>
          </div>
        ))}
        {(endpoints.data ?? []).length === 0 ? (
          <div className="rounded-xl border border-dashed border-ink-300 bg-cloud p-12 text-center text-sm text-ink-500 dark:border-ink-700 dark:bg-ink-900">
            No endpoints configured yet. Add one or import your paygate.config.yml.
          </div>
        ) : null}
      </div>
    </>
  );
}
