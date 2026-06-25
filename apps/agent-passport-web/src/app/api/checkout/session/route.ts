import { NextRequest, NextResponse } from 'next/server';
import { isValidTierKey } from '@/lib/pricing';

export async function POST(request: NextRequest) {
  let body: { tier?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { tier } = body;

  if (!tier || !isValidTierKey(tier)) {
    return NextResponse.json(
      { error: `Invalid tier. Must be one of: agent_passport_single, governed_agent, organization_agent_registry` },
      { status: 400 }
    );
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    if (process.env.NODE_ENV === 'development') {
      return NextResponse.json(
        { error: 'Stripe is not configured. Set STRIPE_SECRET_KEY to enable checkout.' },
        { status: 503 }
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
      { status: 503 }
    );
  }

  const baseUrl = process.env.NEXT_PUBLIC_AGENT_PASSPORT_BASE_URL || 'http://localhost:3000';
  const successUrl = `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}&tier=${tier}`;
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
      metadata: { tier },
    });

    return NextResponse.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Stripe checkout failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
