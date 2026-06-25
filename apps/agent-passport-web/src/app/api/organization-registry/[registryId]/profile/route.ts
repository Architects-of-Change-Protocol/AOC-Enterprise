import { NextRequest, NextResponse } from 'next/server';
import { resolveAdminAccessFromRequest } from '@/lib/registry-admin-access';
import {
  getRegistryByRegistryId,
  updateRegistryProfile,
} from '@/lib/organization-registry-repository';
import { validateOrganizationProfile } from '@/lib/organization-profile-validation';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { registryId: string } },
) {
  const { registryId } = params;

  const access = resolveAdminAccessFromRequest(registryId, request);
  if (!access.ok) {
    return NextResponse.json(
      { ok: false, error: 'Access denied', code: 'REGISTRY_PROFILE_ACCESS_DENIED' },
      { status: 403 },
    );
  }

  const registry = getRegistryByRegistryId(registryId);
  if (!registry) {
    return NextResponse.json({ ok: false, error: 'Registry not found' }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    data: {
      profile: {
        organizationName: registry.organizationName,
        organizationWebsite: registry.organizationWebsite,
        organizationCountry: registry.organizationCountry,
        organizationIndustry: registry.organizationIndustry,
        organizationSize: registry.organizationSize,
        organizationUseCase: registry.organizationUseCase,
        buyerContactName: registry.buyerContactName,
        buyerContactEmail: registry.buyerContactEmail,
        buyerContactRole: registry.buyerContactRole,
      },
      profileCompleted: Boolean(registry.profileCompletedAt),
      profileCompletedAt: registry.profileCompletedAt,
      profileUpdatedAt: registry.profileUpdatedAt,
    },
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { registryId: string } },
) {
  const { registryId } = params;

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body' }, { status: 400 });
  }

  // Allow access_token in body OR from request (cookie/query)
  const accessToken = typeof body.access_token === 'string' ? body.access_token : undefined;
  const access = resolveAdminAccessFromRequest(
    registryId,
    // Inject token into a modified request URL if provided in body
    accessToken
      ? new NextRequest(
          new URL(`${request.url}${request.url.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(accessToken)}`),
          request,
        )
      : request,
  );
  if (!access.ok) {
    return NextResponse.json(
      { ok: false, error: 'Access denied', code: 'REGISTRY_PROFILE_ACCESS_DENIED' },
      { status: 403 },
    );
  }

  const profileInput = (body.profile ?? body) as Record<string, unknown>;
  const validation = validateOrganizationProfile(profileInput);
  if (!validation.ok) {
    return NextResponse.json(
      { ok: false, error: validation.error, code: validation.code },
      { status: 400 },
    );
  }

  try {
    updateRegistryProfile(registryId, validation.profile);
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Failed to update profile', code: 'REGISTRY_PROFILE_UPDATE_FAILED' },
      { status: 500 },
    );
  }

  const updated = getRegistryByRegistryId(registryId);
  return NextResponse.json({
    ok: true,
    data: {
      profile: {
        organizationName: updated?.organizationName,
        organizationWebsite: updated?.organizationWebsite,
        organizationCountry: updated?.organizationCountry,
        organizationIndustry: updated?.organizationIndustry,
        organizationSize: updated?.organizationSize,
        organizationUseCase: updated?.organizationUseCase,
        buyerContactName: updated?.buyerContactName,
        buyerContactEmail: updated?.buyerContactEmail,
        buyerContactRole: updated?.buyerContactRole,
      },
      profileCompleted: Boolean(updated?.profileCompletedAt),
      profileUpdatedAt: updated?.profileUpdatedAt,
    },
  });
}
