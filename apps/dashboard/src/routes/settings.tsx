import { useState, type FormEvent } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { CreditCard, ExternalLink, Receipt, Unlink } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';
import {
  useBilling,
  useOpenBillingPortal,
  useSetBillingCustomer,
  useUnlinkBillingCustomer,
} from '../hooks/useBilling';
import type { BillingState } from '../lib/schemas';
import { cn } from '../lib/cn';

export const Route = createFileRoute('/settings')({
  component: SettingsRoute,
});

function SettingsRoute() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Wallets, billing, rate limits, secrets. Danger zone at the bottom."
      />

      <BillingSection />

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
        <p className="text-sm text-ink-500">
          Add scopes for wallet, ip, endpoint, or global. Token-bucket semantics.
        </p>
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

function BillingSection() {
  const billing = useBilling();
  const setCustomer = useSetBillingCustomer();
  const unlink = useUnlinkBillingCustomer();
  const portal = useOpenBillingPortal();
  const toast = useToast();
  const [editing, setEditing] = useState(false);

  if (billing.isLoading) {
    return (
      <SectionShell>
        <p className="text-sm text-ink-500">Loading billing…</p>
      </SectionShell>
    );
  }

  if (billing.error) {
    return (
      <SectionShell>
        <p className="text-sm text-state-danger">
          Could not load billing state — {billing.error.message}
        </p>
      </SectionShell>
    );
  }

  const data = billing.data;
  if (!data) return null;

  const onAttach = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const stripeCustomerId = String(form.get('stripe_customer_id') ?? '').trim();
    if (stripeCustomerId.length === 0) {
      toast.push({ kind: 'error', title: 'Stripe customer id required (cus_…)' });
      return;
    }
    setCustomer.mutate(
      { stripe_customer_id: stripeCustomerId },
      {
        onSuccess: () => {
          toast.push({ kind: 'success', title: 'Customer linked' });
          setEditing(false);
        },
        onError: (err) =>
          toast.push({
            kind: 'error',
            title: 'Failed to link customer',
            description: err.message,
          }),
      },
    );
  };

  const onMint = () => {
    setCustomer.mutate(
      {},
      {
        onSuccess: (resp) => {
          toast.push({
            kind: 'success',
            title: 'Stripe customer created',
            description: resp.stripe_customer_id,
          });
        },
        onError: (err) =>
          toast.push({ kind: 'error', title: 'Could not mint customer', description: err.message }),
      },
    );
  };

  const onUnlink = () => {
    if (!window.confirm('Unlink Stripe customer? Settled transactions will stop emitting meter events.')) {
      return;
    }
    unlink.mutate(undefined, {
      onSuccess: () => toast.push({ kind: 'success', title: 'Customer unlinked' }),
      onError: (err) =>
        toast.push({ kind: 'error', title: 'Failed to unlink', description: err.message }),
    });
  };

  const onOpenPortal = () => {
    portal.mutate(undefined, {
      onSuccess: ({ url }) => window.open(url, '_blank', 'noopener'),
      onError: (err) =>
        toast.push({ kind: 'error', title: 'Could not open portal', description: err.message }),
    });
  };

  return (
    <SectionShell>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium uppercase tracking-widest text-ink-500">Billing</h3>
          <p className="mt-1 text-sm text-ink-500">
            Settled x402 transactions are reported to Stripe Billing as metered
            usage. Configure pricing on your Stripe dashboard.
          </p>
        </div>
        <BillingStatusBadge status={data.billing_status} enabled={data.enabled} />
      </div>

      {!data.enabled ? (
        <div className="mt-5 rounded-lg border border-amber-300/60 bg-amber-50/50 p-4 text-sm text-amber-900 dark:border-amber-700/40 dark:bg-amber-900/10 dark:text-amber-200">
          Stripe billing is not enabled on this deployment. Set
          <code className="mx-1 rounded bg-amber-100/70 px-1 py-0.5 font-mono text-xs dark:bg-amber-900/30">
            STRIPE_BILLING_ENABLED=true
          </code>
          on the API and provide a secret key to start metering.
        </div>
      ) : null}

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <PeriodCard
          label="Settled transactions (current period)"
          primary={data.current_period.settled_count.toLocaleString()}
          secondary={periodLabel(data)}
        />
        <PeriodCard
          label="Settled volume"
          primary={formatUsdcMicros(data.current_period.settled_volume_usdc_micros)}
          secondary="USDC"
        />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-ink-200/50 pt-5 dark:border-ink-800/40">
        <span className="text-xs uppercase tracking-widest text-ink-500">Stripe customer</span>
        {data.stripe_customer_id ? (
          <code className="rounded bg-ink-100/60 px-2 py-1 font-mono text-xs text-ink-700 dark:bg-ink-800/60 dark:text-ink-200">
            {data.stripe_customer_id}
          </code>
        ) : (
          <span className="text-xs text-ink-500">— none linked —</span>
        )}

        {data.stripe_customer_id ? (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              icon={<ExternalLink className="h-4 w-4" />}
              onClick={onOpenPortal}
              loading={portal.isPending}
              disabled={!data.enabled}
            >
              Manage billing
            </Button>
            <button
              type="button"
              onClick={onUnlink}
              disabled={unlink.isPending}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-state-danger hover:bg-state-danger/10 disabled:opacity-50"
            >
              <Unlink className="h-3.5 w-3.5" />
              Unlink
            </button>
          </div>
        ) : (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              icon={<CreditCard className="h-4 w-4" />}
              onClick={() => setEditing((e) => !e)}
            >
              Attach existing
            </Button>
            <Button
              variant="primary"
              icon={<Receipt className="h-4 w-4" />}
              onClick={onMint}
              loading={setCustomer.isPending && !editing}
              disabled={!data.enabled}
            >
              Create Stripe customer
            </Button>
          </div>
        )}
      </div>

      {editing && !data.stripe_customer_id ? (
        <form
          onSubmit={onAttach}
          className="mt-4 grid gap-3 rounded-lg border border-ink-200/70 bg-canvas p-4 dark:border-ink-800/60 dark:bg-ink-950/40 md:grid-cols-[1fr_auto]"
        >
          <input
            name="stripe_customer_id"
            placeholder="cus_…"
            pattern="^cus_[A-Za-z0-9]+$"
            required
            className="rounded-md border border-ink-200 bg-canvas px-3 py-2 font-mono text-sm focus:border-cobalt-500 focus:outline-none focus:ring-2 focus:ring-cobalt-500/20 dark:border-ink-700 dark:bg-ink-900"
          />
          <Button type="submit" variant="primary" loading={setCustomer.isPending}>
            Link
          </Button>
        </form>
      ) : null}
    </SectionShell>
  );
}

function SectionShell({ children }: { children: React.ReactNode }) {
  return (
    <section className="mb-10 rounded-xl border border-ink-200 bg-cloud p-6 dark:border-ink-800 dark:bg-ink-900">
      {children}
    </section>
  );
}

function BillingStatusBadge({
  status,
  enabled,
}: {
  status: BillingState['billing_status'];
  enabled: boolean;
}) {
  if (!enabled) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-50 px-2.5 py-1 text-xs font-medium uppercase tracking-widest text-amber-900 dark:border-amber-700/40 dark:bg-amber-900/20 dark:text-amber-200">
        Disabled
      </span>
    );
  }
  const tone =
    status === 'active' || status === 'trialing'
      ? 'border-emerald-400/40 bg-emerald-50 text-emerald-900 dark:border-emerald-700/40 dark:bg-emerald-900/20 dark:text-emerald-200'
      : status === 'past_due' || status === 'unpaid'
        ? 'border-rose-400/40 bg-rose-50 text-rose-900 dark:border-rose-700/40 dark:bg-rose-900/20 dark:text-rose-200'
        : status === 'canceled'
          ? 'border-ink-300/40 bg-ink-100 text-ink-700 dark:border-ink-700/40 dark:bg-ink-800/40 dark:text-ink-300'
          : 'border-ink-200/60 bg-ink-50 text-ink-700 dark:border-ink-800/40 dark:bg-ink-900/40 dark:text-ink-300';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium uppercase tracking-widest',
        tone,
      )}
    >
      {status}
    </span>
  );
}

function PeriodCard({
  label,
  primary,
  secondary,
}: {
  label: string;
  primary: string;
  secondary: string;
}) {
  return (
    <div className="rounded-lg border border-ink-200/60 bg-canvas p-4 dark:border-ink-800/60 dark:bg-ink-950/30">
      <div className="text-xs uppercase tracking-widest text-ink-500">{label}</div>
      <div className="mt-2 font-mono text-2xl font-semibold tracking-tight text-ink-900 dark:text-ink-100">
        {primary}
      </div>
      <div className="mt-1 text-xs text-ink-500">{secondary}</div>
    </div>
  );
}

function periodLabel(b: BillingState): string {
  if (b.billing_period_start && b.billing_period_end) {
    const fmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
    return `${fmt.format(new Date(b.billing_period_start))} — ${fmt.format(new Date(b.billing_period_end))}`;
  }
  return 'Last 30 days (no Stripe period yet)';
}

function formatUsdcMicros(micros: string): string {
  // USDC is 6-decimal; meter values are stored as string-of-micros to
  // preserve precision past JS Number safe-integer range.
  if (!/^\d+$/.test(micros)) return '—';
  const padded = micros.padStart(7, '0');
  const whole = padded.slice(0, padded.length - 6).replace(/^0+(?=\d)/, '') || '0';
  const frac = padded.slice(-6).replace(/0+$/, '');
  return frac.length > 0 ? `${whole}.${frac.slice(0, 2)}` : whole;
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
