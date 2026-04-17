import { createFileRoute } from '@tanstack/react-router';
import { PageHeader } from '../components/layout/PageHeader';

export const Route = createFileRoute('/settings')({
  component: SettingsRoute,
});

function SettingsRoute() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Wallets, chains, rate limits, secrets. Danger zone at the bottom."
      />

      <section className="mb-10 rounded-xl border border-ink-200 bg-cloud p-6 dark:border-ink-800 dark:bg-ink-900">
        <h3 className="mb-4 text-sm font-medium uppercase tracking-widest text-ink-500">
          Receiving wallets
        </h3>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Base (EVM)" placeholder="0x..." />
          <Field label="Solana (base58)" placeholder="..." />
        </div>
      </section>

      <section className="mb-10 rounded-xl border border-ink-200 bg-cloud p-6 dark:border-ink-800 dark:bg-ink-900">
        <h3 className="mb-4 text-sm font-medium uppercase tracking-widest text-ink-500">
          Rate limits
        </h3>
        <p className="text-sm text-ink-500">Add scopes for wallet, ip, endpoint, or global. Token-bucket semantics.</p>
      </section>

      <section className="rounded-xl border border-rose-300 bg-rose-50/40 p-6 dark:border-rose-900/60 dark:bg-rose-950/30">
        <h3 className="mb-2 text-sm font-medium uppercase tracking-widest text-rose-700 dark:text-rose-300">
          Danger zone
        </h3>
        <p className="text-sm text-ink-600 dark:text-ink-300">
          Rotating admin keys requires re-authentication. Resetting receipts
          clears your local audit chain — export evidence first.
        </p>
      </section>
    </>
  );
}

function Field({ label, placeholder }: { label: string; placeholder: string }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-widest text-ink-500">{label}</span>
      <input
        type="text"
        placeholder={placeholder}
        className="mt-1 block w-full rounded-lg border border-ink-200 bg-white px-3 py-2 font-mono text-sm dark:border-ink-700 dark:bg-ink-950"
      />
    </label>
  );
}
