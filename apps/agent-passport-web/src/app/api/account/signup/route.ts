import { NextRequest, NextResponse } from 'next/server';
import { normalizeBuyerEmail, validateBuyerEmail, sanitizeDisplayName } from '@/lib/buyer-account-validation';
import { validateBuyerPassword, hashBuyerPassword } from '@/lib/buyer-password';
import { createBuyerAccount, getBuyerAccountByEmail, toPublicBuyerAccount } from '@/lib/buyer-account-repository';
import { createBuyerAccountSession, BUYER_ACCOUNT_SESSION_COOKIE, getBuyerAccountSessionCookieOptions } from '@/lib/buyer-account-session';
import { getRegistryByRegistryId } from '@/lib/organization-registry-repository';
import { verifyRegistryAdminAccessToken } from '@/lib/registry-access-token';
import { createRegistryMembership, getRegistryMembership } from '@/lib/registry-membership-repository';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body' }, { status: 400 });
  }

  const rawEmail = typeof body.email === 'string' ? body.email : '';
  const email = normalizeBuyerEmail(rawEmail);
  if (!validateBuyerEmail(email)) {
    return NextResponse.json({ ok: false, error: 'Invalid email address.' }, { status: 400 });
  }

  const password = typeof body.password === 'string' ? body.password : '';
  const passwordCheck = validateBuyerPassword(password);
  if (!passwordCheck.valid) {
    return NextResponse.json({ ok: false, error: passwordCheck.errors[0] }, { status: 400 });
  }

  const displayName = sanitizeDisplayName(body.display_name);

  const existing = getBuyerAccountByEmail(email);
  if (existing) {
    return NextResponse.json({ ok: false, error: 'An account with that email already exists.' }, { status: 409 });
  }

  const passwordHash = await hashBuyerPassword(password);
  const account = createBuyerAccount({ email, displayName, passwordHash });

  // Optional registry claim at signup
  const claimRegistryId = typeof body.claim_registry_id === 'string' ? body.claim_registry_id : null;
  const accessToken = typeof body.access_token === 'string' ? body.access_token : null;
  if (claimRegistryId && accessToken) {
    const registry = getRegistryByRegistryId(claimRegistryId);
    if (registry && registry.adminAccessTokenHash && verifyRegistryAdminAccessToken(accessToken, registry.adminAccessTokenHash)) {
      const existing = getRegistryMembership(claimRegistryId, account.account_id);
      if (!existing) {
        createRegistryMembership({ registryId: claimRegistryId, accountId: account.account_id, role: 'owner' });
      }
    }
  }

  const session = createBuyerAccountSession(account.account_id);
  const cookieOptions = getBuyerAccountSessionCookieOptions(session.expiresAt);
  const response = NextResponse.json({ ok: true, data: toPublicBuyerAccount(account) }, { status: 201 });
  response.headers.set('Set-Cookie', `${BUYER_ACCOUNT_SESSION_COOKIE}=${session.sessionToken}; ${cookieOptions}`);
  return response;
}
