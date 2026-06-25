/**
 * Purchase repository — SQLite-backed CRUD for purchase records.
 */

import type Database from 'better-sqlite3';
import { getDb } from './db.js';

export type PurchaseStatus = 'pending' | 'completed' | 'expired' | 'failed';
export type EnrollmentStatus =
  | 'not_started'
  | 'started'
  | 'passport_issued';

export interface PurchaseRecord {
  id: string;
  tier: string;
  status: PurchaseStatus;
  buyerEmail: string | null;
  stripeSessionId: string | null;
  stripePaymentIntent: string | null;
  passportId: string | null;
  enrollmentStatus: EnrollmentStatus;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  expiredAt: string | null;
  failedAt: string | null;
  failureReason: string | null;
}

interface PurchaseRow {
  id: string;
  tier: string;
  status: string;
  buyer_email: string | null;
  stripe_session_id: string | null;
  stripe_payment_intent: string | null;
  passport_id: string | null;
  enrollment_status: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  expired_at: string | null;
  failed_at: string | null;
  failure_reason: string | null;
}

function rowToRecord(row: PurchaseRow): PurchaseRecord {
  return {
    id: row.id,
    tier: row.tier,
    status: row.status as PurchaseStatus,
    buyerEmail: row.buyer_email,
    stripeSessionId: row.stripe_session_id,
    stripePaymentIntent: row.stripe_payment_intent,
    passportId: row.passport_id,
    enrollmentStatus: row.enrollment_status as EnrollmentStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    expiredAt: row.expired_at,
    failedAt: row.failed_at,
    failureReason: row.failure_reason,
  };
}

function nanoid(): string {
  return `purchase_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createPurchaseRecord(
  tier: string,
  db?: Database.Database,
): PurchaseRecord {
  const database = db ?? getDb();
  const now = new Date().toISOString();
  const id = nanoid();

  database
    .prepare(
      `INSERT INTO purchases (id, tier, status, enrollment_status, created_at, updated_at)
       VALUES (?, ?, 'pending', 'not_started', ?, ?)`,
    )
    .run(id, tier, now, now);

  return getPurchaseById(id, database)!;
}

export function updatePurchaseWithStripeSession(
  purchaseId: string,
  stripeSessionId: string,
  db?: Database.Database,
): PurchaseRecord | null {
  const database = db ?? getDb();
  const now = new Date().toISOString();

  database
    .prepare(
      `UPDATE purchases SET stripe_session_id = ?, updated_at = ? WHERE id = ?`,
    )
    .run(stripeSessionId, now, purchaseId);

  return getPurchaseById(purchaseId, database);
}

export function markPurchaseCompleted(
  purchaseId: string,
  opts: {
    buyerEmail?: string;
    stripePaymentIntent?: string;
  } = {},
  db?: Database.Database,
): PurchaseRecord | null {
  const database = db ?? getDb();
  const now = new Date().toISOString();

  database
    .prepare(
      `UPDATE purchases
       SET status = 'completed',
           buyer_email = COALESCE(?, buyer_email),
           stripe_payment_intent = COALESCE(?, stripe_payment_intent),
           completed_at = ?,
           updated_at = ?
       WHERE id = ?`,
    )
    .run(
      opts.buyerEmail ?? null,
      opts.stripePaymentIntent ?? null,
      now,
      now,
      purchaseId,
    );

  return getPurchaseById(purchaseId, database);
}

export function markPurchaseExpired(
  purchaseId: string,
  db?: Database.Database,
): PurchaseRecord | null {
  const database = db ?? getDb();
  const now = new Date().toISOString();

  database
    .prepare(
      `UPDATE purchases SET status = 'expired', expired_at = ?, updated_at = ? WHERE id = ?`,
    )
    .run(now, now, purchaseId);

  return getPurchaseById(purchaseId, database);
}

export function markPurchaseFailed(
  purchaseId: string,
  reason?: string,
  db?: Database.Database,
): PurchaseRecord | null {
  const database = db ?? getDb();
  const now = new Date().toISOString();

  database
    .prepare(
      `UPDATE purchases
       SET status = 'failed', failed_at = ?, failure_reason = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(now, reason ?? null, now, purchaseId);

  return getPurchaseById(purchaseId, database);
}

export function getPurchaseById(
  id: string,
  db?: Database.Database,
): PurchaseRecord | null {
  const database = db ?? getDb();
  const row = database
    .prepare(`SELECT * FROM purchases WHERE id = ?`)
    .get(id) as PurchaseRow | undefined;
  return row ? rowToRecord(row) : null;
}

export function getPurchaseByStripeSessionId(
  stripeSessionId: string,
  db?: Database.Database,
): PurchaseRecord | null {
  const database = db ?? getDb();
  const row = database
    .prepare(`SELECT * FROM purchases WHERE stripe_session_id = ?`)
    .get(stripeSessionId) as PurchaseRow | undefined;
  return row ? rowToRecord(row) : null;
}

export function getPurchaseByPassportId(
  passportId: string,
  db?: Database.Database,
): PurchaseRecord | null {
  const database = db ?? getDb();
  const row = database
    .prepare(`SELECT * FROM purchases WHERE passport_id = ?`)
    .get(passportId) as PurchaseRow | undefined;
  return row ? rowToRecord(row) : null;
}

export function canEnrollWithPurchase(
  purchaseId: string,
  db?: Database.Database,
): boolean {
  const purchase = getPurchaseById(purchaseId, db);
  if (!purchase) return false;
  return (
    purchase.status === 'completed' &&
    purchase.enrollmentStatus !== 'passport_issued'
  );
}

export function markPurchaseEnrollmentStarted(
  purchaseId: string,
  db?: Database.Database,
): PurchaseRecord | null {
  const database = db ?? getDb();
  const now = new Date().toISOString();

  database
    .prepare(
      `UPDATE purchases SET enrollment_status = 'started', updated_at = ? WHERE id = ?`,
    )
    .run(now, purchaseId);

  return getPurchaseById(purchaseId, database);
}

export function markPurchasePassportIssued(
  purchaseId: string,
  passportId: string,
  db?: Database.Database,
): PurchaseRecord | null {
  const database = db ?? getDb();
  const now = new Date().toISOString();

  database
    .prepare(
      `UPDATE purchases
       SET enrollment_status = 'passport_issued',
           passport_id = ?,
           updated_at = ?
       WHERE id = ?`,
    )
    .run(passportId, now, purchaseId);

  return getPurchaseById(purchaseId, database);
}
