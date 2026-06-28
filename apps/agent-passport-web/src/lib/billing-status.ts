import type { StripeSubscriptionStatus, RegistryBillingStatus, RegistryOperationalState } from './billing-types.js';

export function mapStripeSubscriptionStatusToBillingStatus(
  status: StripeSubscriptionStatus,
): RegistryBillingStatus {
  switch (status) {
    case 'active': return 'active';
    case 'trialing': return 'trialing';
    case 'past_due': return 'past_due';
    case 'unpaid': return 'suspended';
    case 'canceled': return 'canceled';
    case 'incomplete': return 'pending';
    case 'incomplete_expired': return 'suspended';
    case 'paused': return 'suspended';
    default: return 'unknown';
  }
}

export function mapBillingStatusToOperationalState(
  status: RegistryBillingStatus,
): RegistryOperationalState {
  switch (status) {
    case 'active':
    case 'trialing':
      return 'operational';
    case 'past_due':
      return 'warning';
    case 'pending':
    case 'unknown':
      return 'restricted';
    case 'suspended':
    case 'canceled':
      return 'suspended';
    default:
      return 'restricted';
  }
}

export function isBillingStatusOperational(status: RegistryBillingStatus): boolean {
  return status === 'active' || status === 'trialing';
}

export function isBillingStatusPrivilegedActionAllowed(status: RegistryBillingStatus): boolean {
  return status === 'active' || status === 'trialing' || status === 'past_due';
}

function isGracePeriodActive(gracePeriodEndsAt: string | null | undefined): boolean {
  if (!gracePeriodEndsAt) return false;
  return new Date(gracePeriodEndsAt) > new Date();
}

export function isBillingStatusEnrollmentAllowed(
  status: RegistryBillingStatus,
  gracePeriodEndsAt?: string | null,
): boolean {
  if (status === 'active' || status === 'trialing') return true;
  if (status === 'past_due') return isGracePeriodActive(gracePeriodEndsAt);
  return false;
}

export function isBillingStatusExportGenerationAllowed(
  status: RegistryBillingStatus,
  gracePeriodEndsAt?: string | null,
): boolean {
  return isBillingStatusEnrollmentAllowed(status, gracePeriodEndsAt);
}

export function isBillingStatusExistingExportDownloadAllowed(
  _status: RegistryBillingStatus,
): boolean {
  return true;
}

export function getBillingStatusMessage(status: RegistryBillingStatus): string {
  switch (status) {
    case 'active': return 'Subscription active. Your organization registry is operational.';
    case 'trialing': return 'Trial active. Your organization registry is operational.';
    case 'past_due': return 'Payment issue detected. Your registry is past due. Please update billing to avoid suspension.';
    case 'suspended': return 'Registry suspended. New agent enrollment and new governance exports are blocked until billing is restored.';
    case 'canceled': return 'Registry canceled. New agent enrollment and new governance exports are blocked.';
    case 'pending': return 'Billing status pending. Registry access is restricted until billing is confirmed.';
    case 'unknown': return 'Billing status unavailable. This registry may have been created before billing lifecycle tracking was enabled.';
    default: return 'Billing status unknown.';
  }
}
