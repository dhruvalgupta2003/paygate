import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Database } from '../db/index.js';
import { auditLog, type AuditRow } from '../db/schema.js';
import { getLogger } from '../lib/logger.js';
import { metrics } from '../lib/metrics.js';
import { newUuid } from '../lib/id.js';

/**
 * Hash-chained append-only audit log.
 *
 * Row layout matches packages/paygate-node/src/analytics/audit-log.ts:
 *   { id, at, actor, action, target, meta, prev, hash }
 * where hash = SHA-256(prev || "|" || canonical_json(row_without_hash))
 */

export interface AuditAppendInput {
  readonly projectId: string | null;
  readonly actor: string;
  readonly action: string;
  readonly target: string;
  readonly meta?: Readonly<Record<string, unknown>>;
}

export interface AuditServiceDeps {
  readonly db: Database;
}

export class AuditService {
  constructor(private readonly deps: AuditServiceDeps) {}

  /**
   * Append a row.  Inside a transaction so the row, its computed hash, and
   * the read-update of the "latest hash" are consistent even under contention.
   */
  async append(input: AuditAppendInput): Promise<AuditRow> {
    const row = await this.deps.db.transaction(async (tx) => {
      const prevRows = await tx
        .select({ hash: auditLog.hash })
        .from(auditLog)
        .where(input.projectId === null ? undefined : eq(auditLog.projectId, input.projectId))
        .orderBy(auditLog.at, auditLog.id)
        .limit(1);
      const prev = prevRows.length === 0 ? '0'.repeat(64) : await latestHashOf(tx, input.projectId);
      const id = newUuid();
      const at = new Date();
      const base = {
        id,
        at: at.toISOString(),
        actor: input.actor,
        action: input.action,
        target: input.target,
        meta: input.meta ?? {},
        prev,
      } as const;
      const hash = createHash('sha256').update(prev).update('|').update(canonical(base)).digest('hex');
      const inserted = await tx
        .insert(auditLog)
        .values({
          id,
          projectId: input.projectId,
          actor: input.actor,
          action: input.action,
          target: input.target,
          meta: input.meta ?? {},
          prev,
          hash,
          at,
        })
        .returning();
      const result = inserted[0];
      if (result === undefined) throw new Error('audit insert returned no row');
      return result;
    });

    metrics.auditAppendsTotal.labels('ok').inc();
    getLogger().debug({ auditId: row.id, action: row.action }, 'audit.append');
    return row;
  }

  /** Re-derive the hash chain, returning the first break if any. */
  async verify(projectId: string | null): Promise<
    { ok: true; rows: number } | { ok: false; brokenAt: number; rowId: string }
  > {
    const rows = await this.deps.db
      .select()
      .from(auditLog)
      .where(projectId === null ? undefined : eq(auditLog.projectId, projectId))
      .orderBy(auditLog.at, auditLog.id);

    let prev = '0'.repeat(64);
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (r === undefined) continue;
      const expected = createHash('sha256')
        .update(prev)
        .update('|')
        .update(
          canonical({
            id: r.id,
            at: (r.at instanceof Date ? r.at.toISOString() : String(r.at)),
            actor: r.actor,
            action: r.action,
            target: r.target,
            meta: r.meta,
            prev: r.prev,
          }),
        )
        .digest('hex');
      if (expected !== r.hash || r.prev !== prev) {
        metrics.auditAppendsTotal.labels('broken').inc();
        return { ok: false, brokenAt: i, rowId: r.id };
      }
      prev = r.hash;
    }
    return { ok: true, rows: rows.length };
  }
}

async function latestHashOf(tx: Database, projectId: string | null): Promise<string> {
  const rows = await tx
    .select({ hash: auditLog.hash, at: auditLog.at, id: auditLog.id })
    .from(auditLog)
    .where(projectId === null ? undefined : eq(auditLog.projectId, projectId));
  if (rows.length === 0) return '0'.repeat(64);
  // Sort by (at, id) to match insertion order.
  const sorted = [...rows].sort((a, b) => {
    const at = a.at instanceof Date ? a.at.getTime() : new Date(a.at).getTime();
    const bt = b.at instanceof Date ? b.at.getTime() : new Date(b.at).getTime();
    if (at !== bt) return at - bt;
    return a.id.localeCompare(b.id);
  });
  const last = sorted[sorted.length - 1];
  return last?.hash ?? '0'.repeat(64);
}

function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`;
}
