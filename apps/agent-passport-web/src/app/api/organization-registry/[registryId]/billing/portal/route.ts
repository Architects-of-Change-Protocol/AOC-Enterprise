/**
 * POST /api/organization-registry/[registryId]/billing/portal
 *
 * Creates a Stripe Customer Portal session for owner/admin.
 * Requires registry:manage_billing permission.
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveRegistryAccessFromRequest } from '@/lib/registry-account-access';
import { createStripeCustomerPortalSession } from '@/lib/stripe-billing-service';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { registryId: string } },
) {
  const { registryId } = params;

  const access = resolveRegistryAccessFromRequest({
    registryId,
    request: req,
    requiredPermission: 'registry:manage_billing',
  });

  if (!access) {
    return NextResponse.json(
      { ok: false, error: { code: 'BILLING_PORTAL_ACCESS_DENIED', message: 'Billing portal access denied. Owner or admin role required.' } },
      { status: 403 },
    );
  }

  let body: { return_url?: string } = {};
  try {
    body = await req.json() as typeof body;
  } catch {
    // Use defaults
  }

  const baseUrl = process.env.NEXT_PUBLIC_AGENT_PASSPORT_BASE_URL?.replace(/\/$/, '') || '';
  const returnPath = body.return_url ?? `/account/dashboard`;
  const returnUrl = `${baseUrl}${returnPath.startsWith('http') ? '' : returnPath}${returnPath.includes('?') ? '&' : '?'}billing=returned`;

  try {
    const { url } = await createStripeCustomerPortalSession(
      {
        registryId,
        accountId: access.account?.accountId,
        returnUrl,
      },
    );
    return NextResponse.json({ ok: true, data: { url } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Portal session creation failed';
    if (message.startsWith('BILLING_NO_STRIPE_CUSTOMER')) {
      return NextResponse.json(
        { ok: false, error: { code: 'BILLING_NO_STRIPE_CUSTOMER', message: 'No billing customer linked to this registry yet.' } },
        { status: 422 },
      );
    }
    if (message.includes('STRIPE_SECRET_KEY')) {
      return NextResponse.json(
        { ok: false, error: { code: 'BILLING_NOT_CONFIGURED', message: 'Billing portal is not configured.' } },
        { status: 503 },
      );
    }
    console.error('[billing/portal] Failed to create portal session:', message);
    return NextResponse.json(
      { ok: false, error: { code: 'BILLING_PORTAL_FAILED', message: 'Failed to create billing portal session.' } },
      { status: 500 },
    );
  }
}
