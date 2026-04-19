/**
 * Tests for the Stripe webhook receiver.
 *
 * Pure unit cases (no DB):
 *   - Disabled deployment returns 503 (no signature work attempted).
 *   - Missing or invalid signature returns 400 without writing.
 *
 * Integration cases (require LIMEN_DATABASE_URL + applied migrations):
 *   - A correctly-signed customer.subscription.updated event flips
 *     projects.billing_status by stripe_customer_id.
 *   - A signed event for an unknown customer 200s with handled=false
 *     instead of looping retries forever.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import Stripe from 'stripe';
import { stripeWebhookRoutes } from './stripe-webhook.js';
import { closeDb, getDb } from '../db/index.js';
import { projects, stripeProcessedEvents } from '../db/schema.js';
import { resetEnvCache } from '../config/env.js';
import { resetStripeClientCache } from '../lib/stripe.js';

const HAS_DB =
  typeof process.env.LIMEN_DATABASE_URL === 'string' &&
  process.env.LIMEN_DATABASE_URL.length > 0;

const WEBHOOK_SECRET = 'whsec_test_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const PROJECT_ID = '00000000-0000-0000-0000-000000000bbb';
const STRIPE_CUSTOMER_ID = 'cus_billing_test_1';

function setEnv(patch: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  resetEnvCache();
  resetStripeClientCache();
}

function makeApp() {
  return new Hono().route('/_limen/v1/stripe/webhook', stripeWebhookRoutes);
}

beforeEach(() => {
  setEnv({
    LIMEN_DATABASE_URL: process.env.LIMEN_DATABASE_URL ?? 'postgres://x:y@localhost/x',
    LIMEN_REDIS_URL: process.env.LIMEN_REDIS_URL ?? 'redis://localhost:6379',
    LIMEN_JWT_SECRET: 'a'.repeat(48),
    LIMEN_WEBHOOK_SIGNING_SECRET: 'b'.repeat(48),
    STRIPE_BILLING_ENABLED: 'false',
    STRIPE_SECRET_KEY: undefined,
    STRIPE_WEBHOOK_SECRET: undefined,
  });
});

describe('stripe-webhook — disabled deployment', () => {
  it('returns 503 without touching headers when STRIPE_BILLING_ENABLED is false', async () => {
    const app = makeApp();
    const res = await app.request('/_limen/v1/stripe/webhook', {
      method: 'POST',
      body: '{}',
    });
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('stripe_disabled');
  });
});

describe('stripe-webhook — signature handling', () => {
  beforeEach(() => {
    setEnv({
      STRIPE_BILLING_ENABLED: 'true',
      STRIPE_SECRET_KEY: 'sk_test_dummy_for_signature_only',
      STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
    });
  });

  it('rejects with 400 when stripe-signature header is missing', async () => {
    const app = makeApp();
    const res = await app.request('/_limen/v1/stripe/webhook', {
      method: 'POST',
      body: '{}',
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('missing_signature');
  });

  it('rejects with 400 when signature is forged / wrong secret', async () => {
    const app = makeApp();
    const res = await app.request('/_limen/v1/stripe/webhook', {
      method: 'POST',
      headers: { 'stripe-signature': 't=1700000000,v1=deadbeef' },
      body: '{"id":"evt_test"}',
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('invalid_signature');
  });
});

describe.skipIf(!HAS_DB)('stripe-webhook — DB updates (integration)', () => {
  // Event IDs used by this suite — cleaned out of the dedup ledger before
  // each test so the replay-protection check doesn't false-positive on
  // a re-run.
  const TEST_EVENT_IDS = [
    'evt_sub_updated_1',
    'evt_invoice_failed_1',
    'evt_unknown_cus',
    'evt_random',
  ];

  // The outer `beforeEach` in this file resets STRIPE_BILLING_ENABLED to
  // 'false' for the disabled-deployment test.  Re-enable it for every
  // integration test (Vitest runs the inner beforeEach AFTER the outer).
  beforeEach(async () => {
    setEnv({
      STRIPE_BILLING_ENABLED: 'true',
      STRIPE_SECRET_KEY: 'sk_test_dummy_for_signature_only',
      STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
    });
    const db = getDb();
    await db
      .delete(stripeProcessedEvents)
      .where(inArray(stripeProcessedEvents.eventId, TEST_EVENT_IDS));
  });

  beforeAll(async () => {
    setEnv({
      STRIPE_BILLING_ENABLED: 'true',
      STRIPE_SECRET_KEY: 'sk_test_dummy_for_signature_only',
      STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
    });

    const db = getDb();
    await db
      .insert(projects)
      .values({
        id: PROJECT_ID,
        slug: `test-billing-${PROJECT_ID.slice(0, 8)}`,
        name: 'Billing Webhook Test Project',
        ownerWallet: '0x0000000000000000000000000000000000000000',
        stripeCustomerId: STRIPE_CUSTOMER_ID,
      })
      .onConflictDoUpdate({
        target: projects.id,
        set: { stripeCustomerId: STRIPE_CUSTOMER_ID, billingStatus: 'inactive' },
      });
  });

  afterAll(async () => {
    const db = getDb();
    await db.delete(projects).where(eq(projects.id, PROJECT_ID));
    await db
      .delete(stripeProcessedEvents)
      .where(inArray(stripeProcessedEvents.eventId, TEST_EVENT_IDS));
    await closeDb();
  });

  afterEach(async () => {
    const db = getDb();
    await db
      .update(projects)
      .set({ billingStatus: 'inactive', stripeSubscriptionId: null })
      .where(eq(projects.id, PROJECT_ID));
  });

  function signed(eventBody: object): { body: string; headers: Record<string, string> } {
    const body = JSON.stringify(eventBody);
    const header = Stripe.webhooks.generateTestHeaderString({
      payload: body,
      secret: WEBHOOK_SECRET,
    });
    return { body, headers: { 'stripe-signature': header } };
  }

  it('flips billing_status to "active" on a signed customer.subscription.updated event', async () => {
    const app = makeApp();
    const { body, headers } = signed({
      id: 'evt_sub_updated_1',
      object: 'event',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_test_1',
          object: 'subscription',
          status: 'active',
          customer: STRIPE_CUSTOMER_ID,
          current_period_start: 1700000000,
          current_period_end: 1702592000,
          items: { data: [] },
        },
      },
    });
    const res = await app.request('/_limen/v1/stripe/webhook', {
      method: 'POST',
      headers,
      body,
    });
    expect(res.status).toBe(200);
    const ack = (await res.json()) as { handled: boolean };
    expect(ack.handled).toBe(true);

    const db = getDb();
    const rows = await db
      .select({
        billingStatus: projects.billingStatus,
        stripeSubscriptionId: projects.stripeSubscriptionId,
      })
      .from(projects)
      .where(eq(projects.id, PROJECT_ID))
      .limit(1);
    expect(rows[0]?.billingStatus).toBe('active');
    expect(rows[0]?.stripeSubscriptionId).toBe('sub_test_1');
  });

  it('flips billing_status to "past_due" on invoice.payment_failed', async () => {
    const app = makeApp();
    const { body, headers } = signed({
      id: 'evt_invoice_failed_1',
      object: 'event',
      type: 'invoice.payment_failed',
      data: {
        object: {
          id: 'in_test_1',
          object: 'invoice',
          customer: STRIPE_CUSTOMER_ID,
        },
      },
    });
    const res = await app.request('/_limen/v1/stripe/webhook', {
      method: 'POST',
      headers,
      body,
    });
    expect(res.status).toBe(200);

    const db = getDb();
    const rows = await db
      .select({ billingStatus: projects.billingStatus })
      .from(projects)
      .where(eq(projects.id, PROJECT_ID))
      .limit(1);
    expect(rows[0]?.billingStatus).toBe('past_due');
  });

  it('200s with handled=false when the customer maps to no project (no infinite retry)', async () => {
    const app = makeApp();
    const { body, headers } = signed({
      id: 'evt_unknown_cus',
      object: 'event',
      type: 'invoice.paid',
      data: {
        object: {
          id: 'in_test_unknown',
          object: 'invoice',
          customer: 'cus_does_not_exist_xyz',
        },
      },
    });
    const res = await app.request('/_limen/v1/stripe/webhook', {
      method: 'POST',
      headers,
      body,
    });
    expect(res.status).toBe(200);
    const ack = (await res.json()) as { handled: boolean };
    expect(ack.handled).toBe(false);
  });

  it('rejects a re-delivered event (replay protection)', async () => {
    const app = makeApp();
    const event = {
      id: 'evt_sub_updated_1',
      object: 'event',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_replay_test',
          object: 'subscription',
          status: 'active',
          customer: STRIPE_CUSTOMER_ID,
          current_period_start: 1700000000,
          current_period_end: 1702592000,
          items: { data: [] },
        },
      },
    };
    const { body, headers } = signed(event);

    // First delivery succeeds + applies.
    const first = await app.request('/_limen/v1/stripe/webhook', {
      method: 'POST',
      headers,
      body,
    });
    expect(first.status).toBe(200);
    const firstAck = (await first.json()) as { handled: boolean; replay?: boolean };
    expect(firstAck.handled).toBe(true);
    expect(firstAck.replay).toBeUndefined();

    // Flip the project's status manually so we can prove the replay
    // does NOT roll it back.
    const db = getDb();
    await db
      .update(projects)
      .set({ billingStatus: 'past_due' })
      .where(eq(projects.id, PROJECT_ID));

    // Replay the same signed event — handler must NOT touch the DB.
    const second = await app.request('/_limen/v1/stripe/webhook', {
      method: 'POST',
      headers,
      body,
    });
    expect(second.status).toBe(200);
    const secondAck = (await second.json()) as { handled: boolean; replay?: boolean };
    expect(secondAck.handled).toBe(false);
    expect(secondAck.replay).toBe(true);

    const after = await db
      .select({ billingStatus: projects.billingStatus })
      .from(projects)
      .where(eq(projects.id, PROJECT_ID))
      .limit(1);
    expect(after[0]?.billingStatus).toBe('past_due');
  });

  it('acks (200) and skips DB write for unhandled event types', async () => {
    const app = makeApp();
    const { body, headers } = signed({
      id: 'evt_random',
      object: 'event',
      type: 'charge.succeeded',
      data: { object: { id: 'ch_x', object: 'charge', customer: STRIPE_CUSTOMER_ID } },
    });
    const res = await app.request('/_limen/v1/stripe/webhook', {
      method: 'POST',
      headers,
      body,
    });
    expect(res.status).toBe(200);
    const ack = (await res.json()) as { handled: boolean };
    expect(ack.handled).toBe(false);
  });
});
