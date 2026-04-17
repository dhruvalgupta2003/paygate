import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Logger } from '../types.js';

/**
 * Append-only hash-chained audit log.  Each record includes the SHA-256 of
 * the previous row, giving tamper-evidence at replay time.
 *
 *    row_hash = SHA-256(prev_hash || canonical_json(row))
 */

export interface AuditRecord {
  readonly id: string;
  readonly at: string;
  readonly actor: string;
  readonly action: string;
  readonly target: string;
  readonly meta: Readonly<Record<string, unknown>>;
  readonly prev: string;
  readonly hash: string;
}

export interface AuditLoggerOptions {
  readonly dir: string;
  readonly logger: Logger;
}

export class AuditLogger {
  private readonly file: string;
  private readonly stream: ReturnType<typeof createWriteStream>;
  private readonly logger: Logger;
  private prevHash = '0'.repeat(64);

  constructor(opts: AuditLoggerOptions) {
    if (!existsSync(opts.dir)) mkdirSync(opts.dir, { recursive: true });
    const name = `${new Date().toISOString().slice(0, 10)}.ndjson`;
    this.file = path.join(opts.dir, name);
    this.stream = createWriteStream(this.file, { flags: 'a' });
    this.logger = opts.logger;
    this.loadPrevHash();
  }

  private loadPrevHash(): void {
    if (!existsSync(this.file)) return;
    try {
      const raw = readFileSync(this.file, 'utf-8');
      const lines = raw.trimEnd().split('\n');
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i];
        if (!line) continue;
        const parsed = JSON.parse(line) as AuditRecord;
        if (parsed.hash) {
          this.prevHash = parsed.hash;
          break;
        }
      }
    } catch (err) {
      this.logger.warn({ err: (err as Error).message }, 'could not recover audit prev hash; starting fresh');
    }
  }

  append(row: {
    actor: string;
    action: string;
    target: string;
    meta?: Record<string, unknown>;
  }): AuditRecord {
    const base = {
      id: randomUUID(),
      at: new Date().toISOString(),
      actor: row.actor,
      action: row.action,
      target: row.target,
      meta: row.meta ?? {},
      prev: this.prevHash,
    } as const;
    const hash = createHash('sha256')
      .update(this.prevHash)
      .update('|')
      .update(canonical(base))
      .digest('hex');
    const full: AuditRecord = { ...base, hash };
    this.stream.write(`${JSON.stringify(full)}\n`, (err) => {
      if (err) this.logger.error({ err: err.message }, 'audit write failed');
    });
    this.prevHash = hash;
    return full;
  }

  /** Re-derive the hash chain from disk and report any break. */
  static verify(filePath: string): { ok: true; rows: number } | { ok: false; brokenAt: number } {
    const raw = readFileSync(filePath, 'utf-8');
    const lines = raw.trimEnd().split('\n').filter(Boolean);
    let prev = '0'.repeat(64);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      const row = JSON.parse(line) as AuditRecord;
      const expected = createHash('sha256')
        .update(prev)
        .update('|')
        .update(
          canonical({
            id: row.id,
            at: row.at,
            actor: row.actor,
            action: row.action,
            target: row.target,
            meta: row.meta,
            prev: row.prev,
          }),
        )
        .digest('hex');
      if (expected !== row.hash || row.prev !== prev) {
        return { ok: false, brokenAt: i };
      }
      prev = row.hash;
    }
    return { ok: true, rows: lines.length };
  }
}

function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`;
}
