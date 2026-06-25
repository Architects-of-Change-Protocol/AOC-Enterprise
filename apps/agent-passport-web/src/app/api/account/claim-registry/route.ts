import { NextRequest, NextResponse } from 'next/server';
import { resolveBuyerAccountFromRequest } from '@/lib/registry-account-access';
import { getRegistryByRegistryId } from '@/lib/organization-registry-repository';
import { verifyRegistryAdminAccessToken } from '@/lib/registry-access-token';
import { createRegistryMembership, getRegistryMembership } from '@/lib/registry-membership-repository';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const account = resolveBuyerAccountFromRequest(request);
  if (!account) {
    return NextResponse.json({ ok: false, error: 'Unauthenticated. Please sign in first.' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body' }, { status: 400 });
  }

  const registryId = typeof body.registry_id === 'string' ? body.registry_id : '';
  const accessToken = typeof body.access_token === 'string' ? body.access_token : '';

  if (!registryId || !accessToken) {
    return NextResponse.json({ ok: false, error: 'registry_id and access_token are required.' }, { status: 400 });
  }

  const registry = getRegistryByRegistryId(registryId);
  if (!registry) {
    return NextResponse.json({ ok: false, error: 'Registry not found.' }, { status: 404 });
  }

  if (!registry.adminAccessTokenHash || !verifyRegistryAdminAccessToken(accessToken, registry.adminAccessTokenHash)) {
    return NextResponse.json({ ok: false, error: 'Invalid access token.' }, { status: 403 });
  }

  const existing = getRegistryMembership(registryId, account.accountId);
  if (existing && existing.status === 'active') {
    return NextResponse.json({
      ok: true,
      data: {
        registryId,
        role: existing.role,
        dashboardUrl: '/account/dashboard',
        registryUrl: `/registry/admin?registry_id=${encodeURIComponent(registryId)}&access_token=${encodeURIComponent(accessToken)}`,
      },
    });
  }

  createRegistryMembership({ registryId, accountId: account.accountId, role: 'owner' });

  return NextResponse.json({
    ok: true,
    data: {
      registryId,
      role: 'owner',
      dashboardUrl: '/account/dashboard',
      registryUrl: `/registry/admin?registry_id=${encodeURIComponent(registryId)}&access_token=${encodeURIComponent(accessToken)}`,
    },
  });
}
