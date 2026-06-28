import type Database from 'better-sqlite3';
import {
  getRegistryBillingProfile,
  updateRegistryBillingProfile,
  getRegistryByStripeSubscriptionId,
  getRegistryByStripeCustomerId,
  recordRegistryBillingEvent,
  createBillingPortalSession,
  updateBuyerAccountStripeCustomer,
} from './billing-repository.js';
import {
  mapStripeSubscriptionStatusToBillingStatus,
} from './billing-status.js';
import type { StripeSubscriptionStatus } from './billing-types.js';

function getStripeClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not configured');
  // Dynamic import used to keep Stripe server-side only
  const Stripe = require('stripe');
  return new Stripe(key, { apiVersion: '2026-06-24.dahlia' });
}

// ---------------------------------------------------------------------------
// Customer portal
// ---------------------------------------------------------------------------

export async function createStripeCustomerPortalSession(
  opts: {
    registryId: string;
    accountId?: string;
    returnUrl: string;
  },
  db?: Database.Database,
): Promise<{ url: string }> {
  const profile = getRegistryBillingProfile(opts.registryId, db);
  if (!profile?.stripeCustomerId) {
    throw new Error('BILLING_NO_STRIPE_CUSTOMER: No Stripe customer linked to this registry.');
  }

  const stripe = getStripeClient();
  const session = await stripe.billingPortal.sessions.create({
    customer: profile.stripeCustomerId,
    return_url: opts.returnUrl,
  });

  createBillingPortalSession(
    {
      portalSessionId: session.id,
      registryId: opts.registryId,
      accountId: opts.accountId ?? null,
      stripeCustomerId: profile.stripeCustomerId,
      returnUrl: opts.returnUrl,
    },
    db,
  );

  return { url: session.url as string };
}

// ---------------------------------------------------------------------------
// Subscription lifecycle handler
// ---------------------------------------------------------------------------

export async function handleStripeSubscriptionLifecycleEvent(
  opts: {
    eventType: string;
    eventId: string;
    data: Record<string, unknown>;
  },
  db?: Database.Database,
): Promise<void> {
  const { eventType, eventId, data } = opts;

  if (
    eventType === 'customer.subscription.created' ||
    eventType === 'customer.subscription.updated' ||
    eventType === 'customer.subscription.deleted'
  ) {
    await handleSubscriptionEvent(eventType, eventId, data, db);
  } else if (
    eventType === 'invoice.payment_failed' ||
    eventType === 'invoice.payment_succeeded'
  ) {
    await handleInvoiceEvent(eventType, eventId, data, db);
  }
}

async function handleSubscriptionEvent(
  eventType: string,
  eventId: string,
  sub: Record<string, unknown>,
  db?: Database.Database,
): Promise<void> {
  const subscriptionId = typeof sub['id'] === 'string' ? sub['id'] : null;
  const customerId = typeof sub['customer'] === 'string' ? sub['customer'] : null;
  const stripeStatus = typeof sub['status'] === 'string' ? sub['status'] as StripeSubscriptionStatus : null;

  const currentPeriodStart = sub['current_period_start']
    ? new Date((sub['current_period_start'] as number) * 1000).toISOString()
    : null;
  const currentPeriodEnd = sub['current_period_end']
    ? new Date((sub['current_period_end'] as number) * 1000).toISOString()
    : null;
  const trialEnd = sub['trial_end']
    ? new Date((sub['trial_end'] as number) * 1000).toISOString()
    : null;
  const canceledAt = sub['canceled_at']
    ? new Date((sub['canceled_at'] as number) * 1000).toISOString()
    : null;
  const cancelAtPeriodEnd = Boolean(sub['cancel_at_period_end']);

  // Resolve registry
  let registryId: string | null = null;
  if (subscriptionId) {
    const reg = getRegistryByStripeSubscriptionId(subscriptionId, db);
    if (reg) registryId = reg.registryId;
  }
  if (!registryId && customerId) {
    const reg = getRegistryByStripeCustomerId(customerId, db);
    if (reg) registryId = reg.registryId;
  }
  // Try metadata fallback
  if (!registryId) {
    const meta = sub['metadata'] as Record<string, string> | null;
    if (meta?.registry_id) registryId = meta.registry_id;
  }

  if (!registryId) {
    // Can't associate event — record a floating billing event for audit
    recordRegistryBillingEvent(
      {
        eventId,
        eventType,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        subscriptionStatus: stripeStatus,
        payloadSummary: `unresolved subscription event`,
      },
      db,
    );
    return;
  }

  const billingStatus = stripeStatus
    ? mapStripeSubscriptionStatusToBillingStatus(stripeStatus)
    : 'unknown';

  // Set grace period for past_due if not already set
  let gracePeriodEndsAt: string | undefined = undefined;
  if (billingStatus === 'past_due') {
    const existing = getRegistryBillingProfile(registryId, db);
    if (!existing?.gracePeriodEndsAt) {
      const grace = new Date();
      grace.setDate(grace.getDate() + 7);
      gracePeriodEndsAt = grace.toISOString();
    }
  } else if (billingStatus === 'active' || billingStatus === 'trialing') {
    // Clear grace period on recovery
    gracePeriodEndsAt = null as unknown as string;
  }

  updateRegistryBillingProfile(
    {
      registryId,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId,
      subscriptionStatus: stripeStatus,
      billingStatus,
      currentPeriodStart,
      currentPeriodEnd,
      cancelAtPeriodEnd,
      canceledAt,
      trialEnd,
      ...(gracePeriodEndsAt !== undefined ? { gracePeriodEndsAt } : {}),
      stripeEventId: eventId,
    },
    db,
  );

  recordRegistryBillingEvent(
    {
      eventId,
      registryId,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId,
      eventType,
      subscriptionStatus: stripeStatus,
      billingStatus,
      payloadSummary: `status=${stripeStatus}, period_end=${currentPeriodEnd}`,
    },
    db,
  );
}

async function handleInvoiceEvent(
  eventType: string,
  eventId: string,
  invoice: Record<string, unknown>,
  db?: Database.Database,
): Promise<void> {
  const subscriptionId = typeof invoice['subscription'] === 'string' ? invoice['subscription'] : null;
  const customerId = typeof invoice['customer'] === 'string' ? invoice['customer'] : null;

  let registryId: string | null = null;
  if (subscriptionId) {
    const reg = getRegistryByStripeSubscriptionId(subscriptionId, db);
    if (reg) registryId = reg.registryId;
  }
  if (!registryId && customerId) {
    const reg = getRegistryByStripeCustomerId(customerId, db);
    if (reg) registryId = reg.registryId;
  }

  if (!registryId) {
    recordRegistryBillingEvent(
      {
        eventId,
        eventType,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        payloadSummary: 'unresolved invoice event',
      },
      db,
    );
    return;
  }

  if (eventType === 'invoice.payment_failed') {
    const existing = getRegistryBillingProfile(registryId, db);
    const newGrace = existing?.gracePeriodEndsAt ?? (() => {
      const g = new Date();
      g.setDate(g.getDate() + 7);
      return g.toISOString();
    })();
    updateRegistryBillingProfile(
      {
        registryId,
        billingStatus: 'past_due',
        gracePeriodEndsAt: existing?.gracePeriodEndsAt ?? newGrace,
        stripeEventId: eventId,
      },
      db,
    );
    recordRegistryBillingEvent(
      { eventId, registryId, stripeCustomerId: customerId, stripeSubscriptionId: subscriptionId, eventType, billingStatus: 'past_due', payloadSummary: 'payment_failed' },
      db,
    );
  } else if (eventType === 'invoice.payment_succeeded') {
    const existing = getRegistryBillingProfile(registryId, db);
    if (existing?.subscriptionStatus === 'active' || existing?.subscriptionStatus === 'trialing') {
      const billingStatus = mapStripeSubscriptionStatusToBillingStatus(existing.subscriptionStatus);
      updateRegistryBillingProfile(
        {
          registryId,
          billingStatus,
          gracePeriodEndsAt: null as unknown as string,
          stripeEventId: eventId,
        },
        db,
      );
      recordRegistryBillingEvent(
        { eventId, registryId, stripeCustomerId: customerId, stripeSubscriptionId: subscriptionId, eventType, billingStatus, payloadSummary: 'payment_succeeded' },
        db,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export async function resolveStripeCustomerForRegistry(
  registryId: string,
  db?: Database.Database,
): Promise<string | null> {
  const profile = getRegistryBillingProfile(registryId, db);
  return profile?.stripeCustomerId ?? null;
}

export async function linkBuyerAccountToStripeCustomer(
  opts: { accountId: string; stripeCustomerId: string; billingEmail?: string },
  db?: Database.Database,
): Promise<void> {
  updateBuyerAccountStripeCustomer(opts, db);
}
