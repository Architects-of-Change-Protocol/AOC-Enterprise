/**
 * GET /api/checkout/session/[sessionId]
 *
 * Verifies a Stripe session and returns the associated purchase status.
 * Used by the enroll-agent page to gate access without trusting URL params.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPurchaseByStripeSessionId } from '@/lib/purchase-repository';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: { sessionId: string } },
) {
  const { sessionId } = params;

  if (!sessionId) {
    return NextResponse.json({ ok: false, error: 'Missing sessionId' }, { status: 400 });
  }

  const purchase = getPurchaseByStripeSessionId(sessionId);

  if (!purchase) {
    return NextResponse.json(
      { ok: false, error: 'Session not found', canEnroll: false },
      { status: 404 },
    );
  }

  const canEnroll =
    purchase.status === 'completed' &&
    purchase.enrollmentStatus !== 'passport_issued';

  return NextResponse.json({
    ok: true,
    purchase: {
      id: purchase.id,
      tier: purchase.tier,
      status: purchase.status,
      enrollmentStatus: purchase.enrollmentStatus,
      passportId: purchase.passportId,
    },
    canEnroll,
  });
}
