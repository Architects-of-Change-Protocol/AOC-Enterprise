/**
 * Stripe webhook event repository.
 *
 * Records every received event for audit and idempotency.
 * Deduplication: insert fails on UNIQUE(stripe_event_id) so callers can
 * check the return value to know if the event was already processed.
 */

import type Database from 'better-sqlite3';
import { getDb } from './db.js';

export interface StripeWebhookEvent {
  id: string;
  stripeEventId: string;
  eventType: string;
  rawPayload: string;
  processed: boolean;
  processedAt: string | null;
  failed: boolean;
  failureReason: string | null;
  createdAt: string;
}

interface WebhookRow {
  id: string;
  stripe_event_id: string;
  event_type: string;
  raw_payload: string;
  processed: number;
  processed_at: string | null;
  failed: number;
  failure_reason: string | null;
  created_at: string;
}

function rowToRecord(row: WebhookRow): StripeWebhookEvent {
  return {
    id: row.id,
    stripeEventId: row.stripe_event_id,
    eventType: row.event_type,
    rawPayload: row.raw_payload,
    processed: row.processed === 1,
    processedAt: row.processed_at,
    failed: row.failed === 1,
    failureReason: row.failure_reason,
    createdAt: row.created_at,
  };
}

function nanoid(): string {
  return `whe_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Record a received Stripe webhook event.
 * Returns { event, isDuplicate } — isDuplicate is true if the stripe_event_id
 * was already recorded (the existing record is returned).
 */
export function recordStripeWebhookEvent(
  stripeEventId: string,
  eventType: string,
  rawPayload: string,
  db?: Database.Database,
): { event: StripeWebhookEvent; isDuplicate: boolean } {
  const database = db ?? getDb();
  const now = new Date().toISOString();
  const id = nanoid();

  try {
    database
      .prepare(
        `INSERT INTO stripe_webhook_events
           (id, stripe_event_id, event_type, raw_payload, processed, failed, created_at)
         VALUES (?, ?, ?, ?, 0, 0, ?)`,
      )
      .run(id, stripeEventId, eventType, rawPayload, now);

    return { event: getStripeWebhookEventByStripeId(stripeEventId, database)!, isDuplicate: false };
  } catch (err: unknown) {
    // UNIQUE constraint violation = duplicate
    if (
      err instanceof Error &&
      err.message.includes('UNIQUE constraint failed')
    ) {
      return {
        event: getStripeWebhookEventByStripeId(stripeEventId, database)!,
        isDuplicate: true,
      };
    }
    throw err;
  }
}

export function getStripeWebhookEventByStripeId(
  stripeEventId: string,
  db?: Database.Database,
): StripeWebhookEvent | null {
  const database = db ?? getDb();
  const row = database
    .prepare(`SELECT * FROM stripe_webhook_events WHERE stripe_event_id = ?`)
    .get(stripeEventId) as WebhookRow | undefined;
  return row ? rowToRecord(row) : null;
}

export function markStripeWebhookProcessed(
  stripeEventId: string,
  db?: Database.Database,
): StripeWebhookEvent | null {
  const database = db ?? getDb();
  const now = new Date().toISOString();

  database
    .prepare(
      `UPDATE stripe_webhook_events
       SET processed = 1, processed_at = ?
       WHERE stripe_event_id = ?`,
    )
    .run(now, stripeEventId);

  return getStripeWebhookEventByStripeId(stripeEventId, database);
}

export function markStripeWebhookFailed(
  stripeEventId: string,
  reason: string,
  db?: Database.Database,
): StripeWebhookEvent | null {
  const database = db ?? getDb();
  const now = new Date().toISOString();

  database
    .prepare(
      `UPDATE stripe_webhook_events
       SET failed = 1, failure_reason = ?, processed_at = ?
       WHERE stripe_event_id = ?`,
    )
    .run(reason, now, stripeEventId);

  return getStripeWebhookEventByStripeId(stripeEventId, database);
}
