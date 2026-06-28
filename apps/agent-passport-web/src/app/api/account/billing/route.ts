/**
 * GET /api/account/billing
 *
 * Returns billing info for all registries the buyer account is a member of.
 * Requires buyer account session.
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveBuyerAccountFromRequest } from '@/lib/registry-account-access';
import { listRegistryMembershipsByAccountId } from '@/lib/registry-membership-repository';
import { getRegistryBillingProfile } from '@/lib/billing-repository';
import { roleHasPermission } from '@/lib/registry-role-policy';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const account = resolveBuyerAccountFromRequest(request);
  if (!account) {
    return NextResponse.json({ ok: false, error: 'Unauthenticated' }, { status: 401 });
  }

  const memberships = listRegistryMembershipsByAccountId(account.accountId);

  const registriesBilling = memberships
    .filter(m => m.status === 'active')
    .map(m => {
      const billing = getRegistryBillingProfile(m.registry_id);
      const canViewBilling = roleHasPermission(m.role, 'registry:view_billing');
      const canManageBilling = roleHasPermission(m.role, 'registry:manage_billing');

      return {
        registryId: m.registry_id,
        role: m.role,
        canViewBilling,
        canManageBilling,
        billing: canViewBilling && billing
          ? {
              organizationName: billing.organizationName,
              billingStatus: billing.billingStatus,
              operationalState: billing.operationalState,
              subscriptionStatus: billing.subscriptionStatus,
              currentPeriodEnd: billing.currentPeriodEnd,
              cancelAtPeriodEnd: billing.cancelAtPeriodEnd,
              gracePeriodEndsAt: billing.gracePeriodEndsAt,
              hasStripeCustomer: Boolean(billing.stripeCustomerId),
              portalAvailable: Boolean(billing.stripeCustomerId),
              updatedAt: billing.updatedAt,
            }
          : null,
      };
    });

  return NextResponse.json({
    ok: true,
    data: {
      accountId: account.accountId,
      email: account.email,
      registriesBilling,
    },
  });
}
