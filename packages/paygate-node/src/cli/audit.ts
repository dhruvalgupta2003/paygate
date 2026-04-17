import { readFileSync } from 'node:fs';
import { AuditLogger } from '../analytics/audit-log.js';

export async function runAudit(action: string, opts: { file?: string }): Promise<void> {
  if (!opts.file) throw new Error('--file <path> is required');
  switch (action) {
    case 'verify': {
      const result = AuditLogger.verify(opts.file);
      if (result.ok) console.log(`OK — ${result.rows} rows verified`);
      else {
        console.error(`BROKEN at row ${result.brokenAt}`);
        process.exitCode = 1;
      }
      return;
    }
    case 'tail': {
      const raw = readFileSync(opts.file, 'utf-8');
      const lines = raw.trimEnd().split('\n');
      for (const line of lines.slice(-20)) console.log(line);
      return;
    }
    case 'pack': {
      console.error('audit pack: implemented in paygate-core (out of scope for the node CLI)');
      process.exitCode = 1;
      return;
    }
    default:
      console.error(`unknown action: ${action}`);
      process.exitCode = 1;
  }
}
