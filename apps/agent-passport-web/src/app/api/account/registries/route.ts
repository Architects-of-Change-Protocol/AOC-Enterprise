import { NextRequest, NextResponse } from 'next/server';
import { resolveBuyerAccountFromRequest } from '@/lib/registry-account-access';
import { listRegistryMembershipsByAccountId } from '@/lib/registry-membership-repository';
import { getRegistryByRegistryId } from '@/lib/organization-registry-repository';
import { getRegistryRolePermissions } from '@/lib/registry-role-policy';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const account = resolveBuyerAccountFromRequest(request);
  if (!account) {
    return NextResponse.json({ ok: false, error: 'Unauthenticated' }, { status: 401 });
  }

  const memberships = listRegistryMembershipsByAccountId(account.accountId);
  const registries = memberships.map(m => {
    const registry = getRegistryByRegistryId(m.registry_id);
    return {
      registryId: m.registry_id,
      role: m.role,
      permissions: getRegistryRolePermissions(m.role),
      status: m.status,
      acceptedAt: m.accepted_at,
      registry: registry
        ? {
            organizationName: registry.organizationName,
            registryStatus: registry.registryStatus,
            governanceLevel: registry.governanceLevel,
            maxPassports: registry.maxPassports,
            issuedPassports: registry.issuedPassports,
            remainingPassports: registry.remainingPassports,
          }
        : null,
    };
  });

  return NextResponse.json({ ok: true, data: { registries } });
}
