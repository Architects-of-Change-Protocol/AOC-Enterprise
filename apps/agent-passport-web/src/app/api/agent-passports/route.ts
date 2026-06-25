import { NextRequest, NextResponse } from 'next/server';
import { enrollAgent } from '@/lib/passport-adapter';
import { createAgentPassportPublicVerificationPayload } from '@aoc-enterprise/agent-governance';
import { getAllPassportIds, getPassportBundle } from '@/lib/store';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const bundle = await enrollAgent(body);
    const publicPayload = createAgentPassportPublicVerificationPayload(bundle.passport);
    return NextResponse.json({ passport: publicPayload }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export function GET() {
  const ids = getAllPassportIds();
  const passports = ids
    .map((id) => getPassportBundle(id)?.passport)
    .filter(Boolean)
    .map((p) => ({
      passportId: p!.passportId,
      agentName: p!.agentName,
      ownerName: p!.ownerName,
      status: p!.status,
    }));
  return NextResponse.json({ passports });
}
