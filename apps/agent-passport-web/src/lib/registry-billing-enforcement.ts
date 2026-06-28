import type Database from 'better-sqlite3';
import { getRegistryBillingProfile } from './billing-repository.js';
import {
  mapBillingStatusToOperationalState,
  isBillingStatusEnrollmentAllowed,
  isBillingStatusExportGenerationAllowed,
  isBillingStatusExistingExportDownloadAllowed,
  isBillingStatusPrivilegedActionAllowed,
} from './billing-status.js';
import type { RegistryBillingStatus, RegistryOperationalState } from './billing-types.js';

export type RegistryBillingAction =
  | 'view_registry'
  | 'enroll_agent'
  | 'issue_passport'
  | 'generate_export'
  | 'download_export'
  | 'manage_team'
  | 'update_profile'
  | 'manage_billing';

export interface RegistryBillingEnforcementState {
  billingStatus: RegistryBillingStatus;
  operationalState: RegistryOperationalState;
  gracePeriodEndsAt: string | null;
}

export async function getRegistryBillingEnforcementState(
  registryId: string,
  db?: Database.Database,
): Promise<RegistryBillingEnforcementState> {
  const profile = getRegistryBillingProfile(registryId, db);
  if (!profile) {
    return { billingStatus: 'unknown', operationalState: 'restricted', gracePeriodEndsAt: null };
  }
  return {
    billingStatus: profile.billingStatus,
    operationalState: mapBillingStatusToOperationalState(profile.billingStatus),
    gracePeriodEndsAt: profile.gracePeriodEndsAt,
  };
}

export function requireRegistryBillingForAction(opts: {
  billingStatus: RegistryBillingStatus;
  gracePeriodEndsAt: string | null;
  action: RegistryBillingAction;
}): { allowed: boolean; reason?: string } {
  const { billingStatus, gracePeriodEndsAt, action } = opts;

  switch (action) {
    case 'view_registry':
    case 'manage_billing':
      return { allowed: true };

    case 'download_export':
      return isBillingStatusExistingExportDownloadAllowed(billingStatus)
        ? { allowed: true }
        : { allowed: false, reason: 'Billing suspended. Export download is blocked.' };

    case 'enroll_agent':
    case 'issue_passport':
      return isBillingStatusEnrollmentAllowed(billingStatus, gracePeriodEndsAt)
        ? { allowed: true }
        : {
            allowed: false,
            reason: `Billing status '${billingStatus}' does not allow enrollment. Please restore billing to continue.`,
          };

    case 'generate_export':
      return isBillingStatusExportGenerationAllowed(billingStatus, gracePeriodEndsAt)
        ? { allowed: true }
        : {
            allowed: false,
            reason: `Billing status '${billingStatus}' does not allow generating new exports. Please restore billing to continue.`,
          };

    case 'manage_team':
    case 'update_profile':
      return isBillingStatusPrivilegedActionAllowed(billingStatus)
        ? { allowed: true }
        : {
            allowed: false,
            reason: `Billing status '${billingStatus}' restricts team and profile management.`,
          };

    default:
      return { allowed: false, reason: 'Unknown billing action.' };
  }
}
