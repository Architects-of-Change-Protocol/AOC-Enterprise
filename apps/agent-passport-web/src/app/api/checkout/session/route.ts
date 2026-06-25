import { NextRequest, NextResponse } from 'next/server';
import { isValidTierKey } from '@/lib/pricing';
import {
  createPurchaseRecord,
  updatePurchaseWithStripeSession,
  updatePurchaseMetadata,
} from '@/lib/purchase-repository';
import { validateOrganizationProfile, type SanitizedProfile } from '@/lib/organization-profile-validation';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let body: { tier?: string; organization_profile?: Record<string, unknown> };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { tier } = body;

  if (!tier || !isValidTierKey(tier)) {
    return NextResponse.json(
      {
        error: `Invalid tier. Must be one of: agent_passport_single, governed_agent, organization_agent_registry`,
      },
      { status: 400 },
    );
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    if (process.env.NODE_ENV === 'development') {
      return NextResponse.json(
        { error: 'Stripe is not configured. Set STRIPE_SECRET_KEY to enable checkout.' },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: 'Checkout not available.' }, { status: 503 });
  }

  const tierEnvVarMap: Record<string, string> = {
    agent_passport_single: 'STRIPE_PRICE_AGENT_PASSPORT_SINGLE',
    governed_agent: 'STRIPE_PRICE_GOVERNED_AGENT',
    organization_agent_registry: 'STRIPE_PRICE_ORG_AGENT_REGISTRY',
  };

  const priceEnvVar = tierEnvVarMap[tier];
  const priceId = process.env[priceEnvVar];

  if (!priceId) {
    return NextResponse.json(
      { error: `Stripe price not configured. Set ${priceEnvVar} environment variable.` },
      { status: 503 },
    );
  }

  // Validate organization profile for org tier
  let orgProfile: SanitizedProfile | null = null;
  if (tier === 'organization_agent_registry') {
    if (!body.organization_profile) {
      return NextResponse.json(
        { error: 'Organization profile is required for this tier', code: 'ORGANIZATION_PROFILE_REQUIRED' },
        { status: 400 },
      );
    }
    const validation = validateOrganizationProfile(body.organization_profile);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error, code: validation.code }, { status: 400 });
    }
    orgProfile = validation.profile;
  }

  // Create a pending purchase record first so we have a purchaseId for metadata
  const purchase = createPurchaseRecord(tier);

  // Persist org profile in purchase metadata
  if (orgProfile) {
    updatePurchaseMetadata(purchase.id, { organization_profile: orgProfile });
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_AGENT_PASSPORT_BASE_URL || 'http://localhost:3000';
  const successUrl = `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}&purchase_id=${purchase.id}`;
  const cancelUrl = `${baseUrl}/checkout/cancel?tier=${tier}`;

  try {
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(stripeSecretKey, { apiVersion: '2026-06-24.dahlia' });

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: tier === 'organization_agent_registry' ? 'subscription' : 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        tier,
        purchase_id: purchase.id,
        ...(orgProfile && {
          organization_name: orgProfile.organizationName.slice(0, 500),
          buyer_contact_email: (orgProfile.buyerContactEmail ?? '').slice(0, 500),
          buyer_contact_name: (orgProfile.buyerContactName ?? '').slice(0, 500),
          buyer_contact_role: (orgProfile.buyerContactRole ?? '').slice(0, 500),
          organization_country: (orgProfile.organizationCountry ?? '').slice(0, 500),
          organization_industry: (orgProfile.organizationIndustry ?? '').slice(0, 500),
          organization_size: (orgProfile.organizationSize ?? '').slice(0, 500),
          organization_use_case: (orgProfile.organizationUseCase ?? '').slice(0, 500),
        }),
      },
    });

    // Link the Stripe session ID to the purchase record
    updatePurchaseWithStripeSession(purchase.id, session.id);

    return NextResponse.json({
      url: session.url,
      sessionId: session.id,
      purchaseId: purchase.id,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Stripe checkout failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
