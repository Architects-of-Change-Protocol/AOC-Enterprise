import { NextRequest, NextResponse } from 'next/server';
import { revokeBuyerAccountSession, BUYER_ACCOUNT_SESSION_COOKIE } from '@/lib/buyer-account-session';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const sessionToken = request.cookies.get(BUYER_ACCOUNT_SESSION_COOKIE)?.value;
  if (sessionToken) {
    revokeBuyerAccountSession(sessionToken);
  }
  const response = NextResponse.json({ ok: true });
  response.headers.set('Set-Cookie', `${BUYER_ACCOUNT_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  return response;
}
