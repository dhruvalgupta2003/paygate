import { createFileRoute } from '@tanstack/react-router';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';

export const Route = createFileRoute('/webhooks')({
  component: WebhooksRoute,
});

function WebhooksRoute() {
  return (
    <>
      <PageHeader
        title="Webhooks"
        description="HMAC-signed events for every settlement, refund, and compliance block."
        actions={<Button variant="primary">Add subscription</Button>}
      />
      <div className="rounded-xl border border-dashed border-ink-300 bg-cloud p-12 text-center text-sm text-ink-500 dark:border-ink-700 dark:bg-ink-900">
        No subscriptions yet. Add one to receive <code>payment.settled</code>, <code>payment.reorged</code>, and <code>compliance.blocked</code> events.
      </div>
    </>
  );
}
