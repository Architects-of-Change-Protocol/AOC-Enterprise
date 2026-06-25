/**
 * GET /api/organization-registry/[registryId]/passports
 *
 * Returns passports linked to the registry. Requires valid access_token.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyRegistryAccess } from '@/lib/organization-registry-service';
import { listRegistryPassports } from '@/lib/organization-registry-repository';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { registryId: string } },
) {
  const { registryId } = params;
  const accessToken = req.nextUrl.searchParams.get('access_token') ?? '';

  const result = verifyRegistryAccess(registryId, accessToken);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: { code: result.errorCode ?? 'REGISTRY_ACCESS_DENIED', message: 'Registry access denied.' } },
      { status: result.errorCode === 'REGISTRY_NOT_FOUND' ? 404 : 403 },
    );
  }

  const passports = listRegistryPassports(registryId);

  return NextResponse.json({
    ok: true,
    data: {
      registryId,
      passports: passports.map(p => ({
        passportId: p.passportId,
        agentName: p.agentName,
        agentOwner: p.agentOwner,
        status: p.status,
        governanceStatus: p.governanceStatus,
        runtimeGuardReady: p.runtimeGuardReady,
        createdAt: p.createdAt,
        passportUrl: `/passport/${p.passportId}`,
        verifyUrl: `/verify/${p.passportId}`,
      })),
    },
  });
}
