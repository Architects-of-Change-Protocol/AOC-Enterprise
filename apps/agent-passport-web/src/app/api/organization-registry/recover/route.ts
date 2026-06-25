import { NextRequest, NextResponse } from 'next/server';
import { getRegistryByRegistryId } from '@/lib/organization-registry-repository';
import { getPurchaseByStripeSessionId } from '@/lib/purchase-repository';
import { rotateRegistryAdminToken } from '@/lib/organization-registry-service';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body' }, { status: 400 });
  }

  const mode = typeof body.mode === 'string' ? body.mode : null;

  if (!mode || !['recovery_code', 'checkout_session'].includes(mode)) {
    return NextResponse.json(
      { ok: false, error: 'Invalid mode. Must be recovery_code or checkout_session', code: 'REGISTRY_RECOVERY_INVALID_MODE' },
      { status: 400 },
    );
  }

  if (mode === 'recovery_code') {
    const registryId = typeof body.registry_id === 'string' ? body.registry_id : null;
    const buyerContactEmail = typeof body.buyer_contact_email === 'string' ? body.buyer_contact_email : null;
    const recoveryCode = typeof body.recovery_code === 'string' ? body.recovery_code : null;

    if (!registryId) {
      return NextResponse.json({ ok: false, error: 'registry_id is required', code: 'REGISTRY_RECOVERY_NOT_FOUND' }, { status: 400 });
    }
    if (!buyerContactEmail || !recoveryCode) {
      return NextResponse.json({ ok: false, error: 'buyer_contact_email and recovery_code are required', code: 'REGISTRY_RECOVERY_INVALID_CODE' }, { status: 400 });
    }

    const registry = getRegistryByRegistryId(registryId);
    if (!registry) {
      return NextResponse.json({ ok: false, error: 'Registry not found', code: 'REGISTRY_RECOVERY_NOT_FOUND' }, { status: 404 });
    }

    const result = rotateRegistryAdminToken({
      registryId,
      recoveryCode,
      buyerContactEmail,
      reason: 'recovery_code_mode',
    });

    if ('error' in result) {
      const status = result.code === 'REGISTRY_RECOVERY_EMAIL_MISMATCH' ? 403 : 400;
      return NextResponse.json({ ok: false, error: result.error, code: result.code }, { status });
    }

    return NextResponse.json({ ok: true, data: result });
  }

  // checkout_session mode
  const sessionId = typeof body.session_id === 'string' ? body.session_id : null;
  const buyerContactEmail = typeof body.buyer_contact_email === 'string' ? body.buyer_contact_email : null;

  if (!sessionId || !buyerContactEmail) {
    return NextResponse.json({ ok: false, error: 'session_id and buyer_contact_email are required', code: 'REGISTRY_RECOVERY_INVALID_MODE' }, { status: 400 });
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    return NextResponse.json({ ok: false, error: 'Session-based recovery requires Stripe configuration', code: 'REGISTRY_RECOVERY_FAILED' }, { status: 503 });
  }

  try {
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(stripeSecretKey, { apiVersion: '2026-06-24.dahlia' });
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== 'paid') {
      return NextResponse.json({ ok: false, error: 'Checkout session is not paid', code: 'REGISTRY_RECOVERY_SESSION_NOT_PAID' }, { status: 403 });
    }

    const tier = session.metadata?.tier;
    if (tier !== 'organization_agent_registry') {
      return NextResponse.json({ ok: false, error: 'Session is not for an organization registry', code: 'REGISTRY_RECOVERY_SESSION_NOT_ORG_REGISTRY' }, { status: 403 });
    }

    const purchaseId = session.metadata?.purchase_id;
    if (!purchaseId) {
      return NextResponse.json({ ok: false, error: 'Cannot resolve purchase from session', code: 'REGISTRY_RECOVERY_FAILED' }, { status: 400 });
    }

    const purchase = getPurchaseByStripeSessionId(sessionId);
    if (!purchase) {
      return NextResponse.json({ ok: false, error: 'Purchase not found', code: 'REGISTRY_RECOVERY_NOT_FOUND' }, { status: 404 });
    }

    // Verify buyer email matches
    const storedEmail = purchase.buyerEmail;
    if (storedEmail && storedEmail.toLowerCase() !== buyerContactEmail.toLowerCase()) {
      return NextResponse.json({ ok: false, error: 'Buyer email does not match', code: 'REGISTRY_RECOVERY_EMAIL_MISMATCH' }, { status: 403 });
    }

    const { getRegistryByPurchaseId } = await import('@/lib/organization-registry-repository');
    const registry = getRegistryByPurchaseId(purchase.id);
    if (!registry) {
      return NextResponse.json({ ok: false, error: 'Registry not found for purchase', code: 'REGISTRY_RECOVERY_NOT_FOUND' }, { status: 404 });
    }

    // For checkout_session recovery, we directly rotate since stripe session + email = proof of ownership
    const { updateRegistryAdminToken, updateRegistryRecoveryCode, revokeRegistryAdminSessions, recordAdminAccessEvent } = await import('@/lib/organization-registry-repository');
    const { createRegistryAdminAccessToken, hashRegistryAdminAccessToken, createRegistryRecoveryCode, hashRegistryRecoveryCode } = await import('@/lib/registry-access-token');

    const newToken = createRegistryAdminAccessToken();
    const newTokenHash = hashRegistryAdminAccessToken(newToken);
    const newRecoveryCode = createRegistryRecoveryCode();
    const newRecoveryCodeHash = hashRegistryRecoveryCode(newRecoveryCode);
    const rotatedAt = new Date().toISOString();

    updateRegistryAdminToken(registry.registryId, newTokenHash);
    updateRegistryRecoveryCode(registry.registryId, newRecoveryCodeHash);
    revokeRegistryAdminSessions(registry.registryId);
    recordAdminAccessEvent(registry.registryId, 'admin_token_rotated', { reason: 'checkout_session_recovery' });

    const baseUrl = process.env.NEXT_PUBLIC_AGENT_PASSPORT_BASE_URL || 'http://localhost:3000';
    const adminUrl = `${baseUrl}/registry/admin?registry_id=${encodeURIComponent(registry.registryId)}&access_token=${encodeURIComponent(newToken)}`;

    return NextResponse.json({
      ok: true,
      data: { registryId: registry.registryId, newAccessToken: newToken, newRecoveryCode, adminUrl, rotatedAt },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Recovery failed';
    return NextResponse.json({ ok: false, error: message, code: 'REGISTRY_RECOVERY_FAILED' }, { status: 500 });
  }
}
