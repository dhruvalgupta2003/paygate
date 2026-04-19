import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { and, eq, gte, lt, sql } from 'drizzle-orm';
import Stripe from 'stripe';
import { getDb } from '../db/index.js';
import { projects, transactions } from '../db/schema.js';
import { LimenError, ErrorCode } from '../lib/errors.js';
import {
  createBillingPortalSession,
  createCustomer,
  isStripeEnabled,
} from '../lib/stripe.js';
import { AuditService } from '../services/audit-service.js';
import { getLogger } from '../lib/logger.js';

function actorFrom(c: { get: (k: 'auth') => { subject?: string } | undefined }): string {
  const auth = c.get('auth');
  return typeof auth?.subject === 'string' ? auth.subject : 'system';
}

async function audit(
  projectId: string,
  actor: string,
  action: string,
  target: string,
  meta?: Record<string, unknown>,
): Promise<void> {
  try {
    await new AuditService({ db: getDb() }).append({
      projectId,
      actor,
      action,
      target,
      meta: meta ?? {},
    });
  } catch (err) {
    getLogger().error(
      { err: (err as Error).message, action, target },
      'audit append for billing mutation failed (mutation still applied)',
    );
  }
}

/**
 * Admin billing routes.
 *
 *   GET  /              → enabled flag, current billing state, period usage
 *   POST /customer      → set/create stripe_customer_id for the current project
 *   DELETE /customer    → unlink stripe_customer_id (rare; testing/migration)
 *   POST /portal        → returns a one-time Stripe Customer Portal URL
 *
 * Project context is derived from `auth.projectId` when present; in
 * single-project / dev mode we fall back to the first project (matches
 * how keys.ts scopes ownership).
 */

async function resolveProjectId(c: { get: (k: 'auth') => { projectId?: string } | undefined }) {
  const auth = c.get('auth');
  if (auth?.projectId !== undefined) return auth.projectId;
  const db = getDb();
  const rows = await db.select({ id: projects.id }).from(projects).limit(1);
  return rows[0]?.id ?? null;
}

const setCustomerSchema = z.object({
  stripe_customer_id: z
    .string()
    .regex(/^cus_[A-Za-z0-9]+$/, 'must be a Stripe customer id (cus_...)')
    .optional(),
  email: z.string().email().optional(),
});

export const billingRoutes = new Hono()
  .get('/', async (c) => {
    const projectId = await resolveProjectId(c);
    if (projectId === null) {
      throw new LimenError({ code: ErrorCode.NOT_FOUND, detail: 'no project exists yet' });
    }
    const db = getDb();
    const rows = await db
      .select({
        id: projects.id,
        slug: projects.slug,
        stripeCustomerId: projects.stripeCustomerId,
        stripeSubscriptionId: projects.stripeSubscriptionId,
        billingStatus: projects.billingStatus,
        billingPeriodStart: projects.billingPeriodStart,
        billingPeriodEnd: projects.billingPeriodEnd,
      })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    const project = rows[0];
    if (!project) {
      throw new LimenError({ code: ErrorCode.NOT_FOUND, detail: 'project not found' });
    }

    const { settledCount, settledVolumeMicros } = await currentPeriodUsage(
      projectId,
      project.billingPeriodStart,
      project.billingPeriodEnd,
    );

    return c.json({
      enabled: isStripeEnabled(),
      project_id: project.id,
      project_slug: project.slug,
      stripe_customer_id: project.stripeCustomerId,
      stripe_subscription_id: project.stripeSubscriptionId,
      billing_status: project.billingStatus,
      billing_period_start: project.billingPeriodStart?.toISOString() ?? null,
      billing_period_end: project.billingPeriodEnd?.toISOString() ?? null,
      current_period: {
        settled_count: settledCount,
        settled_volume_usdc_micros: settledVolumeMicros,
      },
    });
  })
  .post('/customer', zValidator('json', setCustomerSchema), async (c) => {
    const body = c.req.valid('json');
    const projectId = await resolveProjectId(c);
    if (projectId === null) {
      throw new LimenError({ code: ErrorCode.NOT_FOUND, detail: 'no project exists yet' });
    }
    const db = getDb();

    let customerId = body.stripe_customer_id;
    let mintedNew = false;
    if (customerId === undefined) {
      // No id supplied → mint a new Stripe customer for this project.
      if (!isStripeEnabled()) {
        throw new LimenError({
          code: ErrorCode.VALIDATION_FAILED,
          detail:
            'Stripe billing is disabled; supply stripe_customer_id explicitly or enable STRIPE_BILLING_ENABLED.',
        });
      }
      const projectRows = await db
        .select({ slug: projects.slug })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);
      const slug = projectRows[0]?.slug;
      if (!slug) {
        throw new LimenError({ code: ErrorCode.NOT_FOUND, detail: 'project not found' });
      }
      try {
        const created = await createCustomer({
          projectId,
          slug,
          ...(body.email !== undefined ? { email: body.email } : {}),
        });
        customerId = created.id;
        mintedNew = true;
      } catch (err) {
        throw wrapStripeError(err, 'create_customer_failed', 'Stripe customer creation failed');
      }
    }

    await db
      .update(projects)
      .set({ stripeCustomerId: customerId })
      .where(eq(projects.id, projectId));

    await audit(projectId, actorFrom(c), mintedNew ? 'billing.customer_created' : 'billing.customer_linked', customerId, {
      stripe_customer_id: customerId,
      ...(mintedNew && body.email !== undefined ? { email_provided: true } : {}),
    });

    return c.json({ stripe_customer_id: customerId });
  })
  .delete('/customer', async (c) => {
    const projectId = await resolveProjectId(c);
    if (projectId === null) {
      throw new LimenError({ code: ErrorCode.NOT_FOUND, detail: 'no project exists yet' });
    }
    const db = getDb();
    const prior = await db
      .select({ stripeCustomerId: projects.stripeCustomerId })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    await db
      .update(projects)
      .set({
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        billingStatus: 'inactive',
        billingPeriodStart: null,
        billingPeriodEnd: null,
      })
      .where(eq(projects.id, projectId));

    await audit(
      projectId,
      actorFrom(c),
      'billing.customer_unlinked',
      prior[0]?.stripeCustomerId ?? '(none)',
      { previous_stripe_customer_id: prior[0]?.stripeCustomerId ?? null },
    );
    return c.body(null, 204);
  })
  .post('/portal', async (c) => {
    const projectId = await resolveProjectId(c);
    if (projectId === null) {
      throw new LimenError({ code: ErrorCode.NOT_FOUND, detail: 'no project exists yet' });
    }
    const db = getDb();
    const rows = await db
      .select({ stripeCustomerId: projects.stripeCustomerId })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    const customerId = rows[0]?.stripeCustomerId;
    if (!customerId) {
      throw new LimenError({
        code: ErrorCode.VALIDATION_FAILED,
        detail: 'project has no stripe_customer_id; set one via POST /billing/customer first',
      });
    }

    let session: { url: string };
    try {
      session = await createBillingPortalSession({ customerId });
    } catch (err) {
      throw wrapStripeError(
        err,
        'portal_session_failed',
        'Could not open billing portal — verify the Stripe Customer Portal is enabled in your Stripe dashboard',
      );
    }

    await audit(projectId, actorFrom(c), 'billing.portal_opened', customerId);
    return c.json({ url: session.url });
  });

/**
 * Convert a Stripe SDK error into a LimenError so the global error
 * handler renders a clean envelope instead of leaking SDK internals.
 * Logs the raw cause so operators can debug without seeing it in the
 * response body.
 */
function wrapStripeError(err: unknown, code: string, userMessage: string): LimenError {
  const log = getLogger();
  if (err instanceof Stripe.errors.StripeError) {
    log.warn(
      { stripeType: err.type, stripeCode: err.code, stripeMessage: err.message },
      'stripe sdk error in billing route',
    );
    return new LimenError({
      code: ErrorCode.UPSTREAM_FAILED,
      detail: `${userMessage} (${code})`,
      extra: {
        stripe_type: err.type,
        ...(err.code !== undefined ? { stripe_code: err.code } : {}),
      },
    });
  }
  log.error({ err: (err as Error).message }, 'unexpected error in billing route');
  return new LimenError({
    code: ErrorCode.INTERNAL,
    detail: userMessage,
  });
}

async function currentPeriodUsage(
  projectId: string,
  periodStart: Date | null,
  periodEnd: Date | null,
): Promise<{ settledCount: number; settledVolumeMicros: string }> {
  const db = getDb();
  // Fall back to "last 30 days" when we have no Stripe period markers yet
  // — keeps the dashboard meaningful before the first invoice closes.
  const start =
    periodStart instanceof Date ? periodStart : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const end = periodEnd instanceof Date ? periodEnd : new Date();
  const filters = [
    eq(transactions.projectId, projectId),
    eq(transactions.status, 'settled'),
    gte(transactions.observedAt, start),
    lt(transactions.observedAt, end),
  ];
  const rows = await db
    .select({
      count: sql<number>`count(*)::int`,
      volume: sql<string>`coalesce(sum(${transactions.amountUsdcMicros})::text, '0')`,
    })
    .from(transactions)
    .where(and(...filters));
  const row = rows[0];
  return {
    settledCount: row?.count ?? 0,
    settledVolumeMicros: row?.volume ?? '0',
  };
}
