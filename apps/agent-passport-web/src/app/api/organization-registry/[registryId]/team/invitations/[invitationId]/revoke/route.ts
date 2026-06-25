import { NextRequest, NextResponse } from 'next/server';
import { resolveRegistryAccessFromRequest } from '@/lib/registry-account-access';
import { getRegistryTeamInvitationByInvitationId, revokeRegistryTeamInvitation } from '@/lib/registry-team-invitation-repository';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: { registryId: string; invitationId: string } },
) {
  const { registryId, invitationId } = params;
  const ctx = resolveRegistryAccessFromRequest({ registryId, request, requiredPermission: 'registry:manage_team' });
  if (!ctx) {
    return NextResponse.json({ ok: false, error: 'Access denied.' }, { status: 403 });
  }

  const invitation = getRegistryTeamInvitationByInvitationId(invitationId);
  if (!invitation || invitation.registry_id !== registryId) {
    return NextResponse.json({ ok: false, error: 'Invitation not found.' }, { status: 404 });
  }
  if (invitation.status !== 'pending') {
    return NextResponse.json({ ok: false, error: 'Invitation is not pending.' }, { status: 400 });
  }

  revokeRegistryTeamInvitation({ invitationId });
  return NextResponse.json({ ok: true });
}
