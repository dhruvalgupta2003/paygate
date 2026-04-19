import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Drizzle schema definitions.
 *
 * Migrations are hand-written in ./migrations/ — drizzle-kit is used only
 * for `generate` scaffolding; we do not trust drift-derived migrations for
 * traceability reasons (see SOC 2 change-management story).
 */

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    ownerWallet: text('owner_wallet').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),

    // Stripe billing (opt-in per project).  customerId is the linkage point;
    // when null, settled transactions for this project skip metering.  Status
    // mirrors the latest subscription state we saw via webhook; the proxy may
    // gate on it in v2 but does not today.
    stripeCustomerId: text('stripe_customer_id'),
    stripeSubscriptionId: text('stripe_subscription_id'),
    billingStatus: text('billing_status').notNull().default('inactive'),
    billingPeriodStart: timestamp('billing_period_start', { withTimezone: true }),
    billingPeriodEnd: timestamp('billing_period_end', { withTimezone: true }),
  },
  (t) => ({
    byStripeCustomer: uniqueIndex('projects_stripe_customer_id_idx').on(t.stripeCustomerId),
  }),
);

export const endpoints = pgTable(
  'endpoints',
  {
    id: uuid('id').primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    pathGlob: text('path_glob').notNull(),
    method: text('method').array().default(sql`'{}'::text[]`).notNull(),
    priceUsdcMicros: bigint('price_usdc_micros', { mode: 'bigint' }).notNull(),
    tags: text('tags').array().default(sql`'{}'::text[]`).notNull(),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byProject: index('endpoints_project_idx').on(t.projectId),
  }),
);

// Partitioned by observed_at (monthly).  Drizzle does not model declarative
// partitions; see migrations/0002_partitioning.sql for the PARTITION BY.
export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').notNull(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    endpointId: uuid('endpoint_id').references(() => endpoints.id),
    chain: text('chain').notNull(),
    txHash: text('tx_hash').notNull(),
    blockOrSlot: bigint('block_or_slot', { mode: 'bigint' }),
    amountUsdcMicros: bigint('amount_usdc_micros', { mode: 'bigint' }).notNull(),
    fromWallet: text('from_wallet').notNull(),
    toWallet: text('to_wallet').notNull(),
    nonce: text('nonce').notNull(),
    status: text('status').notNull(),
    settledAt: timestamp('settled_at', { withTimezone: true }),
    observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
    redactedAt: timestamp('redacted_at', { withTimezone: true }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.id, t.observedAt] }),
    uniqTx: uniqueIndex('transactions_chain_tx_hash_key').on(t.chain, t.txHash, t.observedAt),
    byProjectEndpoint: index('transactions_project_endpoint_idx').on(t.projectId, t.endpointId),
    byObservedBrin: index('transactions_observed_brin_idx').on(t.observedAt),
    byFromWallet: index('transactions_from_wallet_idx').on(t.fromWallet),
    byStatus: index('transactions_status_idx').on(t.status),
  }),
);

export const rateLimitEvents = pgTable(
  'rate_limit_events',
  {
    id: uuid('id').primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    scope: text('scope').notNull(),
    keyHash: text('key_hash').notNull(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byProject: index('rate_limit_events_project_idx').on(t.projectId, t.at),
  }),
);

export const complianceEvents = pgTable(
  'compliance_events',
  {
    id: uuid('id').primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    detail: jsonb('detail').notNull().default({}),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byProjectKind: index('compliance_events_project_kind_idx').on(t.projectId, t.kind, t.at),
  }),
);

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

export const webhookSubscriptions = pgTable(
  'webhook_subscriptions',
  {
    id: uuid('id').primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    events: text('events').array().notNull(),
    secret: text('secret').notNull(), // stored encrypted at rest in production
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    rotatedAt: timestamp('rotated_at', { withTimezone: true }),
    previousSecret: text('previous_secret'), // 10-min overlap during rotation
    previousSecretExpiresAt: timestamp('previous_secret_expires_at', { withTimezone: true }),
  },
  (t) => ({
    byProject: index('webhook_subscriptions_project_idx').on(t.projectId),
  }),
);

export const webhookDeliveries = pgTable(
  'webhook_deliveries',
  {
    id: uuid('id').primaryKey(),
    subscriptionId: uuid('subscription_id').references(() => webhookSubscriptions.id, {
      onDelete: 'cascade',
    }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    event: text('event').notNull(),
    url: text('url').notNull(),
    payload: jsonb('payload').notNull(),
    status: text('status').notNull(), // pending | delivered | failed | dead | delivering
    attempt: integer('attempt').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(12),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }),
    lastResponseCode: integer('last_response_code'),
    lastResponseBody: text('last_response_body'),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  },
  (t) => ({
    byProjectStatus: index('webhook_deliveries_project_status_idx').on(t.projectId, t.status),
    byNextAttempt: index('webhook_deliveries_next_attempt_idx').on(t.status, t.nextAttemptAt),
  }),
);

// ---------------------------------------------------------------------------
// Audit + DSR + Refunds + Directory
// ---------------------------------------------------------------------------

export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey(),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    actor: text('actor').notNull(),
    action: text('action').notNull(),
    target: text('target').notNull(),
    meta: jsonb('meta').notNull().default({}),
    // Live table columns are prev_hash / row_hash — see migrations/0001_init.sql.
    prev: text('prev_hash').notNull(),
    hash: text('row_hash').notNull(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byProjectAt: index('idx_audit_log_project_at').on(t.projectId, t.at),
    byAt: index('idx_audit_log_at').on(t.at),
  }),
);

export const dsrTombstones = pgTable(
  'dsr_tombstones',
  {
    id: uuid('id').primaryKey(),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    wallet: text('wallet').notNull(),
    scope: text('scope').notNull(),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byWallet: uniqueIndex('dsr_tombstones_wallet_scope_idx').on(t.wallet, t.scope, t.projectId),
  }),
);

export const refunds = pgTable(
  'refunds',
  {
    id: uuid('id').primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    transactionId: uuid('transaction_id').notNull(),
    transactionObservedAt: timestamp('transaction_observed_at', { withTimezone: true }).notNull(),
    txHash: text('tx_hash').notNull(),
    refundTxHash: text('refund_tx_hash'),
    reason: text('reason').notNull(),
    status: text('status').notNull(), // requested | confirmed | failed
    requestedBy: text('requested_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  },
  (t) => ({
    byProject: index('refunds_project_idx').on(t.projectId, t.createdAt),
    byTxHash: index('refunds_tx_hash_idx').on(t.txHash),
  }),
);

// ---------------------------------------------------------------------------
// API Keys
// ---------------------------------------------------------------------------

/**
 * Hashed admin/customer API keys.  Bearer tokens follow the format
 *   lk_<prefix>_<secret>
 * where `prefix` is the first 8 chars of the key id (uniquely-indexed) and
 * `secret` is verified against `hash` via timing-safe compare.  We never
 * store the plaintext — `hash` is sha256 of the raw secret with a
 * per-deploy pepper (env LIMEN_API_KEY_PEPPER).
 */
export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id').primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    prefix: text('prefix').notNull(),
    hash: text('hash').notNull(),
    role: text('role').notNull().default('admin'), // viewer | admin | owner
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => ({
    byPrefix: uniqueIndex('api_keys_prefix_idx').on(t.prefix),
    byProject: index('api_keys_project_idx').on(t.projectId),
  }),
);

/**
 * Stripe webhook event-id dedup ledger.
 *
 * Stripe retries deliveries on 5xx and may legitimately re-deliver after
 * its own internal blips.  Without dedup, a replayed `subscription.updated`
 * could roll a customer's billing_status backwards.  We INSERT ON CONFLICT
 * DO NOTHING; if the insert returns no row the event is a replay and the
 * handler skips the side effects with a 200 ack so Stripe stops retrying.
 */
export const stripeProcessedEvents = pgTable('stripe_processed_events', {
  eventId: text('event_id').primaryKey(),
  eventType: text('event_type').notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }).notNull().defaultNow(),
});

export const directoryListings = pgTable('directory_listings', {
  projectId: uuid('project_id')
    .primaryKey()
    .references(() => projects.id, { onDelete: 'cascade' }),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  tags: text('tags').array().default(sql`'{}'::text[]`).notNull(),
  openapiUrl: text('openapi_url'),
  homepage: text('homepage'),
  categories: text('categories').array().default(sql`'{}'::text[]`).notNull(),
  listed: boolean('listed').notNull().default(false),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Project = typeof projects.$inferSelect;
export type Endpoint = typeof endpoints.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type WebhookSubscription = typeof webhookSubscriptions.$inferSelect;
export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;
export type AuditRow = typeof auditLog.$inferSelect;
export type DsrTombstone = typeof dsrTombstones.$inferSelect;
export type Refund = typeof refunds.$inferSelect;
export type DirectoryListing = typeof directoryListings.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
