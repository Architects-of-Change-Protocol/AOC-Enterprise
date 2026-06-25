/**
 * GET /api/checkout/session/[sessionId]
 *
 * Verifies a Stripe session and returns the associated purchase status.
 * For organization_agent_registry tier, also returns registry summary.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPurchaseByStripeSessionId } from '@/lib/purchase-repository';
import { getRegistryByPurchaseId, getEntitlementByRegistryId } from '@/lib/organization-registry-repository';
import type { OrganizationProfile } from '@/lib/organization-registry-types';
import { ensureOrganizationRegistry } from '@/lib/organization-registry-service';

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
    let registry = getRegistryByPurchaseId(purchase.id);

    // If registry not yet created (webhook may be delayed), try to create it now
    if (!registry && purchase.status === 'completed') {
      const orgProfile = purchase.metadata?.organization_profile as OrganizationProfile | undefined;
      const result = ensureOrganizationRegistry({
        purchaseId: purchase.id,
        tier: purchase.tier,
        buyerEmail: purchase.buyerEmail ?? undefined,
        organizationProfile: orgProfile ?? null,
      });
      if (result) {
        registry = result.registry;
        // Expose recovery code and token only on first creation
        if (result.wasCreated && result.adminAccessToken && result.recoveryCode) {
          const entitlement = getEntitlementByRegistryId(registry.registryId);
          const baseUrl = process.env.NEXT_PUBLIC_AGENT_PASSPORT_BASE_URL || 'http://localhost:3000';
          const adminUrl = `/registry/admin?registry_id=${encodeURIComponent(registry.registryId)}&access_token=${encodeURIComponent(result.adminAccessToken)}`;
          return NextResponse.json({
            ...base,
            canEnroll: false,
            registry: {
              registryId: registry.registryId,
              organizationName: registry.organizationName,
              registryStatus: registry.registryStatus,
              maxPassports: registry.maxPassports,
              issuedPassports: registry.issuedPassports,
              remainingPassports: registry.remainingPassports,
              entitlementStatus: entitlement?.status ?? null,
              adminAccessToken: result.adminAccessToken,
              recoveryCode: result.recoveryCode,
              adminUrl,
              baseUrl,
              profileCompleted: Boolean(registry.profileCompletedAt),
              message: 'Registry created. Save your admin URL and recovery code securely.',
            },
          });
        }
      }
    }

    if (registry) {
      const entitlement = getEntitlementByRegistryId(registry.registryId);
      return NextResponse.json({
        ...base,
        canEnroll: false,
        registry: {
          registryId: registry.registryId,
          organizationName: registry.organizationName,
          registryStatus: registry.registryStatus,
          maxPassports: registry.maxPassports,
          issuedPassports: registry.issuedPassports,
          remainingPassports: registry.remainingPassports,
          entitlementStatus: entitlement?.status ?? null,
          adminAccessAvailable: false,
          profileCompleted: Boolean(registry.profileCompletedAt),
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
