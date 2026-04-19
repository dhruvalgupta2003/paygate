/**
 * Vitest global setup: makes test files hermetic without forcing every
 * suite to re-export the same env-shim boilerplate.
 *
 * Order of resolution for each required env:
 *   1. Already set in process.env (CI / dev shell)
 *   2. Loaded from apps/api/.env when present (local dev convenience)
 *   3. Falls back to a non-secret deterministic default
 *
 * Required envs:
 *   - LIMEN_DATABASE_URL — when missing, integration suites self-skip via
 *     `describe.skipIf(!HAS_DB)` so we do NOT default it here.
 *   - LIMEN_REDIS_URL    — required by env.ts; safe to default in tests.
 *   - LIMEN_JWT_SECRET   — required by env.ts (>=32 bytes).
 *   - LIMEN_WEBHOOK_SIGNING_SECRET — required by env.ts (>=32 bytes).
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function loadDotEnvIfPresent(): void {
  const envPath = join(process.cwd(), '.env');
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, 'utf8').split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (line.length === 0 || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    // Strip surrounding quotes.
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    } else {
      // Inline comment: a `#` preceded by whitespace ends the value
      // (matches the convention used by dotenv-style parsers).
      const hash = val.search(/\s#/);
      if (hash >= 0) val = val.slice(0, hash).trim();
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadDotEnvIfPresent();

const DEFAULTS: Record<string, string> = {
  LIMEN_REDIS_URL: 'redis://localhost:6379/15',
  LIMEN_JWT_SECRET: 'a'.repeat(48),
  LIMEN_WEBHOOK_SIGNING_SECRET: 'b'.repeat(48),
};
for (const [k, v] of Object.entries(DEFAULTS)) {
  if (process.env[k] === undefined) process.env[k] = v;
}
