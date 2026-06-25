/**
 * Stripe webhook endpoint.
 *
 * Handles:
 *   checkout.session.completed           → mark purchase paid/completed
 *   checkout.session.expired             → mark purchase expired
 *   checkout.session.async_payment_failed
 *   checkout.session.async_payment_succeeded
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

export const dynamic = 'force-dynamic';

// Body parsing is handled manually via req.text() for Stripe signature verification

export async function POST(req: NextRequest): Promise<NextResponse> {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('[webhook] STRIPE_WEBHOOK_SECRET not configured');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 });
  }

  // Read raw body as text for signature verification
  const rawBody = await req.text();
  const stripeSignature = req.headers.get('stripe-signature');

  if (!stripeSignature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  // Dynamically import Stripe to keep it server-side only
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
    // Cast to loosen Stripe's union types — we handle a subset of events
    eventData = event.data as unknown as { object: Record<string, unknown> };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Signature verification failed';
    console.error('[webhook] Signature verification failed:', message);
    return NextResponse.json({ error: `Webhook signature invalid: ${message}` }, { status: 400 });
  }

  // Record event (deduplication check)
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
    await handleStripeEvent(eventType, eventData.object);
    markStripeWebhookProcessed(eventId);
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'Unknown processing error';
    console.error(`[webhook] Failed to process event ${eventId}:`, reason);
    markStripeWebhookFailed(eventId, reason);
    // Return 200 to prevent Stripe retries for business logic failures
    return NextResponse.json({ received: true, error: reason });
  }

  return NextResponse.json({ received: true });
}

async function handleStripeEvent(
  eventType: string,
  session: Record<string, unknown>,
): Promise<void> {
  const stripeSessionId = typeof session['id'] === 'string' ? session['id'] : undefined;
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
        typeof session['customer_email'] === 'string' ? session['customer_email'] : undefined;
      const paymentIntent =
        typeof session['payment_intent'] === 'string' ? session['payment_intent'] : undefined;
      const updatedPurchase = markPurchaseCompleted(purchase.id, { buyerEmail, stripePaymentIntent: paymentIntent });
      if (updatedPurchase) {
        // Read org profile from purchase metadata
        const orgProfile = updatedPurchase.metadata?.organization_profile as OrganizationProfile | undefined;
        ensureOrganizationRegistry({
          purchaseId: updatedPurchase.id,
          tier: updatedPurchase.tier,
          buyerEmail: buyerEmail,
          stripeCustomerId:
            typeof session['customer'] === 'string' ? session['customer'] : undefined,
          stripeSubscriptionId:
            typeof session['subscription'] === 'string' ? session['subscription'] : undefined,
          organizationProfile: orgProfile ?? null,
        });
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
