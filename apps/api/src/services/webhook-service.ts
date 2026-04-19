import { and, asc, eq, isNull, lt, or } from 'drizzle-orm';
import type { Database } from '../db/index.js';
import { webhookDeliveries, webhookSubscriptions } from '../db/schema.js';
import type { WebhookDelivery, WebhookSubscription } from '../db/schema.js';
import { ErrorCode, LimenError } from '../lib/errors.js';
import { newUuid } from '../lib/id.js';
import { getLogger } from '../lib/logger.js';
import { metrics } from '../lib/metrics.js';
import { signWebhook } from '../lib/signature.js';
import { getEnv } from '../config/env.js';

/**
 * Webhook subscriptions + deliveries.
 *
 * Retry schedule (docs/webhooks.md): 12 attempts over 24 h, Fibonacci-ish:
 *   1s, 2s, 5s, 15s, 60s, 5m, 30m, 1h, 2h, 4h, 8h, 16h
 *
 * Signatures: HMAC-SHA256 over `${t}.` + raw_body, emitted as
 *   X-Limen-Signature: t=<unix>,v1=<hex>
 *
 * Business-logic correctness (redeliveries across rotated secrets, exponential
 * body compression, dead-letter metrics export) is still TODO; see
 * `#TODO(webhook-ops)` markers.
 */

const RETRY_SCHEDULE_SECONDS: ReadonlyArray<number> = [
  1, 2, 5, 15, 60, 5 * 60, 30 * 60, 60 * 60, 2 * 60 * 60, 4 * 60 * 60, 8 * 60 * 60, 16 * 60 * 60,
];

export const WEBHOOK_EVENTS = [
  'payment.settled',
  'payment.reorged',
  'payment.upstream_failed',
  'payment.refund_requested',
  'payment.refunded',
  'endpoint.rate_limited',
  'compliance.blocked',
  'config.reloaded',
  'directory.listed',
  'directory.unlisted',
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export interface CreateSubscriptionInput {
  readonly projectId: string;
  readonly url: string;
  readonly events: ReadonlyArray<WebhookEvent>;
  readonly secret: string;
}

export interface EnqueueDeliveryInput {
  readonly projectId: string;
  readonly event: WebhookEvent;
  readonly data: Readonly<Record<string, unknown>>;
}

export interface WebhookServiceDeps {
  readonly db: Database;
}

export class WebhookService {
  constructor(private readonly deps: WebhookServiceDeps) {}

  async createSubscription(input: CreateSubscriptionInput): Promise<WebhookSubscription> {
    const id = newUuid();
    const inserted = await this.deps.db
      .insert(webhookSubscriptions)
      .values({
        id,
        projectId: input.projectId,
        url: input.url,
        events: [...input.events],
        secret: input.secret,
        enabled: true,
      })
      .returning();
    const row = inserted[0];
    if (row === undefined) {
      throw new LimenError({ code: ErrorCode.INTERNAL, detail: 'subscription insert returned no row' });
    }
    return row;
  }

  async deleteSubscription(id: string, projectId: string): Promise<boolean> {
    const res = await this.deps.db
      .delete(webhookSubscriptions)
      .where(and(eq(webhookSubscriptions.id, id), eq(webhookSubscriptions.projectId, projectId)))
      .returning({ id: webhookSubscriptions.id });
    return res.length > 0;
  }

  async rotateSubscriptionSecret(id: string, projectId: string, newSecret: string): Promise<WebhookSubscription> {
    const now = new Date();
    const overlapExpires = new Date(now.getTime() + 10 * 60 * 1000); // 10 minutes
    const updated = await this.deps.db.transaction(async (tx) => {
      const existing = await tx
        .select()
        .from(webhookSubscriptions)
        .where(and(eq(webhookSubscriptions.id, id), eq(webhookSubscriptions.projectId, projectId)))
        .limit(1);
      const current = existing[0];
      if (current === undefined) {
        throw new LimenError({ code: ErrorCode.NOT_FOUND, detail: 'subscription not found' });
      }
      const rows = await tx
        .update(webhookSubscriptions)
        .set({
          secret: newSecret,
          previousSecret: current.secret,
          previousSecretExpiresAt: overlapExpires,
          rotatedAt: now,
        })
        .where(eq(webhookSubscriptions.id, id))
        .returning();
      return rows[0];
    });
    if (updated === undefined) {
      throw new LimenError({ code: ErrorCode.INTERNAL, detail: 'rotate returned no row' });
    }
    return updated;
  }

  /**
   * Enqueue a webhook for every subscription on the project that is listening
   * for the event.  Returns the list of created delivery IDs.
   */
  async enqueue(input: EnqueueDeliveryInput): Promise<readonly string[]> {
    const subs = await this.deps.db
      .select()
      .from(webhookSubscriptions)
      .where(and(eq(webhookSubscriptions.projectId, input.projectId), eq(webhookSubscriptions.enabled, true)));

    const payload = {
      id: newUuid(),
      type: input.event,
      created_at: new Date().toISOString(),
      data: input.data,
    };

    const ids: string[] = [];
    for (const sub of subs) {
      if (!sub.events.includes(input.event)) continue;
      const id = newUuid();
      await this.deps.db.insert(webhookDeliveries).values({
        id,
        subscriptionId: sub.id,
        projectId: input.projectId,
        event: input.event,
        url: sub.url,
        payload,
        status: 'pending',
        attempt: 0,
        maxAttempts: RETRY_SCHEDULE_SECONDS.length,
        nextAttemptAt: new Date(),
      });
      ids.push(id);
    }
    return ids;
  }

  /**
   * Reset a delivery so the worker picks it up immediately.
   */
  async redeliver(id: string, projectId: string): Promise<WebhookDelivery> {
    const updated = await this.deps.db
      .update(webhookDeliveries)
      .set({ status: 'pending', nextAttemptAt: new Date(), lastError: null })
      .where(and(eq(webhookDeliveries.id, id), eq(webhookDeliveries.projectId, projectId)))
      .returning();
    const row = updated[0];
    if (row === undefined) {
      throw new LimenError({ code: ErrorCode.NOT_FOUND, detail: 'delivery not found' });
    }
    return row;
  }

  /**
   * Claim a batch of pending deliveries due now.  Used by the worker loop.
   * Caller is responsible for dispatching and then calling markDelivered /
   * markFailed.
   */
  async claimDueBatch(limit: number): Promise<readonly WebhookDelivery[]> {
    const now = new Date();
    return this.deps.db.transaction(async (tx) => {
      const due = await tx
        .select()
        .from(webhookDeliveries)
        .where(
          and(
            eq(webhookDeliveries.status, 'pending'),
            or(isNull(webhookDeliveries.nextAttemptAt), lt(webhookDeliveries.nextAttemptAt, now))!,
          ),
        )
        .orderBy(asc(webhookDeliveries.createdAt))
        .limit(limit);

      const ids = due.map((d) => d.id);
      if (ids.length === 0) return [];
      for (const id of ids) {
        await tx
          .update(webhookDeliveries)
          .set({ status: 'delivering' })
          .where(eq(webhookDeliveries.id, id));
      }
      return due;
    });
  }

  async markDelivered(id: string, responseCode: number, responseBody: string): Promise<void> {
    await this.deps.db
      .update(webhookDeliveries)
      .set({
        status: 'delivered',
        lastResponseCode: responseCode,
        lastResponseBody: responseBody.slice(0, 2048),
        deliveredAt: new Date(),
      })
      .where(eq(webhookDeliveries.id, id));
  }

  async markFailed(id: string, attempt: number, errorMessage: string, code: number | null): Promise<void> {
    const maxAttempts = RETRY_SCHEDULE_SECONDS.length;
    const nextIdx = attempt; // attempt is 1-based after increment, so schedule[attempt-0]
    const last = nextIdx >= maxAttempts;
    const delaySeconds = last ? 0 : (RETRY_SCHEDULE_SECONDS[nextIdx] ?? RETRY_SCHEDULE_SECONDS[RETRY_SCHEDULE_SECONDS.length - 1] ?? 60);
    const nextAt = last ? null : new Date(Date.now() + delaySeconds * 1000);

    await this.deps.db
      .update(webhookDeliveries)
      .set({
        status: last ? 'dead' : 'pending',
        attempt,
        lastError: errorMessage.slice(0, 1024),
        lastResponseCode: code,
        nextAttemptAt: nextAt,
      })
      .where(eq(webhookDeliveries.id, id));
  }

  /**
   * Dispatch a single delivery.  Returns whether it succeeded.  Uses the
   * current subscription secret.  Raw-body bytes are signed — not the JSON
   * re-serialised by the runtime.
   */
  async dispatch(delivery: WebhookDelivery): Promise<boolean> {
    const env = getEnv();
    const log = getLogger().child({ deliveryId: delivery.id, event: delivery.event });

    const rawBody = Buffer.from(JSON.stringify(delivery.payload), 'utf-8');

    // Resolve secret: prefer subscription secret; fallback to global for ad-hoc events.
    let secret = env.LIMEN_WEBHOOK_SIGNING_SECRET;
    if (delivery.subscriptionId !== null && delivery.subscriptionId !== undefined) {
      const sub = await this.deps.db
        .select({ secret: webhookSubscriptions.secret })
        .from(webhookSubscriptions)
        .where(eq(webhookSubscriptions.id, delivery.subscriptionId))
        .limit(1);
      if (sub[0] !== undefined) secret = sub[0].secret;
    }

    const { header: sigHeader } = signWebhook(secret, rawBody);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.LIMEN_WEBHOOK_TIMEOUT_MS);
    const started = process.hrtime.bigint();

    try {
      const resp = await fetch(delivery.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Limen-Webhook/1.0 (+https://limen.dev)',
          'X-Limen-Id': extractPayloadId(delivery.payload),
          'X-Limen-Event': delivery.event,
          'X-Limen-Signature': sigHeader,
          'X-Limen-Attempt': String(delivery.attempt + 1),
        },
        body: rawBody,
        signal: controller.signal,
      });
      const text = await resp.text();
      const dur = Number(process.hrtime.bigint() - started) / 1e9;
      metrics.webhookDispatchSeconds.labels(delivery.event, String(resp.status)).observe(dur);
      if (!resp.ok) {
        metrics.webhookDispatchesTotal.labels(delivery.event, 'failed').inc();
        await this.markFailed(delivery.id, delivery.attempt + 1, `upstream ${resp.status}: ${text.slice(0, 256)}`, resp.status);
        return false;
      }
      metrics.webhookDispatchesTotal.labels(delivery.event, 'delivered').inc();
      await this.markDelivered(delivery.id, resp.status, text);
      return true;
    } catch (err) {
      const dur = Number(process.hrtime.bigint() - started) / 1e9;
      metrics.webhookDispatchSeconds.labels(delivery.event, 'error').observe(dur);
      metrics.webhookDispatchesTotal.labels(delivery.event, 'error').inc();
      const message = err instanceof Error ? err.message : 'unknown';
      log.warn({ err: message }, 'webhook.dispatch.failed');
      await this.markFailed(delivery.id, delivery.attempt + 1, message, null);
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
}

function extractPayloadId(payload: unknown): string {
  if (typeof payload === 'object' && payload !== null && 'id' in payload) {
    const id = (payload as { id: unknown }).id;
    if (typeof id === 'string') return id;
  }
  return newUuid();
}

export const RETRY_SCHEDULE = RETRY_SCHEDULE_SECONDS;
