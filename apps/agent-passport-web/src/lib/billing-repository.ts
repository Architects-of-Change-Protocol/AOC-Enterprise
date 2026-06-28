import type Database from 'better-sqlite3';
import { getDb } from './db.js';
import type {
  RegistryBillingStatus,
  StripeSubscriptionStatus,
  RegistryBillingProfile,
  RegistryBillingEventRecord,
  BillingPortalSessionRecord,
} from './billing-types.js';
import { mapBillingStatusToOperationalState } from './billing-status.js';
import type { BuyerAccountRecord } from './buyer-account-types.js';

function nanoid(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

// ---------------------------------------------------------------------------
// Buyer account billing linkage
// ---------------------------------------------------------------------------

export function updateBuyerAccountStripeCustomer(
  opts: { accountId: string; stripeCustomerId: string; billingEmail?: string },
  db?: Database.Database,
): void {
  const database = db ?? getDb();
  const now = new Date().toISOString();
  database
    .prepare(
      `UPDATE buyer_accounts
       SET stripe_customer_id = ?,
           billing_email = COALESCE(?, billing_email),
           updated_at = ?
       WHERE account_id = ?`,
    )
    .run(opts.stripeCustomerId, opts.billingEmail ?? null, now, opts.accountId);
}

export function getBuyerAccountByStripeCustomerId(
  stripeCustomerId: string,
  db?: Database.Database,
): BuyerAccountRecord | null {
  const database = db ?? getDb();
  const row = database
    .prepare(`SELECT * FROM buyer_accounts WHERE stripe_customer_id = ? LIMIT 1`)
    .get(stripeCustomerId) as BuyerAccountRecord | undefined;
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Registry billing profile
// ---------------------------------------------------------------------------

interface RegistryBillingRow {
  registry_id: string;
  organization_name: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  billing_status: string | null;
  billing_status_updated_at: string | null;
  subscription_status: string | null;
  subscription_current_period_start: string | null;
  subscription_current_period_end: string | null;
  subscription_cancel_at_period_end: number | null;
  subscription_canceled_at: string | null;
  subscription_trial_end: string | null;
  billing_grace_period_ends_at: string | null;
  billing_last_event_id: string | null;
  updated_at: string;
}

export interface UpdateRegistryBillingProfileInput {
  registryId: string;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  subscriptionStatus?: StripeSubscriptionStatus | null;
  billingStatus: RegistryBillingStatus;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
  canceledAt?: string | null;
  trialEnd?: string | null;
  gracePeriodEndsAt?: string | null;
  stripeEventId?: string | null;
}

export function updateRegistryBillingProfile(
  input: UpdateRegistryBillingProfileInput,
  db?: Database.Database,
): void {
  const database = db ?? getDb();
  const now = new Date().toISOString();

  const parts: string[] = [
    'billing_status = ?',
    'billing_status_updated_at = ?',
    'updated_at = ?',
  ];
  const vals: unknown[] = [input.billingStatus, now, now];

  if (input.stripeCustomerId !== undefined) {
    parts.push('stripe_customer_id = COALESCE(stripe_customer_id, ?)');
    vals.push(input.stripeCustomerId);
  }
  if (input.stripeSubscriptionId !== undefined) {
    parts.push('stripe_subscription_id = COALESCE(stripe_subscription_id, ?)');
    vals.push(input.stripeSubscriptionId);
  }
  if (input.subscriptionStatus !== undefined) {
    parts.push('subscription_status = ?');
    vals.push(input.subscriptionStatus);
  }
  if (input.currentPeriodStart !== undefined) {
    parts.push('subscription_current_period_start = ?');
    vals.push(input.currentPeriodStart);
  }
  if (input.currentPeriodEnd !== undefined) {
    parts.push('subscription_current_period_end = ?');
    vals.push(input.currentPeriodEnd);
  }
  if (input.cancelAtPeriodEnd !== undefined) {
    parts.push('subscription_cancel_at_period_end = ?');
    vals.push(input.cancelAtPeriodEnd ? 1 : 0);
  }
  if (input.canceledAt !== undefined) {
    parts.push('subscription_canceled_at = ?');
    vals.push(input.canceledAt);
  }
  if (input.trialEnd !== undefined) {
    parts.push('subscription_trial_end = ?');
    vals.push(input.trialEnd);
  }
  if (input.gracePeriodEndsAt !== undefined) {
    parts.push('billing_grace_period_ends_at = ?');
    vals.push(input.gracePeriodEndsAt);
  }
  if (input.stripeEventId !== undefined) {
    parts.push('billing_last_event_id = ?');
    vals.push(input.stripeEventId);
  }

  vals.push(input.registryId);

  database
    .prepare(`UPDATE organization_registries SET ${parts.join(', ')} WHERE registry_id = ?`)
    .run(...(vals as Parameters<typeof database.prepare>));
}

export function getRegistryBillingProfile(
  registryId: string,
  db?: Database.Database,
): RegistryBillingProfile | null {
  const database = db ?? getDb();
  const row = database
    .prepare(
      `SELECT registry_id, organization_name, stripe_customer_id, stripe_subscription_id,
              billing_status, billing_status_updated_at, subscription_status,
              subscription_current_period_start, subscription_current_period_end,
              subscription_cancel_at_period_end, subscription_canceled_at,
              subscription_trial_end, billing_grace_period_ends_at, billing_last_event_id,
              updated_at
       FROM organization_registries WHERE registry_id = ? LIMIT 1`,
    )
    .get(registryId) as RegistryBillingRow | undefined;

  if (!row) return null;

  const billingStatus = (row.billing_status as RegistryBillingStatus | null) ?? 'unknown';

  return {
    registryId: row.registry_id,
    organizationName: row.organization_name,
    billingStatus,
    operationalState: mapBillingStatusToOperationalState(billingStatus),
    stripeCustomerId: row.stripe_customer_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    subscriptionStatus: row.subscription_status as StripeSubscriptionStatus | null,
    currentPeriodStart: row.subscription_current_period_start,
    currentPeriodEnd: row.subscription_current_period_end,
    cancelAtPeriodEnd: Boolean(row.subscription_cancel_at_period_end),
    canceledAt: row.subscription_canceled_at,
    trialEnd: row.subscription_trial_end,
    gracePeriodEndsAt: row.billing_grace_period_ends_at,
    updatedAt: row.billing_status_updated_at ?? row.updated_at,
  };
}

export function getRegistryByStripeSubscriptionId(
  subscriptionId: string,
  db?: Database.Database,
): { registryId: string } | null {
  const database = db ?? getDb();
  const row = database
    .prepare(`SELECT registry_id FROM organization_registries WHERE stripe_subscription_id = ? LIMIT 1`)
    .get(subscriptionId) as { registry_id: string } | undefined;
  return row ? { registryId: row.registry_id } : null;
}

export function getRegistryByStripeCustomerId(
  customerId: string,
  db?: Database.Database,
): { registryId: string } | null {
  const database = db ?? getDb();
  const row = database
    .prepare(`SELECT registry_id FROM organization_registries WHERE stripe_customer_id = ? ORDER BY created_at DESC LIMIT 1`)
    .get(customerId) as { registry_id: string } | undefined;
  return row ? { registryId: row.registry_id } : null;
}

// ---------------------------------------------------------------------------
// Billing events
// ---------------------------------------------------------------------------

export interface RecordBillingEventInput {
  eventId: string;
  registryId?: string | null;
  accountId?: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  eventType: string;
  subscriptionStatus?: string | null;
  billingStatus?: string | null;
  payloadSummary?: string | null;
}

export function recordRegistryBillingEvent(
  input: RecordBillingEventInput,
  db?: Database.Database,
): void {
  const database = db ?? getDb();
  const now = new Date().toISOString();
  const id = nanoid('bev');
  try {
    database
      .prepare(
        `INSERT INTO registry_billing_events
          (id, event_id, registry_id, account_id, stripe_customer_id, stripe_subscription_id,
           event_type, subscription_status, billing_status, payload_summary, created_at, processed_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        input.eventId,
        input.registryId ?? null,
        input.accountId ?? null,
        input.stripeCustomerId ?? null,
        input.stripeSubscriptionId ?? null,
        input.eventType,
        input.subscriptionStatus ?? null,
        input.billingStatus ?? null,
        input.payloadSummary ?? null,
        now,
        now,
      );
  } catch {
    // Duplicate event_id — silently ignore (UNIQUE constraint)
  }
}

export function hasProcessedBillingEvent(eventId: string, db?: Database.Database): boolean {
  const database = db ?? getDb();
  const row = database
    .prepare(`SELECT id FROM registry_billing_events WHERE event_id = ? LIMIT 1`)
    .get(eventId);
  return Boolean(row);
}

export function listBillingEventsForRegistry(
  registryId: string,
  limit = 50,
  db?: Database.Database,
): RegistryBillingEventRecord[] {
  const database = db ?? getDb();
  return database
    .prepare(
      `SELECT * FROM registry_billing_events WHERE registry_id = ? ORDER BY created_at DESC LIMIT ?`,
    )
    .all(registryId, limit) as RegistryBillingEventRecord[];
}

// ---------------------------------------------------------------------------
// Billing portal sessions
// ---------------------------------------------------------------------------

export interface CreateBillingPortalSessionInput {
  portalSessionId: string;
  registryId?: string | null;
  accountId?: string | null;
  stripeCustomerId: string;
  returnUrl: string;
}

export function createBillingPortalSession(
  input: CreateBillingPortalSessionInput,
  db?: Database.Database,
): BillingPortalSessionRecord {
  const database = db ?? getDb();
  const now = new Date().toISOString();
  const id = nanoid('bps');
  database
    .prepare(
      `INSERT INTO billing_portal_sessions
        (id, portal_session_id, registry_id, account_id, stripe_customer_id, return_url, created_at)
       VALUES (?,?,?,?,?,?,?)`,
    )
    .run(
      id,
      input.portalSessionId,
      input.registryId ?? null,
      input.accountId ?? null,
      input.stripeCustomerId,
      input.returnUrl,
      now,
    );
  return {
    id,
    portal_session_id: input.portalSessionId,
    registry_id: input.registryId ?? null,
    account_id: input.accountId ?? null,
    stripe_customer_id: input.stripeCustomerId,
    return_url: input.returnUrl,
    created_at: now,
  };
}
