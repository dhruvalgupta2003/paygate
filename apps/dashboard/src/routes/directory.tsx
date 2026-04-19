import { createFileRoute } from '@tanstack/react-router';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';

export const Route = createFileRoute('/directory')({
  component: DirectoryRoute,
});

function DirectoryRoute() {
  return (
    <>
      <PageHeader
        title="Directory"
        description="Public listing for agents to discover your API."
        actions={<Button variant="primary">Submit listing</Button>}
      />
      <div className="grid gap-5 lg:grid-cols-[2fr_3fr]">
        <div className="rounded-xl border border-ink-200 bg-cloud p-6 dark:border-ink-800 dark:bg-ink-900">
          <h3 className="mb-4 text-sm font-medium uppercase tracking-widest text-ink-500">
            Preview
          </h3>
          <div className="rounded-lg border border-indigo-200 bg-white p-6 dark:border-indigo-900 dark:bg-ink-950">
            <div className="text-xs uppercase tracking-widest text-indigo-600">
              limen · directory
            </div>
            <h4 className="mt-1 text-xl font-semibold">my-api</h4>
            <p className="text-sm text-ink-500">Example Limen-enabled API.</p>
            <div className="mt-3 flex flex-wrap gap-1">
              {['weather', 'analytics'].map((t) => (
                <span
                  key={t}
                  className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-ink-200 bg-cloud p-6 dark:border-ink-800 dark:bg-ink-900">
          <h3 className="mb-4 text-sm font-medium uppercase tracking-widest text-ink-500">
            Listing metadata
          </h3>
          <p className="text-sm text-ink-500">
            Listing edits publish after a wallet-signed challenge. See the
            {' '}
            <a className="underline" href="/docs/guides/list-in-directory.md">
              directory guide
            </a>
            .
          </p>
        </div>
      </div>
    </>
  );
}
