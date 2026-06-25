import { NextRequest, NextResponse } from 'next/server';
import { rotateRegistryAdminToken } from '@/lib/organization-registry-service';

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
  const recoveryCode = typeof body.recovery_code === 'string' ? body.recovery_code : undefined;
  const buyerContactEmail = typeof body.buyer_contact_email === 'string' ? body.buyer_contact_email : undefined;
  const reason = typeof body.reason === 'string' ? body.reason : 'buyer_requested_rotation';

  if (!accessToken && !recoveryCode) {
    return NextResponse.json(
      { ok: false, error: 'Provide either access_token or recovery_code', code: 'REGISTRY_ACCESS_DENIED' },
      { status: 400 },
    );
  }

  const result = rotateRegistryAdminToken({
    registryId,
    currentAccessToken: accessToken,
    recoveryCode,
    buyerContactEmail,
    reason,
  });

  if ('error' in result) {
    const status = result.code === 'REGISTRY_NOT_FOUND' ? 404 : 403;
    return NextResponse.json({ ok: false, error: result.error, code: result.code }, { status });
  }

  return NextResponse.json({ ok: true, data: result });
}
