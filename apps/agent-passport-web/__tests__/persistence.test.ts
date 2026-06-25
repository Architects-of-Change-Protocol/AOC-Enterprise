import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { createTestDb } from '../src/lib/db.js';
import {
  createPurchaseRecord,
  markPurchaseCompleted,
  markPurchaseExpired,
  markPurchaseFailed,
  getPurchaseById,
  getPurchaseByStripeSessionId,
  canEnrollWithPurchase,
  markPurchaseEnrollmentStarted,
  markPurchasePassportIssued,
  updatePurchaseWithStripeSession,
} from '../src/lib/purchase-repository.js';
import {
  createPassportRecord,
  getPassportByPassportId,
  listPassports,
  updatePassportStatus,
} from '../src/lib/passport-repository.js';
import {
  recordStripeWebhookEvent,
  getStripeWebhookEventByStripeId,
  markStripeWebhookProcessed,
  markStripeWebhookFailed,
} from '../src/lib/stripe-webhook-repository.js';

// Each test uses an isolated in-memory DB
function makeDb(): Database.Database {
  return createTestDb();
}

describe('Purchase Repository', () => {
  let db: Database.Database;

  before(() => { db = makeDb(); });
  after(() => { db.close(); });

  it('createPurchaseRecord persists a pending purchase', () => {
    const p = createPurchaseRecord('agent_passport_single', db);
    assert.ok(p.id.startsWith('purchase_'));
    assert.equal(p.tier, 'agent_passport_single');
    assert.equal(p.status, 'pending');
    assert.equal(p.enrollmentStatus, 'not_started');
    assert.equal(p.passportId, null);
  });

  it('getPurchaseById returns the created record', () => {
    const p = createPurchaseRecord('governed_agent', db);
    const fetched = getPurchaseById(p.id, db);
    assert.ok(fetched !== null);
    assert.equal(fetched!.id, p.id);
    assert.equal(fetched!.tier, 'governed_agent');
  });

  it('updatePurchaseWithStripeSession links stripe session', () => {
    const p = createPurchaseRecord('agent_passport_single', db);
    const updated = updatePurchaseWithStripeSession(p.id, 'cs_test_123', db);
    assert.ok(updated !== null);
    assert.equal(updated!.stripeSessionId, 'cs_test_123');

    const bySession = getPurchaseByStripeSessionId('cs_test_123', db);
    assert.ok(bySession !== null);
    assert.equal(bySession!.id, p.id);
  });

  it('markPurchaseCompleted sets status and buyer info', () => {
    const p = createPurchaseRecord('agent_passport_single', db);
    const updated = markPurchaseCompleted(
      p.id,
      { buyerEmail: 'test@example.com', stripePaymentIntent: 'pi_test_456' },
      db,
    );
    assert.ok(updated !== null);
    assert.equal(updated!.status, 'completed');
    assert.equal(updated!.buyerEmail, 'test@example.com');
    assert.equal(updated!.stripePaymentIntent, 'pi_test_456');
    assert.ok(updated!.completedAt !== null);
  });

  it('markPurchaseExpired sets expired status', () => {
    const p = createPurchaseRecord('agent_passport_single', db);
    const updated = markPurchaseExpired(p.id, db);
    assert.equal(updated!.status, 'expired');
    assert.ok(updated!.expiredAt !== null);
  });

  it('markPurchaseFailed sets failed status and reason', () => {
    const p = createPurchaseRecord('agent_passport_single', db);
    const updated = markPurchaseFailed(p.id, 'card_declined', db);
    assert.equal(updated!.status, 'failed');
    assert.equal(updated!.failureReason, 'card_declined');
  });

  it('canEnrollWithPurchase returns false for pending', () => {
    const p = createPurchaseRecord('agent_passport_single', db);
    assert.equal(canEnrollWithPurchase(p.id, db), false);
  });

  it('canEnrollWithPurchase returns true for completed unpublished', () => {
    const p = createPurchaseRecord('agent_passport_single', db);
    markPurchaseCompleted(p.id, {}, db);
    assert.equal(canEnrollWithPurchase(p.id, db), true);
  });

  it('canEnrollWithPurchase returns false after passport issued', () => {
    const p = createPurchaseRecord('agent_passport_single', db);
    markPurchaseCompleted(p.id, {}, db);
    markPurchasePassportIssued(p.id, 'passport_abc', db);
    assert.equal(canEnrollWithPurchase(p.id, db), false);
  });

  it('markPurchaseEnrollmentStarted sets enrollment status', () => {
    const p = createPurchaseRecord('agent_passport_single', db);
    markPurchaseCompleted(p.id, {}, db);
    const updated = markPurchaseEnrollmentStarted(p.id, db);
    assert.equal(updated!.enrollmentStatus, 'started');
  });

  it('markPurchasePassportIssued links passport to purchase', () => {
    const p = createPurchaseRecord('governed_agent', db);
    markPurchaseCompleted(p.id, {}, db);
    const updated = markPurchasePassportIssued(p.id, 'passport_xyz', db);
    assert.equal(updated!.enrollmentStatus, 'passport_issued');
    assert.equal(updated!.passportId, 'passport_xyz');
  });
});

describe('Passport Repository', () => {
  let db: Database.Database;

  before(() => { db = makeDb(); });
  after(() => { db.close(); });

  it('createPassportRecord persists a passport', () => {
    const p = createPurchaseRecord('agent_passport_single', db);
    const passport = createPassportRecord('pp_test_001', p.id, '{"test":true}', db);
    assert.equal(passport.id, 'pp_test_001');
    assert.equal(passport.purchaseId, p.id);
    assert.equal(passport.status, 'active');
  });

  it('getPassportByPassportId retrieves by ID', () => {
    const p = createPurchaseRecord('agent_passport_single', db);
    createPassportRecord('pp_test_002', p.id, '{"data":"hello"}', db);
    const found = getPassportByPassportId('pp_test_002', db);
    assert.ok(found !== null);
    assert.equal(found!.passportData, '{"data":"hello"}');
  });

  it('listPassports returns all passports', () => {
    const db2 = makeDb();
    const p = createPurchaseRecord('governed_agent', db2);
    createPassportRecord('pp_list_001', p.id, '{}', db2);
    createPassportRecord('pp_list_002', p.id, '{}', db2);
    const list = listPassports(db2);
    assert.equal(list.length, 2);
    db2.close();
  });

  it('updatePassportStatus revokes a passport', () => {
    const p = createPurchaseRecord('agent_passport_single', db);
    createPassportRecord('pp_revoke_001', p.id, '{}', db);
    const updated = updatePassportStatus('pp_revoke_001', 'revoked', 'policy_violation', db);
    assert.equal(updated!.status, 'revoked');
    assert.equal(updated!.revokeReason, 'policy_violation');
    assert.ok(updated!.revokedAt !== null);
  });
});

describe('Stripe Webhook Repository', () => {
  let db: Database.Database;

  before(() => { db = makeDb(); });
  after(() => { db.close(); });

  it('recordStripeWebhookEvent persists an event', () => {
    const { event, isDuplicate } = recordStripeWebhookEvent(
      'evt_test_001',
      'checkout.session.completed',
      '{"id":"evt_test_001"}',
      db,
    );
    assert.equal(isDuplicate, false);
    assert.equal(event.stripeEventId, 'evt_test_001');
    assert.equal(event.eventType, 'checkout.session.completed');
    assert.equal(event.processed, false);
  });

  it('recordStripeWebhookEvent deduplicates by stripe_event_id', () => {
    recordStripeWebhookEvent('evt_dup_001', 'checkout.session.completed', '{}', db);
    const { isDuplicate } = recordStripeWebhookEvent(
      'evt_dup_001',
      'checkout.session.completed',
      '{}',
      db,
    );
    assert.equal(isDuplicate, true);
  });

  it('markStripeWebhookProcessed sets processed flag', () => {
    recordStripeWebhookEvent('evt_proc_001', 'checkout.session.completed', '{}', db);
    const updated = markStripeWebhookProcessed('evt_proc_001', db);
    assert.equal(updated!.processed, true);
    assert.ok(updated!.processedAt !== null);
  });

  it('markStripeWebhookFailed sets failed flag and reason', () => {
    recordStripeWebhookEvent('evt_fail_001', 'checkout.session.expired', '{}', db);
    const updated = markStripeWebhookFailed('evt_fail_001', 'purchase_not_found', db);
    assert.equal(updated!.failed, true);
    assert.equal(updated!.failureReason, 'purchase_not_found');
  });

  it('getStripeWebhookEventByStripeId retrieves event', () => {
    recordStripeWebhookEvent('evt_get_001', 'checkout.session.completed', '{"raw":"data"}', db);
    const event = getStripeWebhookEventByStripeId('evt_get_001', db);
    assert.ok(event !== null);
    assert.equal(event!.rawPayload, '{"raw":"data"}');
  });
});
