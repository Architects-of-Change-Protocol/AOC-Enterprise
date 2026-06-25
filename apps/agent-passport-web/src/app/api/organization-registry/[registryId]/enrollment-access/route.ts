/**
 * POST /api/organization-registry/[registryId]/enrollment-access
 *
 * Verifies registry capacity and returns an enrollment URL.
 * Does NOT consume capacity — capacity is consumed at passport issuance.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyRegistryAccess } from '@/lib/organization-registry-service';
import { getEntitlementByRegistryId } from '@/lib/organization-registry-repository';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { registryId: string } },
) {
  const { registryId } = params;

  let accessToken = '';
  try {
    const body = await req.json() as { access_token?: string };
    accessToken = body.access_token ?? '';
  } catch {
    accessToken = req.nextUrl.searchParams.get('access_token') ?? '';
  }

  const result = verifyRegistryAccess(registryId, accessToken);
  if (!result.ok || !result.registry) {
    return NextResponse.json(
      { ok: false, error: { code: result.errorCode ?? 'REGISTRY_ACCESS_DENIED', message: 'Registry access denied.' } },
      { status: result.errorCode === 'REGISTRY_NOT_FOUND' ? 404 : 403 },
    );
  }

  const registry = result.registry;

  if (registry.registryStatus !== 'active') {
    return NextResponse.json(
      { ok: false, error: { code: 'REGISTRY_INACTIVE', message: 'Registry is not active.' } },
      { status: 403 },
    );
  }

  const entitlement = getEntitlementByRegistryId(registryId);
  if (!entitlement) {
    return NextResponse.json(
      { ok: false, error: { code: 'REGISTRY_ENTITLEMENT_NOT_FOUND', message: 'Registry entitlement not found.' } },
      { status: 404 },
    );
  }

  if (entitlement.status !== 'active' || entitlement.remainingQuantity <= 0) {
    return NextResponse.json(
      { ok: false, error: { code: 'REGISTRY_CAPACITY_EXHAUSTED', message: 'Registry capacity is exhausted.' } },
      { status: 403 },
    );
  }

  const enrollUrl = `/enroll-agent?registry_id=${encodeURIComponent(registryId)}&access_token=${encodeURIComponent(accessToken)}`;

  return NextResponse.json({
    ok: true,
    enrollUrl,
    remainingCapacity: entitlement.remainingQuantity,
  });
}
