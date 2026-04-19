import { createHash, randomBytes } from 'node:crypto';
import { ulid } from 'ulid';

/**
 * Generate a server-issued nonce bound to the requirements digest.
 * The ULID gives us sortable, monotonically-increasing ids; the digest
 * suffix binds the nonce to the exact requirements we issued.
 */
export function generateNonce(digest: string): string {
  const id = ulid();
  const rand = randomBytes(8).toString('hex');
  const suffix = createHash('sha256')
    .update(`${id}|${digest}|${rand}`)
    .digest('hex')
    .slice(0, 16);
  return `${id}.${suffix}`;
}

/**
 * Monotonic clock wrapper.  Never use Date.now() for TTL.  This keeps the
 * clock impervious to NTP adjustments within a process lifetime.
 */
export function monotonicSeconds(): number {
  // process.hrtime.bigint() returns nanoseconds since some fixed reference.
  // We map it to seconds, but also need absolute epoch seconds for
  // cross-process comparison (validUntil is epoch seconds).  For that we
  // anchor on the process start time.
  const nsSinceStart = process.hrtime.bigint();
  return Number(nsSinceStart / 1_000_000_000n) + PROCESS_EPOCH_SECONDS;
}

const PROCESS_EPOCH_SECONDS = Math.floor(Date.now() / 1000) - process.uptime();

/** Epoch seconds (safe for cross-process TTL comparisons). */
export function epochSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/** Short, log-safe token for correlation. */
export function shortToken(): string {
  return randomBytes(6).toString('hex');
}
