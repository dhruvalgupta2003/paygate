import { describe, it, expect, vi } from 'vitest';
import type { Logger } from 'pino';
import { tickOnce, type WebhookDispatcher } from './webhook-worker.js';

const noopLog: Logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn(),
} as unknown as Logger;

function makeService(
  deliveries: ReadonlyArray<{ id: string }>,
  dispatchOutcomes: ReadonlyArray<boolean | Error>,
): WebhookDispatcher & { claimDueBatch: ReturnType<typeof vi.fn>; dispatch: ReturnType<typeof vi.fn> } {
  let i = 0;
  const claimDueBatch = vi.fn(async () => deliveries as never);
  const dispatch = vi.fn(async () => {
    const outcome = dispatchOutcomes[i] ?? true;
    i += 1;
    if (outcome instanceof Error) throw outcome;
    return outcome;
  });
  return { claimDueBatch, dispatch } as never;
}

describe('webhook worker tick', () => {
  it('returns zero counts when nothing is due', async () => {
    const service = makeService([], []);
    const result = await tickOnce(service, 25, noopLog);
    expect(result).toEqual({ claimed: 0, succeeded: 0, failed: 0 });
    expect(service.dispatch).not.toHaveBeenCalled();
  });

  it('dispatches every claimed delivery and counts successes vs failures', async () => {
    const service = makeService(
      [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      [true, false, true],
    );
    const result = await tickOnce(service, 25, noopLog);
    expect(result).toEqual({ claimed: 3, succeeded: 2, failed: 1 });
    expect(service.dispatch).toHaveBeenCalledTimes(3);
  });

  it('counts a thrown dispatch as a failure (one bad delivery does not abort the batch)', async () => {
    const service = makeService(
      [{ id: 'a' }, { id: 'b' }],
      [new Error('boom'), true],
    );
    const result = await tickOnce(service, 25, noopLog);
    expect(result).toEqual({ claimed: 2, succeeded: 1, failed: 1 });
    expect(service.dispatch).toHaveBeenCalledTimes(2);
  });

  it('forwards the batch size to claimDueBatch', async () => {
    const service = makeService([], []);
    await tickOnce(service, 7, noopLog);
    expect(service.claimDueBatch).toHaveBeenCalledWith(7);
  });
});
