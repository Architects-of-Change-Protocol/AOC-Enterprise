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
import { verifyRegistryAccess } from '@/lib/organization-registry-service';
import {
  getEntitlementByRegistryId,
  addPassportToRegistry,
} from '@/lib/organization-registry-repository';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Record<string, unknown>;

    const registryId = typeof body['registry_id'] === 'string' ? body['registry_id'] : undefined;
    const accessToken = typeof body['access_token'] === 'string' ? body['access_token'] : undefined;
    const sessionId = typeof body['session_id'] === 'string' ? body['session_id'] : undefined;

    // -----------------------------------------------------------------------
    // Path 2: Organization registry enrollment
    // -----------------------------------------------------------------------
    if (registryId && accessToken) {
      const registryResult = verifyRegistryAccess(registryId, accessToken);
      if (!registryResult.ok || !registryResult.registry) {
        return NextResponse.json(
          { error: registryResult.errorCode ?? 'REGISTRY_ACCESS_DENIED' },
          { status: 403 },
        );
      }

      const registry = registryResult.registry;
      if (registry.registryStatus !== 'active') {
        return NextResponse.json({ error: 'REGISTRY_INACTIVE' }, { status: 403 });
      }

      const entitlement = getEntitlementByRegistryId(registryId);
      if (!entitlement || entitlement.status !== 'active' || entitlement.remainingQuantity <= 0) {
        return NextResponse.json({ error: 'REGISTRY_CAPACITY_EXHAUSTED' }, { status: 403 });
      }

      const bundle = await enrollAgent(body as unknown as Parameters<typeof enrollAgent>[0]);
      const passportId = bundle.passport.passportId;

      // Persist passport linked to registry (no purchase_id for registry passports)
      createPassportRecord(passportId, null, JSON.stringify(bundle), undefined, registryId);

      // Atomically add to registry and decrement capacity
      try {
        addPassportToRegistry({
          registryId,
          passportId,
          agentName: typeof body['agentName'] === 'string' ? body['agentName'] : 'Unknown Agent',
          agentOwner: typeof body['ownerName'] === 'string' ? body['ownerName'] : undefined,
          governanceStatus: 'active',
          runtimeGuardReady: false,
        });
      } catch (err) {
        const code = err instanceof Error ? err.message : 'REGISTRY_PASSPORT_ISSUANCE_FAILED';
        return NextResponse.json({ error: code }, { status: 403 });
      }

      const publicPayload = createAgentPassportPublicVerificationPayload(bundle.passport);
      return NextResponse.json(
        {
          passport: publicPayload,
          passportId,
          registryId,
          adminUrl: `/registry/admin?registry_id=${encodeURIComponent(registryId)}&access_token=${encodeURIComponent(accessToken)}`,
        },
        { status: 201 },
      );
    }

    // -----------------------------------------------------------------------
    // Path 1: Individual purchase enrollment
    // -----------------------------------------------------------------------
    if (!sessionId) {
      return NextResponse.json(
        { error: 'session_id or registry credentials are required.' },
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

    markPurchaseEnrollmentStarted(purchase.id);

    const bundle = await enrollAgent(body as unknown as Parameters<typeof enrollAgent>[0]);
    const passportId = bundle.passport.passportId;

    createPassportRecord(passportId, purchase.id, JSON.stringify(bundle));
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
