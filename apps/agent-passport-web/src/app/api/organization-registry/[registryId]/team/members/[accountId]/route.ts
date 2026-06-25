import { NextRequest, NextResponse } from 'next/server';
import { resolveRegistryAccessFromRequest } from '@/lib/registry-account-access';
import { getRegistryMembership, removeRegistryMembership, listRegistryMembershipsByRegistryId } from '@/lib/registry-membership-repository';

export const dynamic = 'force-dynamic';

export async function DELETE(
  request: NextRequest,
  { params }: { params: { registryId: string; accountId: string } },
) {
  const { registryId, accountId } = params;
  const ctx = resolveRegistryAccessFromRequest({ registryId, request, requiredPermission: 'registry:manage_team' });
  if (!ctx) {
    return NextResponse.json({ ok: false, error: 'Access denied.' }, { status: 403 });
  }

  const membership = getRegistryMembership(registryId, accountId);
  if (!membership || membership.status !== 'active') {
    return NextResponse.json({ ok: false, error: 'Member not found.' }, { status: 404 });
  }

  // Prevent removing last owner
  if (membership.role === 'owner') {
    const owners = listRegistryMembershipsByRegistryId(registryId)
      .filter(m => m.role === 'owner' && m.status === 'active');
    if (owners.length <= 1) {
      return NextResponse.json({ ok: false, error: 'Cannot remove the last owner.' }, { status: 400 });
    }
  }

  removeRegistryMembership({ registryId, accountId });
  return NextResponse.json({ ok: true });
}
