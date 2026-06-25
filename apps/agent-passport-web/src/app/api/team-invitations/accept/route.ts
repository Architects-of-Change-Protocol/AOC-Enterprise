import { NextRequest, NextResponse } from 'next/server';
import { resolveBuyerAccountFromRequest } from '@/lib/registry-account-access';
import { getRegistryTeamInvitationByToken, acceptRegistryTeamInvitation } from '@/lib/registry-team-invitation-repository';
import { createRegistryMembership, hasActiveRegistryMembership } from '@/lib/registry-membership-repository';
import { normalizeBuyerEmail } from '@/lib/buyer-account-validation';

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
    return NextResponse.json({ ok: false, error: 'Invalid request body.' }, { status: 400 });
  }

  const token = typeof body.token === 'string' ? body.token : '';
  const invitationId = typeof body.invitation_id === 'string' ? body.invitation_id : '';

  if (!token || !invitationId) {
    return NextResponse.json({ ok: false, error: 'invitation_id and token are required.' }, { status: 400 });
  }

  const invitation = getRegistryTeamInvitationByToken(token);
  if (!invitation) {
    return NextResponse.json({ ok: false, error: 'Invalid or expired invitation.' }, { status: 404 });
  }

  if (invitation.invitation_id !== invitationId) {
    return NextResponse.json({ ok: false, error: 'Invalid invitation.' }, { status: 400 });
  }

  if (invitation.status !== 'pending') {
    return NextResponse.json({ ok: false, error: 'Invitation is no longer valid.' }, { status: 400 });
  }

  if (new Date(invitation.expires_at) <= new Date()) {
    return NextResponse.json({ ok: false, error: 'Invitation has expired.' }, { status: 400 });
  }

  // Verify email matches
  if (normalizeBuyerEmail(invitation.invited_email) !== normalizeBuyerEmail(account.email)) {
    return NextResponse.json({ ok: false, error: 'This invitation was sent to a different email address.' }, { status: 403 });
  }

  // Check for duplicate membership
  const alreadyMember = hasActiveRegistryMembership(invitation.registry_id, account.accountId);
  if (alreadyMember) {
    return NextResponse.json({ ok: false, error: 'You are already a member of this registry.' }, { status: 409 });
  }

  createRegistryMembership({
    registryId: invitation.registry_id,
    accountId: account.accountId,
    role: invitation.role,
    invitedByAccountId: invitation.invited_by_account_id,
    acceptedAt: new Date().toISOString(),
  });
  acceptRegistryTeamInvitation({ invitationId });

  return NextResponse.json({
    ok: true,
    data: {
      registryId: invitation.registry_id,
      role: invitation.role,
      dashboardUrl: '/account/dashboard',
    },
  });
}
