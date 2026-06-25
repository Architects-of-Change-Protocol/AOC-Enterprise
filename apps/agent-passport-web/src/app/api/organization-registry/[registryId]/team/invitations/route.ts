import { NextRequest, NextResponse } from 'next/server';
import { resolveRegistryAccessFromRequest } from '@/lib/registry-account-access';
import { normalizeBuyerEmail, validateBuyerEmail } from '@/lib/buyer-account-validation';
import { createRegistryTeamInvitation } from '@/lib/registry-team-invitation-repository';
import { hasActiveRegistryMembership } from '@/lib/registry-membership-repository';
import type { RegistryRole } from '@/lib/buyer-account-types';

const VALID_ROLES: RegistryRole[] = ['owner', 'admin', 'member', 'viewer', 'auditor'];

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: { registryId: string } },
) {
  const { registryId } = params;
  const ctx = resolveRegistryAccessFromRequest({ registryId, request, requiredPermission: 'registry:invite_team' });
  if (!ctx) {
    return NextResponse.json({ ok: false, error: 'Access denied.' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body.' }, { status: 400 });
  }

  const rawEmail = typeof body.email === 'string' ? body.email : '';
  const email = normalizeBuyerEmail(rawEmail);
  if (!validateBuyerEmail(email)) {
    return NextResponse.json({ ok: false, error: 'Invalid email address.' }, { status: 400 });
  }

  const role = typeof body.role === 'string' ? body.role as RegistryRole : null;
  if (!role || !VALID_ROLES.includes(role)) {
    return NextResponse.json({ ok: false, error: 'Invalid role.' }, { status: 400 });
  }

  // Only owner can invite owner
  if (role === 'owner' && ctx.membership?.role !== 'owner') {
    return NextResponse.json({ ok: false, error: 'Only owners can invite owners.' }, { status: 403 });
  }

  // Check if already a member
  if (ctx.account) {
    const alreadyMember = hasActiveRegistryMembership(registryId, ctx.account.accountId);
    // We can't check by email easily, invitation is ok even if email doesn't have account yet
    void alreadyMember;
  }

  const { record, rawToken } = createRegistryTeamInvitation({
    registryId,
    invitedEmail: email,
    role,
    invitedByAccountId: ctx.account?.accountId ?? null,
  });

  const inviteUrl = `/account/invitations/accept?invitation_id=${encodeURIComponent(record.invitation_id)}&token=${encodeURIComponent(rawToken)}`;

  return NextResponse.json({
    ok: true,
    data: {
      invitationId: record.invitation_id,
      inviteUrl,
    },
  }, { status: 201 });
}
