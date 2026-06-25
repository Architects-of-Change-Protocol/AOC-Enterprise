import { NextResponse } from 'next/server';
import { verifyAgentPassportBundle } from '@/lib/passport-adapter';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ passportId: string }> },
) {
  const { passportId } = await params;
  const verifiedAt = new Date().toISOString();
  const result = await verifyAgentPassportBundle(passportId);

  if (!result) {
    return NextResponse.json(
      { valid: false, reason: 'Passport not found', verifiedAt },
      { status: 404 },
    );
  }

  const { passportResult, runtimeSealResult, publicPayload } = result;
  const overallValid =
    passportResult.valid && (runtimeSealResult === null || runtimeSealResult.valid);

  return NextResponse.json({
    valid: overallValid,
    verifiedAt,
    passport: publicPayload,
    passportVerification: {
      valid: passportResult.valid,
      reasonCodes: passportResult.reasonCodes,
    },
    runtimeSealVerification: runtimeSealResult
      ? { valid: runtimeSealResult.valid, reasonCodes: runtimeSealResult.reasonCodes }
      : null,
  });
}
