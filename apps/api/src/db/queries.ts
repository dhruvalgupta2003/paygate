import { and, desc, eq, gte, lt, lte, or, sql } from 'drizzle-orm';
import type { Database } from './index.js';
import {
  auditLog,
  complianceEvents,
  directoryListings,
  dsrTombstones,
  endpoints,
  projects,
  refunds,
  transactions,
  webhookDeliveries,
  webhookSubscriptions,
} from './schema.js';
import type { CursorPayload } from '../lib/pagination.js';

/**
 * Parameterised query helpers.  No string concatenation.  All helpers accept
 * a Database handle so tests can inject a transaction.
 */

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export async function findProjectBySlug(db: Database, slug: string) {
  const rows = await db.select().from(projects).where(eq(projects.slug, slug)).limit(1);
  return rows[0] ?? null;
}

export async function findProjectById(db: Database, id: string) {
  const rows = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

export interface TxFilter {
  readonly projectId: string;
  readonly status?: string;
  readonly since?: Date;
  readonly until?: Date;
  readonly cursor?: CursorPayload;
  readonly limit: number;
}

export async function listTransactions(db: Database, filter: TxFilter) {
  const conditions = [eq(transactions.projectId, filter.projectId)];
  if (filter.status !== undefined) conditions.push(eq(transactions.status, filter.status));
  if (filter.since !== undefined) conditions.push(gte(transactions.observedAt, filter.since));
  if (filter.until !== undefined) conditions.push(lte(transactions.observedAt, filter.until));

  if (filter.cursor !== undefined) {
    const cursorAt = new Date(filter.cursor.t);
    // Keyset: (observed_at < cursorAt) OR (observed_at = cursorAt AND id < cursorId)
    const keysetClause = or(
      lt(transactions.observedAt, cursorAt),
      and(eq(transactions.observedAt, cursorAt), lt(transactions.id, filter.cursor.id)),
    );
    if (keysetClause !== undefined) conditions.push(keysetClause);
  }

  return db
    .select()
    .from(transactions)
    .where(and(...conditions))
    .orderBy(desc(transactions.observedAt), desc(transactions.id))
    .limit(filter.limit + 1); // +1 to know whether more exist
}

export async function findTransactionByHash(db: Database, projectId: string, txHash: string) {
  const rows = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.projectId, projectId), eq(transactions.txHash, txHash)))
    .orderBy(desc(transactions.observedAt))
    .limit(1);
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

export interface AnalyticsRange {
  readonly projectId: string;
  readonly since: Date;
  readonly until: Date;
}

export async function revenueAndRequests(db: Database, range: AnalyticsRange) {
  const rows = await db
    .select({
      requests: sql<number>`count(*)::int`,
      revenue: sql<string>`coalesce(sum(${transactions.amountUsdcMicros})::text, '0')`,
      uniqueWallets: sql<number>`count(distinct ${transactions.fromWallet})::int`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.projectId, range.projectId),
        eq(transactions.status, 'settled'),
        gte(transactions.observedAt, range.since),
        lte(transactions.observedAt, range.until),
      ),
    );
  const row = rows[0];
  if (row === undefined) return { requests: 0, revenueMicros: '0', uniqueWallets: 0 };
  return { requests: row.requests, revenueMicros: row.revenue, uniqueWallets: row.uniqueWallets };
}

export async function topEndpointsByRevenue(
  db: Database,
  range: AnalyticsRange,
  topN: number,
) {
  return db
    .select({
      endpointId: transactions.endpointId,
      path: endpoints.pathGlob,
      requests: sql<number>`count(*)::int`,
      revenue: sql<string>`coalesce(sum(${transactions.amountUsdcMicros})::text, '0')`,
    })
    .from(transactions)
    .leftJoin(endpoints, eq(endpoints.id, transactions.endpointId))
    .where(
      and(
        eq(transactions.projectId, range.projectId),
        eq(transactions.status, 'settled'),
        gte(transactions.observedAt, range.since),
        lte(transactions.observedAt, range.until),
      ),
    )
    .groupBy(transactions.endpointId, endpoints.pathGlob)
    .orderBy(sql`sum(${transactions.amountUsdcMicros}) desc`)
    .limit(topN);
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

export async function listWebhookSubscriptions(db: Database, projectId: string) {
  return db.select().from(webhookSubscriptions).where(eq(webhookSubscriptions.projectId, projectId));
}

export async function findWebhookSubscription(db: Database, id: string) {
  const rows = await db.select().from(webhookSubscriptions).where(eq(webhookSubscriptions.id, id)).limit(1);
  return rows[0] ?? null;
}

export interface DeliveryFilter {
  readonly projectId: string;
  readonly status?: string;
  readonly event?: string;
  readonly cursor?: CursorPayload;
  readonly limit: number;
}

export async function listWebhookDeliveries(db: Database, filter: DeliveryFilter) {
  const conditions = [eq(webhookDeliveries.projectId, filter.projectId)];
  if (filter.status !== undefined) conditions.push(eq(webhookDeliveries.status, filter.status));
  if (filter.event !== undefined) conditions.push(eq(webhookDeliveries.event, filter.event));
  if (filter.cursor !== undefined) {
    const cursorAt = new Date(filter.cursor.t);
    const keyset = or(
      lt(webhookDeliveries.createdAt, cursorAt),
      and(eq(webhookDeliveries.createdAt, cursorAt), lt(webhookDeliveries.id, filter.cursor.id)),
    );
    if (keyset !== undefined) conditions.push(keyset);
  }
  return db
    .select()
    .from(webhookDeliveries)
    .where(and(...conditions))
    .orderBy(desc(webhookDeliveries.createdAt), desc(webhookDeliveries.id))
    .limit(filter.limit + 1);
}

export async function findWebhookDelivery(db: Database, id: string) {
  const rows = await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.id, id)).limit(1);
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export async function tailAudit(db: Database, projectId: string | null, limit: number) {
  const conditions = projectId === null ? [] : [eq(auditLog.projectId, projectId)];
  const q = db.select().from(auditLog).orderBy(desc(auditLog.at)).limit(limit);
  return conditions.length === 0 ? q : q.where(and(...conditions));
}

export async function allAuditInOrder(db: Database, projectId: string | null) {
  const base = db.select().from(auditLog).orderBy(auditLog.at, auditLog.id);
  return projectId === null ? base : base.where(eq(auditLog.projectId, projectId));
}

export async function latestAuditHash(db: Database, projectId: string | null): Promise<string> {
  const conditions = projectId === null ? [] : [eq(auditLog.projectId, projectId)];
  const q = db.select({ hash: auditLog.hash }).from(auditLog).orderBy(desc(auditLog.at)).limit(1);
  const rows = conditions.length === 0 ? await q : await q.where(and(...conditions));
  const row = rows[0];
  return row?.hash ?? '0'.repeat(64);
}

// ---------------------------------------------------------------------------
// Compliance + DSR + Refunds + Directory
// ---------------------------------------------------------------------------

export async function listComplianceEvents(
  db: Database,
  projectId: string,
  since: Date,
  until: Date,
  limit: number,
) {
  return db
    .select()
    .from(complianceEvents)
    .where(
      and(
        eq(complianceEvents.projectId, projectId),
        gte(complianceEvents.at, since),
        lte(complianceEvents.at, until),
      ),
    )
    .orderBy(desc(complianceEvents.at))
    .limit(limit);
}

export async function findDirectoryBySlug(db: Database, slug: string) {
  const rows = await db.select().from(directoryListings).where(eq(directoryListings.slug, slug)).limit(1);
  return rows[0] ?? null;
}

export async function listDirectoryPublic(db: Database, limit: number) {
  return db.select().from(directoryListings).where(eq(directoryListings.listed, true)).limit(limit);
}

export async function insertDsrTombstone(
  db: Database,
  row: { id: string; projectId: string | null; wallet: string; scope: string; reason?: string | null },
) {
  await db.insert(dsrTombstones).values(row).onConflictDoNothing();
}

export async function maskTransactionsForWallet(
  db: Database,
  projectId: string,
  wallet: string,
) {
  // Mask to a deterministic sentinel while preserving aggregate totals.
  const masked = 'REDACTED_' + wallet.slice(-6);
  return db
    .update(transactions)
    .set({ fromWallet: masked, redactedAt: sql`now()` })
    .where(and(eq(transactions.projectId, projectId), eq(transactions.fromWallet, wallet)));
}

export async function findRefund(db: Database, id: string) {
  const rows = await db.select().from(refunds).where(eq(refunds.id, id)).limit(1);
  return rows[0] ?? null;
}
