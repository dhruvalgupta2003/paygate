import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { PageHeader } from '../components/layout/PageHeader';
import { cn } from '../lib/cn';

export const Route = createFileRoute('/compliance')({
  component: ComplianceRoute,
});

type Tab = 'sanctions' | 'geo' | 'audit';

function ComplianceRoute() {
  const [tab, setTab] = useState<Tab>('sanctions');
  return (
    <>
      <PageHeader
        title="Compliance"
        description="Sanctions, geo-blocks, and the hash-chained audit log."
      />
      <div className="mb-4 flex gap-1 border-b border-ink-200 dark:border-ink-800">
        {(['sanctions', 'geo', 'audit'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'border-b-2 px-4 py-2 text-sm capitalize transition-colors',
              tab === t
                ? 'border-indigo-600 text-indigo-700 dark:text-indigo-300'
                : 'border-transparent text-ink-500 hover:text-ink-800 dark:hover:text-ink-200',
            )}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="rounded-xl border border-ink-200 bg-cloud p-6 text-sm text-ink-500 dark:border-ink-800 dark:bg-ink-900">
        {tab === 'audit' ? (
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-medium text-ink-900 dark:text-ink-100">
                Audit log hash chain
              </h3>
              <p>Click verify to re-derive the hash chain for the current slice.</p>
            </div>
            <button className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500">
              Verify chain
            </button>
          </div>
        ) : (
          <p>No events in the current range.</p>
        )}
      </div>
    </>
  );
}
