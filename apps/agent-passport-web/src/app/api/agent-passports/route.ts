import { NextRequest, NextResponse } from 'next/server';
import { enrollAgent } from '@/lib/passport-adapter';
import { createAgentPassportPublicVerificationPayload } from '@aoc-enterprise/agent-governance';
import { getAllPassportIds, getPassportBundle } from '@/lib/store';

const AUTONOMY_LEVELS = ['low', 'medium', 'high'] as const;
const RISK_TIERS = ['low', 'medium', 'high', 'critical'] as const;

function validateEnrollmentBody(body: unknown): string | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return 'Request body must be a JSON object';
  }
  const b = body as Record<string, unknown>;

  if (!b['agentName'] || typeof b['agentName'] !== 'string' || !b['agentName'].trim()) {
    return 'agentName is required';
  }
  if (!b['ownerName'] || typeof b['ownerName'] !== 'string') return 'ownerName is required';
  if (!b['ownerId'] || typeof b['ownerId'] !== 'string') return 'ownerId is required';
  if (!b['purpose'] || typeof b['purpose'] !== 'string') return 'purpose is required';

  const autonomyLevel = typeof b['autonomyLevel'] === 'string' ? b['autonomyLevel'].trim() : '';
  if (!(AUTONOMY_LEVELS as readonly string[]).includes(autonomyLevel)) {
    return `autonomyLevel must be one of: ${AUTONOMY_LEVELS.join(', ')}`;
  }

  const riskTier = typeof b['riskTier'] === 'string' ? b['riskTier'].trim() : '';
  if (!(RISK_TIERS as readonly string[]).includes(riskTier)) {
    return `riskTier must be one of: ${RISK_TIERS.join(', ')}`;
  }

  for (const field of ['dataAccess', 'tools', 'prohibitedActions', 'humanApprovalRequiredActions'] as const) {
    if (b[field] !== undefined && !Array.isArray(b[field])) {
      return `${field} must be an array`;
    }
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const validationError = validateEnrollmentBody(body);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 422 });
    }

    // Normalise trimmed enum values before passing to the adapter.
    const b = body as Record<string, unknown>;
    const normalized = {
      ...b,
      autonomyLevel: (b['autonomyLevel'] as string).trim(),
      riskTier: (b['riskTier'] as string).trim(),
    };

    const bundle = await enrollAgent(normalized as Parameters<typeof enrollAgent>[0]);
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
