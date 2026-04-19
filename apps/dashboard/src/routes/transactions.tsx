import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useTransactions } from '../hooks/useTransactions';
import { PageHeader } from '../components/layout/PageHeader';
import { formatUsdc, formatWallet, relativeTime } from '../lib/format';
import { Button } from '../components/ui/Button';
import { Drawer } from '../components/ui/Drawer';

export const Route = createFileRoute('/transactions')({
  component: TransactionsRoute,
});

function TransactionsRoute() {
  const [chain, setChain] = useState<'all' | 'base' | 'solana'>('all');
  const [status, setStatus] = useState<'all' | 'settled' | 'refunded' | 'reorged'>('all');
  const [selected, setSelected] = useState<string | null>(null);
  const txs = useTransactions({
    ...(chain !== 'all' ? { chain } : {}),
    ...(status !== 'all' ? { status } : {}),
  });
  const items = txs.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <>
      <PageHeader
        title="Transactions"
        description="Every settled x402 payment. Click a row for the full receipt."
        actions={<Button variant="secondary">Export CSV</Button>}
      />

      <div className="mb-4 flex gap-2 text-sm">
        <select
          className="rounded-md border border-ink-200 bg-cloud px-3 py-1.5 dark:border-ink-700 dark:bg-ink-900"
          value={chain}
          onChange={(e) => setChain(e.target.value as typeof chain)}
        >
          <option value="all">all chains</option>
          <option value="base">base</option>
          <option value="solana">solana</option>
        </select>
        <select
          className="rounded-md border border-ink-200 bg-cloud px-3 py-1.5 dark:border-ink-700 dark:bg-ink-900"
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
        >
          <option value="all">all statuses</option>
          <option value="settled">settled</option>
          <option value="refunded">refunded</option>
          <option value="reorged">reorged</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-xl border border-ink-200 bg-cloud dark:border-ink-800 dark:bg-ink-900">
        <table className="w-full text-left text-sm">
          <thead className="bg-ink-50 text-xs uppercase tracking-widest text-ink-500 dark:bg-ink-900/60">
            <tr>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Chain</th>
              <th className="px-4 py-3">Endpoint</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3">From</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((t) => (
              <tr
                key={t.id}
                onClick={() => setSelected(t.id)}
                className="cursor-pointer border-t border-ink-100 transition-colors hover:bg-indigo-50/50 dark:border-ink-800/60 dark:hover:bg-indigo-900/20"
              >
                <td className="px-4 py-3 text-ink-500">{relativeTime(t.observed_at)}</td>
                <td className="px-4 py-3">{t.chain}</td>
                <td className="px-4 py-3"><code className="text-xs">{t.endpoint}</code></td>
                <td className="px-4 py-3 text-right tabular-nums">{formatUsdc(t.amount_usdc_micros)}</td>
                <td className="px-4 py-3 font-mono text-xs">{formatWallet(t.from_wallet)}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      t.status === 'settled'
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                        : t.status === 'refunded'
                          ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                          : 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'
                    }`}
                  >
                    {t.status}
                  </span>
                </td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-16 text-center text-sm text-ink-500">
                  No transactions yet. Settle your first 402 to populate this view.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <Drawer open={selected !== null} onClose={() => setSelected(null)}>
        <div className="p-6">
          <h3 className="mb-2 text-lg font-semibold">Transaction detail</h3>
          <p className="text-sm text-ink-500">id · {selected}</p>
          <p className="mt-4 text-xs text-ink-400">Full receipt, decoded X-PAYMENT, and block explorer link will populate here once the API is wired.</p>
        </div>
      </Drawer>
    </>
  );
}
