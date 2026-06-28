/**
 * Stripe webhook endpoint.
 *
 * Handles:
 *   checkout.session.completed           → mark purchase paid/completed + billing linkage
 *   checkout.session.expired             → mark purchase expired
 *   checkout.session.async_payment_failed
 *   checkout.session.async_payment_succeeded
 *   customer.subscription.created        → update registry billing status
 *   customer.subscription.updated        → update registry billing status
 *   customer.subscription.deleted        → set registry billing canceled
 *   invoice.payment_failed               → set registry billing past_due
 *   invoice.payment_succeeded            → restore registry billing active
 *
 * - Verifies Stripe signature (requires STRIPE_WEBHOOK_SECRET)
 * - Deduplicates by stripe_event_id
 * - Persists every event for audit
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  recordStripeWebhookEvent,
  markStripeWebhookProcessed,
  markStripeWebhookFailed,
} from '@/lib/stripe-webhook-repository';
import {
  getPurchaseByStripeSessionId,
  markPurchaseCompleted,
  markPurchaseExpired,
  markPurchaseFailed,
} from '@/lib/purchase-repository';
import type { OrganizationProfile } from '@/lib/organization-registry-types';
import { ensureOrganizationRegistry } from '@/lib/organization-registry-service';
import { getRegistryByPurchaseId } from '@/lib/organization-registry-repository';
import {
  updateRegistryBillingProfile,
  recordRegistryBillingEvent,
} from '@/lib/billing-repository';
import {
  mapStripeSubscriptionStatusToBillingStatus,
} from '@/lib/billing-status';
import {
  handleStripeSubscriptionLifecycleEvent,
  linkBuyerAccountToStripeCustomer,
} from '@/lib/stripe-billing-service';
import type { StripeSubscriptionStatus } from '@/lib/billing-types';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('[webhook] STRIPE_WEBHOOK_SECRET not configured');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 });
  }

  const rawBody = await req.text();
  const stripeSignature = req.headers.get('stripe-signature');

  if (!stripeSignature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  const Stripe = (await import('stripe')).default;
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
    apiVersion: '2026-06-24.dahlia',
  });

  let eventId: string;
  let eventType: string;
  let eventData: { object: Record<string, unknown> };

  try {
    const event = stripe.webhooks.constructEvent(rawBody, stripeSignature, webhookSecret);
    eventId = event.id;
    eventType = event.type;
    eventData = event.data as unknown as { object: Record<string, unknown> };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Signature verification failed';
    console.error('[webhook] Signature verification failed:', message);
    return NextResponse.json({ error: `Webhook signature invalid: ${message}` }, { status: 400 });
  }

  const { event: storedEvent, isDuplicate } = recordStripeWebhookEvent(
    eventId,
    eventType,
    rawBody,
  );

  if (isDuplicate) {
    console.log(`[webhook] Duplicate event ignored: ${eventId} (${eventType})`);
    return NextResponse.json({ received: true, duplicate: true });
  }

  void storedEvent;

  try {
    await handleStripeEvent(stripe, eventId, eventType, eventData.object);
    markStripeWebhookProcessed(eventId);
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'Unknown processing error';
    console.error(`[webhook] Failed to process event ${eventId}:`, reason);
    markStripeWebhookFailed(eventId, reason);
    return NextResponse.json({ received: true, error: reason });
  }

  return NextResponse.json({ received: true });
}

async function handleStripeEvent(
  stripe: { subscriptions: { retrieve: (id: string) => Promise<unknown> } },
  eventId: string,
  eventType: string,
  data: Record<string, unknown>,
): Promise<void> {
  // Subscription lifecycle events — data object IS the subscription
  if (
    eventType === 'customer.subscription.created' ||
    eventType === 'customer.subscription.updated' ||
    eventType === 'customer.subscription.deleted'
  ) {
    await handleStripeSubscriptionLifecycleEvent({ eventType, eventId, data });
    return;
  }

  // Invoice events — data object IS the invoice
  if (
    eventType === 'invoice.payment_failed' ||
    eventType === 'invoice.payment_succeeded'
  ) {
    await handleStripeSubscriptionLifecycleEvent({ eventType, eventId, data });
    return;
  }

  // Checkout session events
  const stripeSessionId = typeof data['id'] === 'string' ? data['id'] : undefined;
  if (!stripeSessionId) return;

  const purchase = getPurchaseByStripeSessionId(stripeSessionId);

  switch (eventType) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      if (!purchase) {
        console.warn(`[webhook] No purchase found for session ${stripeSessionId}`);
        return;
      }
      const buyerEmail =
        typeof data['customer_email'] === 'string' ? data['customer_email'] : undefined;
      const paymentIntent =
        typeof data['payment_intent'] === 'string' ? data['payment_intent'] : undefined;
      const stripeCustomerId =
        typeof data['customer'] === 'string' ? data['customer'] : undefined;
      const stripeSubscriptionId =
        typeof data['subscription'] === 'string' ? data['subscription'] : undefined;
      const sessionMetadata = (data['metadata'] as Record<string, string> | null) ?? {};
      const accountId = sessionMetadata['account_id'] ?? undefined;

      const updatedPurchase = markPurchaseCompleted(purchase.id, { buyerEmail, stripePaymentIntent: paymentIntent });
      if (updatedPurchase) {
        const orgProfile = updatedPurchase.metadata?.organization_profile as OrganizationProfile | undefined;
        ensureOrganizationRegistry({
          purchaseId: updatedPurchase.id,
          tier: updatedPurchase.tier,
          buyerEmail,
          stripeCustomerId,
          stripeSubscriptionId,
          organizationProfile: orgProfile ?? null,
        });

        // Link billing fields if org tier
        if (updatedPurchase.tier === 'organization_agent_registry') {
          const registry = getRegistryByPurchaseId(updatedPurchase.id);
          if (registry) {
            // Link account to Stripe customer
            if (accountId && stripeCustomerId) {
              await linkBuyerAccountToStripeCustomer({ accountId, stripeCustomerId, billingEmail: buyerEmail });
            }

            // If we have a subscription, fetch it for current status
            let subStatus: StripeSubscriptionStatus | null = null;
            let currentPeriodStart: string | null = null;
            let currentPeriodEnd: string | null = null;
            let cancelAtPeriodEnd = false;
            let trialEnd: string | null = null;

            if (stripeSubscriptionId && process.env.STRIPE_SECRET_KEY) {
              try {
                const subRaw = await stripe.subscriptions.retrieve(stripeSubscriptionId);
                const sub = subRaw as Record<string, unknown>;
                subStatus = (sub['status'] as StripeSubscriptionStatus) ?? null;
                currentPeriodStart = sub['current_period_start']
                  ? new Date((sub['current_period_start'] as number) * 1000).toISOString()
                  : null;
                currentPeriodEnd = sub['current_period_end']
                  ? new Date((sub['current_period_end'] as number) * 1000).toISOString()
                  : null;
                cancelAtPeriodEnd = Boolean(sub['cancel_at_period_end']);
                trialEnd = sub['trial_end']
                  ? new Date((sub['trial_end'] as number) * 1000).toISOString()
                  : null;
              } catch {
                // Non-fatal — billing status will be updated by subscription event
              }
            }

            const billingStatus = subStatus
              ? mapStripeSubscriptionStatusToBillingStatus(subStatus)
              : 'pending';

            updateRegistryBillingProfile({
              registryId: registry.registryId,
              stripeCustomerId,
              stripeSubscriptionId,
              subscriptionStatus: subStatus,
              billingStatus,
              currentPeriodStart,
              currentPeriodEnd,
              cancelAtPeriodEnd,
              trialEnd,
              stripeEventId: eventId,
            });

            recordRegistryBillingEvent({
              eventId,
              registryId: registry.registryId,
              accountId: accountId ?? null,
              stripeCustomerId: stripeCustomerId ?? null,
              stripeSubscriptionId: stripeSubscriptionId ?? null,
              eventType,
              subscriptionStatus: subStatus,
              billingStatus,
              payloadSummary: `checkout completed, tier=${updatedPurchase.tier}`,
            });
          }
        }
      }
      break;
    }
    case 'checkout.session.expired': {
      if (purchase) markPurchaseExpired(purchase.id);
      break;
    }
    case 'checkout.session.async_payment_failed': {
      if (purchase) markPurchaseFailed(purchase.id, 'async_payment_failed');
      break;
    }
    default:
      break;
  }
}
