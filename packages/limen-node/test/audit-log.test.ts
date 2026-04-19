import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AuditLogger } from '../src/analytics/audit-log.js';
import { createLogger } from '../src/utils/logger.js';

describe('AuditLogger', () => {
  let dir: string;

  afterEach(() => {
    if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  });

  it('hash-chains appended rows', async () => {
    dir = mkdtempSync(join(tmpdir(), 'limen-audit-'));
    const al = new AuditLogger({ dir, logger: createLogger({ level: 'silent' }) });
    al.append({ actor: 'test', action: 'boot', target: 'proxy' });
    al.append({ actor: 'test', action: 'set_wallet', target: 'base' });
    al.append({ actor: 'test', action: 'reload', target: 'config' });
    await new Promise((r) => setTimeout(r, 10));

    // Find the file we wrote
    const today = new Date().toISOString().slice(0, 10);
    const file = join(dir, `${today}.ndjson`);
    const result = AuditLogger.verify(file);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.rows).toBe(3);
  });
});
