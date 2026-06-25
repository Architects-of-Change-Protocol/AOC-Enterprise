import { NextRequest, NextResponse } from 'next/server';
import { resolveRegistryAccessFromRequest } from '@/lib/registry-account-access';
import { listRegistryMembershipsByRegistryId } from '@/lib/registry-membership-repository';
import { listRegistryTeamInvitationsByRegistryId } from '@/lib/registry-team-invitation-repository';
import { getBuyerAccountByAccountId } from '@/lib/buyer-account-repository';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { registryId: string } },
) {
  const { registryId } = params;
  const ctx = resolveRegistryAccessFromRequest({ registryId, request, requiredPermission: 'registry:view' });
  if (!ctx) {
    return NextResponse.json({ ok: false, error: 'Access denied.' }, { status: 403 });
  }

  const memberships = listRegistryMembershipsByRegistryId(registryId);
  const membersWithInfo = memberships.map(m => {
    const acct = getBuyerAccountByAccountId(m.account_id);
    return {
      accountId: m.account_id,
      email: acct?.email ?? null,
      displayName: acct?.display_name ?? null,
      role: m.role,
      status: m.status,
      acceptedAt: m.accepted_at,
    };
  });

  const invitations = listRegistryTeamInvitationsByRegistryId(registryId).map(inv => ({
    invitationId: inv.invitation_id,
    invitedEmail: inv.invited_email,
    role: inv.role,
    status: inv.status,
    expiresAt: inv.expires_at,
    createdAt: inv.created_at,
  }));

  return NextResponse.json({
    ok: true,
    data: {
      members: membersWithInfo,
      invitations,
      currentRole: ctx.membership?.role ?? null,
      accessMode: ctx.accessMode,
    },
  });
}
