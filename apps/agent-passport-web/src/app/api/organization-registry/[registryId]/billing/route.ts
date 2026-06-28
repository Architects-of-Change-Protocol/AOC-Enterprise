/**
 * GET /api/organization-registry/[registryId]/billing
 *
 * Returns the billing profile for a registry.
 * Requires registry:view_billing permission (owner/admin) or legacy admin access.
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveRegistryAccessFromRequest } from '@/lib/registry-account-access';
import { getRegistryBillingProfile } from '@/lib/billing-repository';
import { roleHasPermission } from '@/lib/registry-role-policy';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { registryId: string } },
) {
  const { registryId } = params;

  const access = resolveRegistryAccessFromRequest({
    registryId,
    request: req,
    requiredPermission: 'registry:view_billing',
  });

  if (!access) {
    return NextResponse.json(
      { ok: false, error: { code: 'REGISTRY_ACCESS_DENIED', message: 'Billing access denied.' } },
      { status: 403 },
    );
  }

  const billing = getRegistryBillingProfile(registryId);
  if (!billing) {
    return NextResponse.json(
      { ok: false, error: { code: 'REGISTRY_NOT_FOUND', message: 'Registry not found.' } },
      { status: 404 },
    );
  }

  const role = access.membership?.role ?? 'owner';
  const canManageBilling = roleHasPermission(role, 'registry:manage_billing') || Boolean(access.legacyAccess);

  return NextResponse.json({
    ok: true,
    data: {
      billing: {
        registryId: billing.registryId,
        organizationName: billing.organizationName,
        billingStatus: billing.billingStatus,
        operationalState: billing.operationalState,
        stripeCustomerId: billing.stripeCustomerId,
        stripeSubscriptionId: billing.stripeSubscriptionId,
        subscriptionStatus: billing.subscriptionStatus,
        currentPeriodStart: billing.currentPeriodStart,
        currentPeriodEnd: billing.currentPeriodEnd,
        cancelAtPeriodEnd: billing.cancelAtPeriodEnd,
        canceledAt: billing.canceledAt,
        trialEnd: billing.trialEnd,
        gracePeriodEndsAt: billing.gracePeriodEndsAt,
        updatedAt: billing.updatedAt,
      },
      permissions: {
        canManageBilling,
      },
    },
  });
}
