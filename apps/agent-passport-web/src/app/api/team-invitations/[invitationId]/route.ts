import { NextRequest, NextResponse } from 'next/server';
import { getRegistryTeamInvitationByToken } from '@/lib/registry-team-invitation-repository';
import { getRegistryByRegistryId } from '@/lib/organization-registry-repository';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { invitationId: string } },
) {
  const { invitationId } = params;
  const token = request.nextUrl.searchParams.get('token') ?? '';

  if (!token) {
    return NextResponse.json({ ok: false, error: 'token is required.' }, { status: 400 });
  }

  const invitation = getRegistryTeamInvitationByToken(token);
  if (!invitation || invitation.invitation_id !== invitationId) {
    return NextResponse.json({ ok: false, error: 'Invalid or expired invitation.' }, { status: 404 });
  }

  if (invitation.status !== 'pending') {
    return NextResponse.json({ ok: false, error: 'Invitation is no longer valid.' }, { status: 400 });
  }

  const registry = getRegistryByRegistryId(invitation.registry_id);

  return NextResponse.json({
    ok: true,
    data: {
      invitationId: invitation.invitation_id,
      registryId: invitation.registry_id,
      organizationName: registry?.organizationName ?? null,
      invitedEmail: invitation.invited_email,
      role: invitation.role,
      expiresAt: invitation.expires_at,
    },
  });
}
