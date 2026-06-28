import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type Database from 'better-sqlite3';
import { createTestDb } from '../src/lib/db.js';
import {
  mapStripeSubscriptionStatusToBillingStatus,
  mapBillingStatusToOperationalState,
  isBillingStatusOperational,
  isBillingStatusEnrollmentAllowed,
  isBillingStatusExportGenerationAllowed,
  isBillingStatusExistingExportDownloadAllowed,
} from '../src/lib/billing-status.js';
import {
  updateBuyerAccountStripeCustomer,
  getBuyerAccountByStripeCustomerId,
  updateRegistryBillingProfile,
  getRegistryBillingProfile,
  getRegistryByStripeSubscriptionId,
  getRegistryByStripeCustomerId,
  recordRegistryBillingEvent,
  hasProcessedBillingEvent,
  listBillingEventsForRegistry,
  createBillingPortalSession,
} from '../src/lib/billing-repository.js';
import {
  requireRegistryBillingForAction,
  getRegistryBillingEnforcementState,
} from '../src/lib/registry-billing-enforcement.js';
import { createBuyerAccount } from '../src/lib/buyer-account-repository.js';
import { createOrganizationRegistry } from '../src/lib/organization-registry-repository.js';

let db: Database.Database;

before(() => {
  db = createTestDb();
});

after(() => {
  db.close();
});

// ---------------------------------------------------------------------------
// Billing status mapping
// ---------------------------------------------------------------------------

describe('mapStripeSubscriptionStatusToBillingStatus', () => {
  it('maps active to active', () => {
    assert.equal(mapStripeSubscriptionStatusToBillingStatus('active'), 'active');
  });
  it('maps trialing to trialing', () => {
    assert.equal(mapStripeSubscriptionStatusToBillingStatus('trialing'), 'trialing');
  });
  it('maps past_due to past_due', () => {
    assert.equal(mapStripeSubscriptionStatusToBillingStatus('past_due'), 'past_due');
  });
  it('maps unpaid to suspended', () => {
    assert.equal(mapStripeSubscriptionStatusToBillingStatus('unpaid'), 'suspended');
  });
  it('maps canceled to canceled', () => {
    assert.equal(mapStripeSubscriptionStatusToBillingStatus('canceled'), 'canceled');
  });
  it('maps incomplete to pending', () => {
    assert.equal(mapStripeSubscriptionStatusToBillingStatus('incomplete'), 'pending');
  });
  it('maps incomplete_expired to suspended', () => {
    assert.equal(mapStripeSubscriptionStatusToBillingStatus('incomplete_expired'), 'suspended');
  });
  it('maps paused to suspended', () => {
    assert.equal(mapStripeSubscriptionStatusToBillingStatus('paused'), 'suspended');
  });
});

// ---------------------------------------------------------------------------
// Operational state mapping
// ---------------------------------------------------------------------------

describe('mapBillingStatusToOperationalState', () => {
  it('active -> operational', () => {
    assert.equal(mapBillingStatusToOperationalState('active'), 'operational');
  });
  it('trialing -> operational', () => {
    assert.equal(mapBillingStatusToOperationalState('trialing'), 'operational');
  });
  it('past_due -> warning', () => {
    assert.equal(mapBillingStatusToOperationalState('past_due'), 'warning');
  });
  it('pending -> restricted', () => {
    assert.equal(mapBillingStatusToOperationalState('pending'), 'restricted');
  });
  it('unknown -> restricted', () => {
    assert.equal(mapBillingStatusToOperationalState('unknown'), 'restricted');
  });
  it('suspended -> suspended', () => {
    assert.equal(mapBillingStatusToOperationalState('suspended'), 'suspended');
  });
  it('canceled -> suspended', () => {
    assert.equal(mapBillingStatusToOperationalState('canceled'), 'suspended');
  });
});

// ---------------------------------------------------------------------------
// Billing status predicates
// ---------------------------------------------------------------------------

describe('isBillingStatusOperational', () => {
  it('active is operational', () => assert.equal(isBillingStatusOperational('active'), true));
  it('trialing is operational', () => assert.equal(isBillingStatusOperational('trialing'), true));
  it('past_due is not operational', () => assert.equal(isBillingStatusOperational('past_due'), false));
  it('suspended is not operational', () => assert.equal(isBillingStatusOperational('suspended'), false));
});

describe('isBillingStatusEnrollmentAllowed', () => {
  it('active allows enrollment', () => assert.equal(isBillingStatusEnrollmentAllowed('active'), true));
  it('trialing allows enrollment', () => assert.equal(isBillingStatusEnrollmentAllowed('trialing'), true));
  it('past_due with future grace period allows enrollment', () => {
    const future = new Date(Date.now() + 7 * 86400000).toISOString();
    assert.equal(isBillingStatusEnrollmentAllowed('past_due', future), true);
  });
  it('past_due with expired grace period blocks enrollment', () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    assert.equal(isBillingStatusEnrollmentAllowed('past_due', past), false);
  });
  it('past_due without grace period blocks enrollment', () => {
    assert.equal(isBillingStatusEnrollmentAllowed('past_due', null), false);
  });
  it('suspended blocks enrollment', () => assert.equal(isBillingStatusEnrollmentAllowed('suspended'), false));
  it('canceled blocks enrollment', () => assert.equal(isBillingStatusEnrollmentAllowed('canceled'), false));
});

describe('isBillingStatusExportGenerationAllowed', () => {
  it('active allows export generation', () => assert.equal(isBillingStatusExportGenerationAllowed('active'), true));
  it('suspended blocks export generation', () => assert.equal(isBillingStatusExportGenerationAllowed('suspended'), false));
  it('canceled blocks export generation', () => assert.equal(isBillingStatusExportGenerationAllowed('canceled'), false));
});

describe('isBillingStatusExistingExportDownloadAllowed', () => {
  it('always allows download regardless of status', () => {
    assert.equal(isBillingStatusExistingExportDownloadAllowed('suspended'), true);
    assert.equal(isBillingStatusExistingExportDownloadAllowed('canceled'), true);
    assert.equal(isBillingStatusExistingExportDownloadAllowed('active'), true);
  });
});

// ---------------------------------------------------------------------------
// Billing repository
// ---------------------------------------------------------------------------

describe('billing-repository: buyer account stripe customer', () => {
  it('links and retrieves buyer account by Stripe customer ID', () => {
    const account = createBuyerAccount({ email: 'billing-test@example.com', displayName: null, passwordHash: 'x' }, db);
    updateBuyerAccountStripeCustomer({ accountId: account.account_id, stripeCustomerId: 'cus_test123', billingEmail: 'billing@example.com' }, db);
    const found = getBuyerAccountByStripeCustomerId('cus_test123', db);
    assert.ok(found);
    assert.equal(found.account_id, account.account_id);
  });

  it('returns null for unknown Stripe customer ID', () => {
    const found = getBuyerAccountByStripeCustomerId('cus_nonexistent', db);
    assert.equal(found, null);
  });
});

describe('billing-repository: registry billing profile', () => {
  let registryId: string;

  before(() => {
    const reg = createOrganizationRegistry({
      purchaseId: `purchase_billing_${Date.now()}`,
      organizationName: 'Billing Test Org',
      buyerEmail: 'owner@billingtest.com',
    }, db);
    registryId = reg.registryId;
  });

  it('returns unknown billing status for registry without billing data', () => {
    const profile = getRegistryBillingProfile(registryId, db);
    assert.ok(profile);
    assert.equal(profile.billingStatus, 'unknown');
    assert.equal(profile.operationalState, 'restricted');
  });

  it('updates and retrieves billing profile', () => {
    updateRegistryBillingProfile({
      registryId,
      stripeCustomerId: 'cus_repo_test',
      stripeSubscriptionId: 'sub_repo_test',
      subscriptionStatus: 'active',
      billingStatus: 'active',
      currentPeriodStart: '2025-06-01T00:00:00.000Z',
      currentPeriodEnd: '2025-07-01T00:00:00.000Z',
      cancelAtPeriodEnd: false,
    }, db);

    const profile = getRegistryBillingProfile(registryId, db);
    assert.ok(profile);
    assert.equal(profile.billingStatus, 'active');
    assert.equal(profile.operationalState, 'operational');
    assert.equal(profile.stripeCustomerId, 'cus_repo_test');
    assert.equal(profile.stripeSubscriptionId, 'sub_repo_test');
    assert.equal(profile.subscriptionStatus, 'active');
    assert.equal(profile.currentPeriodEnd, '2025-07-01T00:00:00.000Z');
    assert.equal(profile.cancelAtPeriodEnd, false);
  });

  it('finds registry by Stripe subscription ID', () => {
    const found = getRegistryByStripeSubscriptionId('sub_repo_test', db);
    assert.ok(found);
    assert.equal(found.registryId, registryId);
  });

  it('finds registry by Stripe customer ID', () => {
    const found = getRegistryByStripeCustomerId('cus_repo_test', db);
    assert.ok(found);
    assert.equal(found.registryId, registryId);
  });

  it('returns null for unknown subscription ID', () => {
    assert.equal(getRegistryByStripeSubscriptionId('sub_unknown_xyz', db), null);
  });
});

describe('billing-repository: billing events', () => {
  it('records a billing event', () => {
    recordRegistryBillingEvent({
      eventId: 'evt_test_001',
      eventType: 'customer.subscription.created',
      billingStatus: 'active',
      payloadSummary: 'test event',
    }, db);
    assert.equal(hasProcessedBillingEvent('evt_test_001', db), true);
  });

  it('duplicate event is idempotent', () => {
    recordRegistryBillingEvent({ eventId: 'evt_dup_001', eventType: 'test', billingStatus: 'active' }, db);
    // Should not throw
    recordRegistryBillingEvent({ eventId: 'evt_dup_001', eventType: 'test', billingStatus: 'suspended' }, db);
    assert.equal(hasProcessedBillingEvent('evt_dup_001', db), true);
  });

  it('returns false for unknown event ID', () => {
    assert.equal(hasProcessedBillingEvent('evt_nonexistent_xyz', db), false);
  });

  it('lists billing events for a registry', () => {
    const reg = createOrganizationRegistry({
      purchaseId: `purchase_events_${Date.now()}`,
      organizationName: 'Events Test Org',
    }, db);
    const rId = reg.registryId;

    recordRegistryBillingEvent({ eventId: `evt_list_1_${Date.now()}`, registryId: rId, eventType: 'invoice.payment_succeeded', billingStatus: 'active' }, db);
    recordRegistryBillingEvent({ eventId: `evt_list_2_${Date.now()}`, registryId: rId, eventType: 'invoice.payment_failed', billingStatus: 'past_due' }, db);

    const events = listBillingEventsForRegistry(rId, 10, db);
    assert.ok(events.length >= 2);
    assert.ok(events.every(e => e.registry_id === rId));
  });
});

describe('billing-repository: portal sessions', () => {
  it('creates a billing portal session record', () => {
    const session = createBillingPortalSession({
      portalSessionId: 'bps_test_001',
      registryId: 'registry_test_portal',
      accountId: 'acct_test_portal',
      stripeCustomerId: 'cus_portal_test',
      returnUrl: '/account/dashboard?billing=returned',
    }, db);
    assert.equal(session.portal_session_id, 'bps_test_001');
    assert.equal(session.stripe_customer_id, 'cus_portal_test');
    assert.equal(session.registry_id, 'registry_test_portal');
  });
});

// ---------------------------------------------------------------------------
// Billing enforcement
// ---------------------------------------------------------------------------

describe('requireRegistryBillingForAction', () => {
  it('view_registry always allowed', () => {
    const r = requireRegistryBillingForAction({ billingStatus: 'suspended', gracePeriodEndsAt: null, action: 'view_registry' });
    assert.equal(r.allowed, true);
  });

  it('manage_billing always allowed', () => {
    const r = requireRegistryBillingForAction({ billingStatus: 'canceled', gracePeriodEndsAt: null, action: 'manage_billing' });
    assert.equal(r.allowed, true);
  });

  it('download_export always allowed', () => {
    const r = requireRegistryBillingForAction({ billingStatus: 'suspended', gracePeriodEndsAt: null, action: 'download_export' });
    assert.equal(r.allowed, true);
  });

  it('active allows enroll_agent', () => {
    const r = requireRegistryBillingForAction({ billingStatus: 'active', gracePeriodEndsAt: null, action: 'enroll_agent' });
    assert.equal(r.allowed, true);
  });

  it('suspended blocks enroll_agent', () => {
    const r = requireRegistryBillingForAction({ billingStatus: 'suspended', gracePeriodEndsAt: null, action: 'enroll_agent' });
    assert.equal(r.allowed, false);
    assert.ok(r.reason);
  });

  it('canceled blocks enroll_agent', () => {
    const r = requireRegistryBillingForAction({ billingStatus: 'canceled', gracePeriodEndsAt: null, action: 'enroll_agent' });
    assert.equal(r.allowed, false);
  });

  it('past_due with active grace period allows issue_passport', () => {
    const future = new Date(Date.now() + 86400000 * 3).toISOString();
    const r = requireRegistryBillingForAction({ billingStatus: 'past_due', gracePeriodEndsAt: future, action: 'issue_passport' });
    assert.equal(r.allowed, true);
  });

  it('past_due with expired grace period blocks issue_passport', () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    const r = requireRegistryBillingForAction({ billingStatus: 'past_due', gracePeriodEndsAt: past, action: 'issue_passport' });
    assert.equal(r.allowed, false);
  });

  it('suspended blocks generate_export', () => {
    const r = requireRegistryBillingForAction({ billingStatus: 'suspended', gracePeriodEndsAt: null, action: 'generate_export' });
    assert.equal(r.allowed, false);
  });

  it('active allows generate_export', () => {
    const r = requireRegistryBillingForAction({ billingStatus: 'active', gracePeriodEndsAt: null, action: 'generate_export' });
    assert.equal(r.allowed, true);
  });

  it('canceled blocks manage_team', () => {
    const r = requireRegistryBillingForAction({ billingStatus: 'canceled', gracePeriodEndsAt: null, action: 'manage_team' });
    assert.equal(r.allowed, false);
  });

  it('past_due allows manage_team', () => {
    const r = requireRegistryBillingForAction({ billingStatus: 'past_due', gracePeriodEndsAt: null, action: 'manage_team' });
    assert.equal(r.allowed, true);
  });
});

describe('getRegistryBillingEnforcementState', () => {
  it('returns unknown for registry without billing data', async () => {
    const reg = createOrganizationRegistry({
      purchaseId: `purchase_enforcement_${Date.now()}`,
      organizationName: 'Enforcement Test Org',
    }, db);
    const state = await getRegistryBillingEnforcementState(reg.registryId, db);
    assert.equal(state.billingStatus, 'unknown');
    assert.equal(state.operationalState, 'restricted');
  });

  it('returns billing state for registry with billing data', async () => {
    const reg = createOrganizationRegistry({
      purchaseId: `purchase_enf2_${Date.now()}`,
      organizationName: 'Enforcement Test Org 2',
    }, db);
    updateRegistryBillingProfile({ registryId: reg.registryId, billingStatus: 'active', subscriptionStatus: 'active' }, db);
    const state = await getRegistryBillingEnforcementState(reg.registryId, db);
    assert.equal(state.billingStatus, 'active');
    assert.equal(state.operationalState, 'operational');
  });
});
