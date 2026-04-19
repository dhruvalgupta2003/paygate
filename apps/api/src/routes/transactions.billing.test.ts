/**
 * Integration test: settlement → Stripe meter event.
 *
 * Calls the real ingest route (with real DB) and asserts the Stripe meter
 * is fired with the right shape.  The Stripe SDK is replaced by a vi.mock
 * so no network call is made.
 *
 * Skipped without a Postgres URL.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { transactionsRoutes } from './transactions.js';
import { closeDb, getDb } from '../db/index.js';
import { endpoints, projects, transactions } from '../db/schema.js';
import { resetEnvCache } from '../config/env.js';

const HAS_DB =
  typeof process.env.LIMEN_DATABASE_URL === 'string' &&
  process.env.LIMEN_DATABASE_URL.length > 0;

const PROJECT_SLUG = 'billing-meter-test';
const STRIPE_CUSTOMER = 'cus_settlement_meter_test';

// Shape we capture from the wrapper for assertions.
interface MeterCall {
  customerId: string;
  eventName: string;
  value: string;
  identifier: string;
  timestamp?: number;
}

// Module-level spy: tests inspect calls.  Typed so c[0] is the meter input.
const emitMeterEvent = vi.fn<(input: MeterCall) => Promise<void>>(async () => undefined);

vi.mock('../lib/stripe.js', async () => {
  const actual = await vi.importActual<typeof import('../lib/stripe.js')>('../lib/stripe.js');
  return {
    ...actual,
    emitMeterEvent: (input: MeterCall) => emitMeterEvent(input),
  };
});

function setEnv(patch: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  resetEnvCache();
}

describe.skipIf(!HAS_DB)('transactions ingest → Stripe meter', () => {
  let projectId: string;

  beforeAll(async () => {
    setEnv({
      // Required envs — kept here so the test is hermetic when invoked
      // outside the dev shell (CI, turbo).  The describe.skipIf already
      // gates on LIMEN_DATABASE_URL.
      LIMEN_REDIS_URL: process.env.LIMEN_REDIS_URL ?? 'redis://localhost:6379',
      LIMEN_JWT_SECRET: process.env.LIMEN_JWT_SECRET ?? 'a'.repeat(48),
      LIMEN_WEBHOOK_SIGNING_SECRET: process.env.LIMEN_WEBHOOK_SIGNING_SECRET ?? 'b'.repeat(48),
      LIMEN_API_INGEST_TOKEN: 'integration-test-ingest-token',
      // The wrapper is mocked, so STRIPE_BILLING_ENABLED only matters
      // for the no-customer path test below.
      STRIPE_BILLING_ENABLED: 'true',
      STRIPE_SECRET_KEY: 'sk_test_dummy',
      STRIPE_METER_TX_NAME: 'limen_settled_transaction',
      STRIPE_METER_VOLUME_NAME: 'limen_settled_volume_micros',
    });
  });

  beforeEach(async () => {
    emitMeterEvent.mockClear();
    const db = getDb();
    // Wipe any prior state for this slug so each test starts clean.
    const existing = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.slug, PROJECT_SLUG))
      .limit(1);
    if (existing.length > 0 && existing[0]?.id !== undefined) {
      const id = existing[0].id;
      await db.delete(transactions).where(eq(transactions.projectId, id));
      await db.delete(endpoints).where(eq(endpoints.projectId, id));
      await db.delete(projects).where(eq(projects.id, id));
    }
  });

  afterAll(async () => {
    const db = getDb();
    const existing = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.slug, PROJECT_SLUG))
      .limit(1);
    if (existing.length > 0 && existing[0]?.id !== undefined) {
      const id = existing[0].id;
      await db.delete(transactions).where(eq(transactions.projectId, id));
      await db.delete(endpoints).where(eq(endpoints.projectId, id));
      await db.delete(projects).where(eq(projects.id, id));
    }
    await closeDb();
  });

  function makeApp() {
    return new Hono().route('/transactions', transactionsRoutes);
  }

  async function ingest(amountMicros: string) {
    const app = makeApp();
    const res = await app.request('/transactions/ingest', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer integration-test-ingest-token',
      },
      body: JSON.stringify({
        project_slug: PROJECT_SLUG,
        chain: 'base-sepolia',
        tx_hash: `0x${Math.random().toString(16).slice(2).padEnd(64, '0').slice(0, 64)}`,
        amount_usdc_micros: amountMicros,
        from_wallet: '0xfrom',
        to_wallet: '0xto',
        nonce: Math.random().toString(16).slice(2),
        endpoint_path: '/v1/test',
        status: 'settled',
      }),
    });
    return res;
  }

  async function setStripeCustomer(customerId: string | null) {
    const db = getDb();
    projectId = (
      await db.select({ id: projects.id }).from(projects).where(eq(projects.slug, PROJECT_SLUG)).limit(1)
    )[0]?.id ?? '';
    if (projectId.length === 0) return;
    await db
      .update(projects)
      .set({ stripeCustomerId: customerId })
      .where(eq(projects.id, projectId));
  }

  it('does NOT emit a meter event when project has no stripe_customer_id', async () => {
    // First ingest creates the project (without customer id).
    const res1 = await ingest('1000000');
    expect(res1.status).toBe(201);
    expect(emitMeterEvent).not.toHaveBeenCalled();

    // Confirm the project landed.
    const db = getDb();
    const rows = await db.select().from(projects).where(eq(projects.slug, PROJECT_SLUG)).limit(1);
    expect(rows[0]?.stripeCustomerId).toBeNull();
  });

  it('emits TWO meter events (count + volume) on settlement once stripe_customer_id is set', async () => {
    // Bootstrap project, then attach a customer.
    await ingest('500000');
    await setStripeCustomer(STRIPE_CUSTOMER);
    emitMeterEvent.mockClear();

    const res = await ingest('12500000');
    expect(res.status).toBe(201);

    // Allow the fire-and-forget Promise.all microtask to flush.
    await new Promise((r) => setImmediate(r));

    expect(emitMeterEvent).toHaveBeenCalledTimes(2);

    const calls: MeterCall[] = emitMeterEvent.mock.calls.map((c) => c[0]);
    const tx = calls.find((c) => c.eventName === 'limen_settled_transaction');
    const vol = calls.find((c) => c.eventName === 'limen_settled_volume_micros');

    expect(tx).toBeDefined();
    expect(tx).toMatchObject({
      customerId: STRIPE_CUSTOMER,
      eventName: 'limen_settled_transaction',
      value: '1',
    });
    expect(tx?.identifier).toMatch(/:tx$/);

    expect(vol).toBeDefined();
    expect(vol).toMatchObject({
      customerId: STRIPE_CUSTOMER,
      eventName: 'limen_settled_volume_micros',
      value: '12500000',
    });
    expect(vol?.identifier).toMatch(/:vol$/);

    // The two meter events MUST share the same tx-id prefix so an operator
    // can correlate them back to a single settlement.
    const txStem = tx?.identifier.split(':')[0];
    const volStem = vol?.identifier.split(':')[0];
    expect(txStem).toBeDefined();
    expect(txStem).toBe(volStem);
  });

  it('uses tx-id-derived meter identifiers so each settlement is a distinct Stripe event', async () => {
    // Two independent settlements MUST produce four distinct meter
    // identifiers (one count + one volume per row).  This is what makes
    // Stripe's idempotency-by-identifier safe under proxy retransmits:
    // identical retries collapse, but distinct settlements bill separately.
    await ingest('100000');
    await setStripeCustomer(STRIPE_CUSTOMER);
    emitMeterEvent.mockClear();

    await ingest('1');
    await ingest('2');
    await new Promise((r) => setImmediate(r));

    expect(emitMeterEvent).toHaveBeenCalledTimes(4);
    const idents = emitMeterEvent.mock.calls.map((c) => c[0].identifier);
    const unique = new Set(idents);
    expect(unique.size).toBe(4);
  });
});
