import { createFileRoute } from '@tanstack/react-router';
import { useAgents } from '../hooks/useAgents';
import { PageHeader } from '../components/layout/PageHeader';
import { formatWallet, formatUsdc } from '../lib/format';

export const Route = createFileRoute('/agents')({
  component: AgentsRoute,
});

function AgentsRoute() {
  const agents = useAgents();
  return (
    <>
      <PageHeader
        title="Agents"
        description="Per-wallet rollup. Search by address, inspect spending patterns, investigate abuse."
      />
      <div className="overflow-hidden rounded-xl border border-ink-200 bg-cloud dark:border-ink-800 dark:bg-ink-900">
        <table className="w-full text-left text-sm">
          <thead className="bg-ink-50 text-xs uppercase tracking-widest text-ink-500 dark:bg-ink-900/60">
            <tr>
              <th className="px-4 py-3">Wallet</th>
              <th className="px-4 py-3">Chain</th>
              <th className="px-4 py-3 text-right">Lifetime spend</th>
              <th className="px-4 py-3 text-right">Requests</th>
              <th className="px-4 py-3">Most-used endpoint</th>
            </tr>
          </thead>
          <tbody>
            {(agents.data ?? []).map((a) => (
              <tr key={a.wallet} className="border-t border-ink-100 dark:border-ink-800/60">
                <td className="px-4 py-3 font-mono text-xs">
                  {a.label ?? formatWallet(a.wallet)}
                </td>
                <td className="px-4 py-3">{a.chain_preferred}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {formatUsdc(a.spend_usdc_micros)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {a.request_count.toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  <code className="text-xs">
                    {a.top_endpoints[0]?.endpoint ?? '—'}
                  </code>
                </td>
              </tr>
            ))}
            {(agents.data ?? []).length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-16 text-center text-sm text-ink-500">
                  No agent traffic yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
