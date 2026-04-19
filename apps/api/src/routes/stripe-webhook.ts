import { Hono } from 'hono';
import type Stripe from 'stripe';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { projects, stripeProcessedEvents } from '../db/schema.js';
import { isStripeEnabled, verifyWebhookSignature } from '../lib/stripe.js';
import { getLogger } from '../lib/logger.js';
import { AuditService } from '../services/audit-service.js';

/**
 * Stripe webhook receiver.
 *
 * Mounted on the public app root, NOT under the admin auth-gated group:
 * Stripe authenticates with its own HMAC signature header.  We must read
 * the raw request bytes (no JSON.parse) before passing them to the
 * Stripe SDK's `constructEvent`, otherwise the signature will not match.
 *
 * The handler is intentionally thin and idempotent:
 *   - On signature failure → 400, no DB write.
 *   - On success → update `projects.billing_status` (and subscription id /
 *     period markers when present), return 200.
 *   - Unknown event types → 200 (Stripe documents that ignored events
 *     should still ack with 2xx so the retry queue clears).
 */

const HANDLED_EVENTS = new Set([
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed',
]);

export const stripeWebhookRoutes = new Hono().post('/', async (c) => {
  const log = getLogger();

  if (!isStripeEnabled()) {
    return c.json({ error: 'stripe_disabled', detail: 'Stripe billing is not enabled.' }, 503);
  }

  const signature = c.req.header('stripe-signature');
  if (typeof signature !== 'string' || signature.length === 0) {
    return c.json({ error: 'missing_signature' }, 400);
  }

  const rawBody = await c.req.raw.text();

  let event: Stripe.Event;
  try {
    event = verifyWebhookSignature(rawBody, signature);
  } catch (err) {
    log.warn(
      { err: (err as Error).message },
      'stripe webhook signature verification failed',
    );
    return c.json({ error: 'invalid_signature' }, 400);
  }

  if (!HANDLED_EVENTS.has(event.type)) {
    log.debug({ eventType: event.type, eventId: event.id }, 'stripe webhook event ignored');
    return c.json({ received: true, handled: false });
  }

  // Replay protection.  Stripe retries on 5xx and may legitimately
  // re-deliver events after its own internal blips; without this guard
  // a replayed `subscription.updated` could roll a customer's
  // billing_status backwards.
  const claimed = await claimEventId(event.id, event.type);
  if (!claimed) {
    log.info(
      { eventId: event.id, eventType: event.type },
      'stripe webhook event already processed; replay ignored',
    );
    return c.json({ received: true, handled: false, replay: true });
  }

  try {
    await applyEvent(event);
    return c.json({ received: true, handled: true });
  } catch (err) {
    // Update failures are unusual.  We log and return 500 so Stripe retries.
    // If the event is genuinely un-applyable (project missing for that
    // customer), we log + 200 so we don't pile up retries.
    log.error(
      { err: (err as Error).message, eventType: event.type, eventId: event.id },
      'stripe webhook handler failed',
    );
    if ((err as Error).message === 'project_not_found') {
      return c.json({ received: true, handled: false, detail: 'unknown customer' });
    }
    return c.json({ error: 'apply_failed' }, 500);
  }
});

interface BillingPatch {
  billingStatus?: string;
  stripeSubscriptionId?: string | null;
  billingPeriodStart?: Date | null;
  billingPeriodEnd?: Date | null;
}

async function applyEvent(event: Stripe.Event): Promise<void> {
  const customerId = extractCustomerId(event);
  if (customerId === null) return;

  const patch = patchFromEvent(event);
  if (Object.keys(patch).length === 0) return;

  const db = getDb();
  const result = await db
    .update(projects)
    .set(patch)
    .where(eq(projects.stripeCustomerId, customerId))
    .returning({ id: projects.id });

  if (result.length === 0) {
    throw new Error('project_not_found');
  }

  // Audit-log the billing-state transition so SOC 2 evidence captures
  // who/what flipped a project to active/past_due/canceled and when.
  const projectId = result[0]?.id;
  if (projectId !== undefined) {
    try {
      await new AuditService({ db }).append({
        projectId,
        actor: 'stripe:webhook',
        action: 'billing.event_applied',
        target: customerId,
        meta: {
          stripe_event_id: event.id,
          stripe_event_type: event.type,
          patch: serializePatch(patch),
        },
      });
    } catch (err) {
      // Audit-log failures must never break the webhook handler — Stripe
      // would retry forever on 500 and we'd back-pressure all webhooks.
      getLogger().error(
        { err: (err as Error).message, eventId: event.id },
        'audit append for stripe webhook failed (event still applied)',
      );
    }
  }
}

function serializePatch(patch: BillingPatch): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (patch.billingStatus !== undefined) out.billing_status = patch.billingStatus;
  if (patch.stripeSubscriptionId !== undefined) {
    out.stripe_subscription_id = patch.stripeSubscriptionId;
  }
  if (patch.billingPeriodStart !== undefined) {
    out.billing_period_start = patch.billingPeriodStart?.toISOString() ?? null;
  }
  if (patch.billingPeriodEnd !== undefined) {
    out.billing_period_end = patch.billingPeriodEnd?.toISOString() ?? null;
  }
  return out;
}

/**
 * Atomically claim an event id.  Returns true if this call inserted the
 * row (first time we've seen the id), false if a prior insert beat us
 * (replay or in-flight Stripe retry).  ON CONFLICT DO NOTHING with
 * RETURNING gives us the per-row "did we win" signal in one round-trip.
 */
async function claimEventId(eventId: string, eventType: string): Promise<boolean> {
  const db = getDb();
  const inserted = await db
    .insert(stripeProcessedEvents)
    .values({ eventId, eventType })
    .onConflictDoNothing({ target: stripeProcessedEvents.eventId })
    .returning({ eventId: stripeProcessedEvents.eventId });
  return inserted.length === 1;
}

function extractCustomerId(event: Stripe.Event): string | null {
  const obj = event.data.object as { customer?: string | { id: string } | null };
  const customer = obj.customer;
  if (typeof customer === 'string') return customer;
  if (customer !== null && customer !== undefined && typeof customer === 'object') {
    return customer.id;
  }
  return null;
}

function patchFromEvent(event: Stripe.Event): BillingPatch {
  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription;
      const period = subscriptionPeriod(sub);
      return {
        billingStatus: mapSubscriptionStatus(sub.status),
        stripeSubscriptionId: sub.id,
        billingPeriodStart: period.start,
        billingPeriodEnd: period.end,
      };
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      return {
        billingStatus: 'canceled',
        stripeSubscriptionId: sub.id,
      };
    }
    case 'invoice.paid':
      return { billingStatus: 'active' };
    case 'invoice.payment_failed':
      return { billingStatus: 'past_due' };
    default:
      return {};
  }
}

function mapSubscriptionStatus(status: Stripe.Subscription.Status): string {
  switch (status) {
    case 'active':
    case 'trialing':
    case 'past_due':
    case 'canceled':
    case 'unpaid':
      return status;
    case 'incomplete':
    case 'incomplete_expired':
    case 'paused':
      return 'inactive';
    default:
      return 'inactive';
  }
}

function epochToDate(seconds: number | null | undefined): Date | null {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1000);
}

/**
 * Stripe API versions diverged on where current_period_* live: some versions
 * expose them at the top level of the Subscription, newer ones moved them
 * onto each Subscription Item.  We try the top-level fields first, then
 * fall back to the first item's fields.  Untyped index access keeps us
 * robust across SDK type shifts without forcing a redeploy.
 */
function subscriptionPeriod(sub: Stripe.Subscription): {
  start: Date | null;
  end: Date | null;
} {
  const top = sub as unknown as {
    current_period_start?: number;
    current_period_end?: number;
  };
  if (typeof top.current_period_start === 'number' && typeof top.current_period_end === 'number') {
    return { start: epochToDate(top.current_period_start), end: epochToDate(top.current_period_end) };
  }
  const items = sub.items?.data ?? [];
  const first = items[0] as
    | undefined
    | { current_period_start?: number; current_period_end?: number };
  if (
    first !== undefined &&
    typeof first.current_period_start === 'number' &&
    typeof first.current_period_end === 'number'
  ) {
    return {
      start: epochToDate(first.current_period_start),
      end: epochToDate(first.current_period_end),
    };
  }
  return { start: null, end: null };
}
