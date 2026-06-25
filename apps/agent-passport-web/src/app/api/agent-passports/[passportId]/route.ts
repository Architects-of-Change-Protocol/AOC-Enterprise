import { NextResponse } from 'next/server';
import { getAgentPassportBundle } from '@/lib/passport-adapter';
import { createAgentPassportPublicVerificationPayload } from '@aoc-enterprise/agent-governance';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ passportId: string }> },
) {
  const { passportId } = await params;
  const bundle = getAgentPassportBundle(passportId);
  if (!bundle) {
    return NextResponse.json({ error: 'Passport not found' }, { status: 404 });
  }
  const publicPayload = createAgentPassportPublicVerificationPayload(bundle.passport);
  return NextResponse.json({ passport: publicPayload });
}
