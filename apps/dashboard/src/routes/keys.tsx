import { useState, type FormEvent } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Copy, KeyRound, ShieldOff, X } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';
import { useApiKeys, useCreateApiKey, useRevokeApiKey } from '../hooks/useApiKeys';
import type { ApiKey, ApiKeyCreated } from '../lib/schemas';

export const Route = createFileRoute('/keys')({
  component: KeysRoute,
});

function KeysRoute() {
  const list = useApiKeys();
  const create = useCreateApiKey();
  const revoke = useRevokeApiKey();
  const toast = useToast();

  const [showCreate, setShowCreate] = useState(false);
  const [issued, setIssued] = useState<ApiKeyCreated | null>(null);

  const items = list.data ?? [];

  const onCreate = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const name = String(data.get('name') ?? '').trim();
    const role = String(data.get('role') ?? 'admin') as ApiKey['role'];
    if (name.length === 0) {
      toast.push({ kind: 'error', title: 'Name is required' });
      return;
    }
    create.mutate(
      { name, role },
      {
        onSuccess: (data) => {
          setIssued(data);
          setShowCreate(false);
          toast.push({
            kind: 'success',
            title: 'API key created',
            description: 'Copy the secret now — it will not be shown again.',
          });
        },
        onError: (err) => {
          toast.push({
            kind: 'error',
            title: 'Failed to create key',
            description: err instanceof Error ? err.message : 'unknown error',
          });
        },
      },
    );
  };

  const onRevoke = (key: ApiKey) => {
    if (key.revoked_at !== null) return;
    if (!window.confirm(`Revoke "${key.name}"? Requests using this key will fail immediately.`)) {
      return;
    }
    revoke.mutate(key.id, {
      onSuccess: () => toast.push({ kind: 'success', title: 'Key revoked' }),
      onError: (err) =>
        toast.push({
          kind: 'error',
          title: 'Failed to revoke',
          description: err instanceof Error ? err.message : 'unknown error',
        }),
    });
  };

  return (
    <>
      <PageHeader
        title="API Keys"
        description="Server-to-server credentials for the admin API. Each key gets its own rate-limit bucket."
        actions={
          <Button variant="primary" icon={<KeyRound className="h-4 w-4" />} onClick={() => setShowCreate(true)}>
            Create key
          </Button>
        }
      />

      <div className="overflow-hidden rounded-xl border border-ink-200/80 bg-cloud dark:border-ink-800/80 dark:bg-ink-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-ink-200/80 bg-paper text-xs uppercase tracking-widest text-ink-500 dark:border-ink-800/80 dark:bg-ink-900/60">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Token</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Last used</th>
              <th className="px-4 py-3 font-medium">Created</th>
              <th className="px-4 py-3 font-medium" aria-label="actions" />
            </tr>
          </thead>
          <tbody>
            {items.map((k) => {
              const revoked = k.revoked_at !== null;
              return (
                <tr
                  key={k.id}
                  className="border-b border-ink-200/40 last:border-b-0 hover:bg-cobalt-50/30 dark:border-ink-800/40 dark:hover:bg-cobalt-900/10"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{k.name}</span>
                      {revoked ? (
                        <span className="rounded bg-state-danger/10 px-1.5 py-0.5 text-[10px] uppercase tracking-widest text-state-danger">
                          revoked
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <code className="text-xs text-ink-600 dark:text-ink-300">{k.masked}</code>
                  </td>
                  <td className="px-4 py-3 text-ink-600 dark:text-ink-300">{k.role}</td>
                  <td className="px-4 py-3 text-ink-500">
                    {k.last_used_at ? formatRelative(k.last_used_at) : '—'}
                  </td>
                  <td className="px-4 py-3 text-ink-500">{formatRelative(k.created_at)}</td>
                  <td className="px-4 py-3 text-right">
                    {!revoked ? (
                      <button
                        type="button"
                        onClick={() => onRevoke(k)}
                        disabled={revoke.isPending}
                        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-state-danger hover:bg-state-danger/10 disabled:opacity-50"
                        aria-label={`Revoke ${k.name}`}
                      >
                        <ShieldOff className="h-3.5 w-3.5" />
                        Revoke
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}

            {!list.isLoading && items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-ink-500">
                  No API keys yet. Create one to authenticate server-to-server requests.
                </td>
              </tr>
            ) : null}

            {list.isLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-ink-500">
                  Loading keys…
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {showCreate ? (
        <Modal title="Create API key" onClose={() => setShowCreate(false)}>
          <form onSubmit={onCreate} className="grid gap-4">
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">Name</span>
              <input
                name="name"
                required
                maxLength={80}
                placeholder="prod-billing-worker"
                className="rounded-md border border-ink-200 bg-canvas px-3 py-2 text-sm focus:border-cobalt-500 focus:outline-none focus:ring-2 focus:ring-cobalt-500/20 dark:border-ink-700 dark:bg-ink-900"
              />
              <span className="text-xs text-ink-500">A label only you will see; helps you find this key in audit logs.</span>
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">Role</span>
              <select
                name="role"
                defaultValue="admin"
                className="rounded-md border border-ink-200 bg-canvas px-3 py-2 text-sm focus:border-cobalt-500 focus:outline-none focus:ring-2 focus:ring-cobalt-500/20 dark:border-ink-700 dark:bg-ink-900"
              >
                <option value="viewer">viewer (read-only)</option>
                <option value="admin">admin (read/write)</option>
                <option value="owner">owner (full control)</option>
              </select>
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={create.isPending}>
                Create
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {issued ? (
        <Modal title="Save your API key" onClose={() => setIssued(null)}>
          <div className="grid gap-4">
            <p className="text-sm text-ink-600 dark:text-ink-300">
              This is the <strong>only</strong> time you can copy the full secret. Store it
              somewhere safe (1Password, Vault, your CI provider) — there is no recovery
              path.
            </p>
            <div className="flex items-center gap-2 rounded-lg border border-cobalt-500/40 bg-cobalt-50 p-3 font-mono text-xs dark:bg-cobalt-900/30">
              <code className="flex-1 break-all">{issued.secret}</code>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(issued.secret);
                  toast.push({ kind: 'success', title: 'Copied to clipboard' });
                }}
                className="inline-flex items-center gap-1.5 rounded-md bg-cobalt-600 px-2.5 py-1.5 text-xs text-white hover:bg-cobalt-700"
              >
                <Copy className="h-3.5 w-3.5" />
                Copy
              </button>
            </div>
            <div className="flex justify-end">
              <Button variant="primary" onClick={() => setIssued(null)}>
                I've saved it
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-md rounded-xl border border-ink-200 bg-canvas p-6 shadow-xl dark:border-ink-700 dark:bg-ink-900"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-ink-500 hover:bg-paper hover:text-ink-700 dark:hover:bg-ink-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}
