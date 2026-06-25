import { NextRequest, NextResponse } from 'next/server';
import { normalizeBuyerEmail } from '@/lib/buyer-account-validation';
import { verifyBuyerPassword } from '@/lib/buyer-password';
import { getBuyerAccountByEmail, updateBuyerAccountLastLogin, toPublicBuyerAccount } from '@/lib/buyer-account-repository';
import { createBuyerAccountSession, BUYER_ACCOUNT_SESSION_COOKIE, getBuyerAccountSessionCookieOptions } from '@/lib/buyer-account-session';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body' }, { status: 400 });
  }

  const email = normalizeBuyerEmail(typeof body.email === 'string' ? body.email : '');
  const password = typeof body.password === 'string' ? body.password : '';

  const account = getBuyerAccountByEmail(email);
  // Use consistent error to avoid email enumeration
  const invalidMsg = 'Invalid email or password.';
  if (!account || account.status !== 'active') {
    return NextResponse.json({ ok: false, error: invalidMsg }, { status: 401 });
  }

  const valid = await verifyBuyerPassword(password, account.password_hash);
  if (!valid) {
    return NextResponse.json({ ok: false, error: invalidMsg }, { status: 401 });
  }

  updateBuyerAccountLastLogin(account.account_id);

  const session = createBuyerAccountSession(account.account_id);
  const cookieOptions = getBuyerAccountSessionCookieOptions(session.expiresAt);
  const response = NextResponse.json({ ok: true, data: toPublicBuyerAccount(account) });
  response.headers.set('Set-Cookie', `${BUYER_ACCOUNT_SESSION_COOKIE}=${session.sessionToken}; ${cookieOptions}`);
  return response;
}
