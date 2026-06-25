import { NextRequest, NextResponse } from 'next/server';
import { resolveRegistryAccessFromRequest } from '@/lib/registry-account-access';
import { getRegistryMembership, updateRegistryMembershipRole } from '@/lib/registry-membership-repository';
import type { RegistryRole } from '@/lib/buyer-account-types';

const VALID_ROLES: RegistryRole[] = ['owner', 'admin', 'member', 'viewer', 'auditor'];

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: { registryId: string; accountId: string } },
) {
  const { registryId, accountId } = params;
  const ctx = resolveRegistryAccessFromRequest({ registryId, request, requiredPermission: 'registry:manage_team' });
  if (!ctx) {
    return NextResponse.json({ ok: false, error: 'Access denied.' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body.' }, { status: 400 });
  }

  const role = typeof body.role === 'string' ? body.role as RegistryRole : null;
  if (!role || !VALID_ROLES.includes(role)) {
    return NextResponse.json({ ok: false, error: 'Invalid role.' }, { status: 400 });
  }

  // Only owner can assign owner role
  if (role === 'owner' && ctx.membership?.role !== 'owner') {
    return NextResponse.json({ ok: false, error: 'Only owners can assign the owner role.' }, { status: 403 });
  }

  const membership = getRegistryMembership(registryId, accountId);
  if (!membership || membership.status !== 'active') {
    return NextResponse.json({ ok: false, error: 'Member not found.' }, { status: 404 });
  }

  updateRegistryMembershipRole({ registryId, accountId, role });
  return NextResponse.json({ ok: true, data: { accountId, role } });
}
