import { NextRequest, NextResponse } from 'next/server';
import { verifyRegistryAdminAccess } from '@/lib/registry-admin-access';
import { createAdminSession, revokeAdminSessions, ADMIN_SESSION_COOKIE, SESSION_DURATION_MS } from '@/lib/registry-admin-session';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: { registryId: string } },
) {
  const { registryId } = params;

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body' }, { status: 400 });
  }

  const accessToken = typeof body.access_token === 'string' ? body.access_token : undefined;

  const access = verifyRegistryAdminAccess({ registryId, accessToken });
  if (!access.ok) {
    return NextResponse.json({ ok: false, error: 'Access denied', code: access.errorCode }, { status: 403 });
  }

  const session = createAdminSession(registryId);

  const isProduction = process.env.NODE_ENV === 'production';
  const cookieValue = [
    `${ADMIN_SESSION_COOKIE}=${session.sessionToken}`,
    `Path=/`,
    `HttpOnly`,
    `SameSite=Lax`,
    `Max-Age=${Math.floor(SESSION_DURATION_MS / 1000)}`,
    isProduction ? 'Secure' : '',
  ].filter(Boolean).join('; ');

  const response = NextResponse.json({
    ok: true,
    data: {
      registryId,
      sessionId: session.sessionId,
      expiresAt: session.expiresAt,
    },
  });
  response.headers.set('Set-Cookie', cookieValue);
  return response;
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { registryId: string } },
) {
  const { registryId } = params;

  revokeAdminSessions(registryId);

  const cookieValue = `${ADMIN_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
  const response = NextResponse.json({ ok: true });
  response.headers.set('Set-Cookie', cookieValue);
  return response;
}
