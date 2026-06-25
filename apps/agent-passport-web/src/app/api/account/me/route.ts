import { NextRequest, NextResponse } from 'next/server';
import { resolveBuyerAccountFromRequest } from '@/lib/registry-account-access';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const account = resolveBuyerAccountFromRequest(request);
  if (!account) {
    return NextResponse.json({ ok: false, error: 'Unauthenticated' }, { status: 401 });
  }
  return NextResponse.json({ ok: true, data: account });
}
