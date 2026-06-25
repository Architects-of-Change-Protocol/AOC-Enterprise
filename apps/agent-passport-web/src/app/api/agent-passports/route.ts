import { NextRequest, NextResponse } from 'next/server';
import { enrollAgent } from '@/lib/passport-adapter';
import { createAgentPassportPublicVerificationPayload } from '@aoc-enterprise/agent-governance';
import { listPassports, createPassportRecord, getPassportByPassportId } from '@/lib/passport-repository';
import {
  getPurchaseByStripeSessionId,
  canEnrollWithPurchase,
  markPurchaseEnrollmentStarted,
  markPurchasePassportIssued,
} from '@/lib/purchase-repository';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // --- Purchase verification gate ---
    const sessionId: string | undefined = body.session_id;
    if (!sessionId) {
      return NextResponse.json(
        { error: 'session_id is required. Complete a purchase before enrolling.' },
        { status: 400 },
      );
    }

    const purchase = getPurchaseByStripeSessionId(sessionId);
    if (!purchase) {
      return NextResponse.json(
        { error: 'Session not found. Complete a valid purchase before enrolling.' },
        { status: 404 },
      );
    }

    if (!canEnrollWithPurchase(purchase.id)) {
      if (purchase.enrollmentStatus === 'passport_issued') {
        return NextResponse.json(
          {
            error: 'A passport has already been issued for this purchase.',
            passportId: purchase.passportId,
          },
          { status: 409 },
        );
      }
      return NextResponse.json(
        {
          error: `Purchase is not eligible for enrollment (status: ${purchase.status}, enrollment: ${purchase.enrollmentStatus}).`,
        },
        { status: 403 },
      );
    }

    // Mark enrollment as started to prevent race conditions
    markPurchaseEnrollmentStarted(purchase.id);

    // Use tier from the verified purchase record (not from request body)
    const tier = purchase.tier;

    // Enroll the agent
    const bundle = await enrollAgent({ ...body, tier });
    const passportId = bundle.passport.passportId;

    // Persist passport record linked to purchase
    createPassportRecord(passportId, purchase.id, JSON.stringify(bundle));

    // Mark purchase as passport issued (prevents double issuance)
    markPurchasePassportIssued(purchase.id, passportId);

    const publicPayload = createAgentPassportPublicVerificationPayload(bundle.passport);
    return NextResponse.json({ passport: publicPayload, passportId }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export function GET() {
  const items = listPassports();
  return NextResponse.json({ passports: items });
}
