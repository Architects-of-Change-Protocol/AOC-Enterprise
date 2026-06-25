/**
 * GET /api/organization-registry/[registryId]
 *
 * Returns registry summary. Requires valid access_token query param.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyRegistryAccess } from '@/lib/organization-registry-service';
import { getEntitlementByRegistryId, listRegistryPassports } from '@/lib/organization-registry-repository';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { registryId: string } },
) {
  const { registryId } = params;
  const accessToken = req.nextUrl.searchParams.get('access_token') ?? '';

  const result = verifyRegistryAccess(registryId, accessToken);
  if (!result.ok || !result.registry) {
    return NextResponse.json(
      { ok: false, error: { code: result.errorCode ?? 'REGISTRY_ACCESS_DENIED', message: 'Registry access denied.' } },
      { status: result.errorCode === 'REGISTRY_NOT_FOUND' ? 404 : 403 },
    );
  }

  const registry = result.registry;
  const entitlement = getEntitlementByRegistryId(registryId);
  const passports = listRegistryPassports(registryId);

  return NextResponse.json({
    ok: true,
    data: {
      registry: {
        registryId: registry.registryId,
        organizationName: registry.organizationName,
        buyerEmail: registry.buyerEmail,
        ownerName: registry.ownerName,
        registryStatus: registry.registryStatus,
        governanceLevel: registry.governanceLevel,
        maxPassports: registry.maxPassports,
        issuedPassports: registry.issuedPassports,
        remainingPassports: registry.remainingPassports,
        stripeSubscriptionId: registry.stripeSubscriptionId,
        createdAt: registry.createdAt,
        updatedAt: registry.updatedAt,
      },
      entitlement: entitlement
        ? {
            entitlementType: entitlement.entitlementType,
            maxQuantity: entitlement.maxQuantity,
            usedQuantity: entitlement.usedQuantity,
            remainingQuantity: entitlement.remainingQuantity,
            status: entitlement.status,
          }
        : null,
      passportCount: passports.length,
      activePassports: passports.filter(p => p.status === 'active').length,
      runtimeGuardReadyCount: passports.filter(p => p.runtimeGuardReady).length,
    },
  });
}
