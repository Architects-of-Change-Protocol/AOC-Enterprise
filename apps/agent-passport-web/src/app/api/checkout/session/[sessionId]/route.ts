/**
 * GET /api/checkout/session/[sessionId]
 *
 * Verifies a Stripe session and returns the associated purchase status.
 * For organization_agent_registry tier, also returns registry summary.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPurchaseByStripeSessionId } from '@/lib/purchase-repository';
import { getRegistryByPurchaseId, getEntitlementByRegistryId } from '@/lib/organization-registry-repository';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: { sessionId: string } },
) {
  const { sessionId } = params;

  if (!sessionId) {
    return NextResponse.json({ ok: false, error: 'Missing sessionId' }, { status: 400 });
  }

  const purchase = getPurchaseByStripeSessionId(sessionId);

  if (!purchase) {
    return NextResponse.json(
      { ok: false, error: 'Session not found', canEnroll: false },
      { status: 404 },
    );
  }

  const canEnroll =
    purchase.status === 'completed' &&
    purchase.enrollmentStatus !== 'passport_issued';

  const base = {
    ok: true,
    purchase: {
      id: purchase.id,
      tier: purchase.tier,
      status: purchase.status,
      enrollmentStatus: purchase.enrollmentStatus,
      passportId: purchase.passportId,
    },
    canEnroll,
  };

  if (purchase.tier === 'organization_agent_registry') {
    const registry = getRegistryByPurchaseId(purchase.id);
    if (registry) {
      const entitlement = getEntitlementByRegistryId(registry.registryId);
      return NextResponse.json({
        ...base,
        canEnroll: false, // org tier uses registry enrollment, not single-session enrollment
        registry: {
          registryId: registry.registryId,
          organizationName: registry.organizationName,
          registryStatus: registry.registryStatus,
          maxPassports: registry.maxPassports,
          issuedPassports: registry.issuedPassports,
          remainingPassports: registry.remainingPassports,
          entitlementStatus: entitlement?.status ?? null,
          adminAccessAvailable: false,
          message: 'Registry exists. Use the admin URL from your checkout confirmation to access the registry.',
        },
      });
    }

    return NextResponse.json({
      ...base,
      canEnroll: false,
      registry: null,
      registryPending: true,
      message: 'Registry is being prepared. If this persists, contact support.',
    });
  }

  return NextResponse.json(base);
}
