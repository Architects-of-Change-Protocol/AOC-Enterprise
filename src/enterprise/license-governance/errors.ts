/**
 * The License Governance Runtime's error taxonomy, parallel in shape to
 * `AccessGovernanceErrorCode` (`../access-governance/errors.ts`),
 * `TokenizationGovernanceErrorCode`, `CollateralizationGovernanceErrorCode`
 * and `GovernanceStoreErrorCode`. Every failure this module surfaces is one
 * of these codes; raw driver/internal errors never escape it.
 *
 * Note what is deliberately absent: there is no code for "the requester lacks
 * LICENSE authority". That is not an error -- it is a governance denial,
 * produced by the Kernel and returned as a `denied`/`approval_required`
 * outcome with the Kernel's own reason codes, exactly as every other action's
 * denial is. This module never converts a governance decision into an
 * exception, and never converts an exception into a governance decision.
 *
 * Also deliberately absent, and specific to this action: no code here asserts
 * anything about the world outside AOC. There is no
 * `LICENSE_NOT_ENFORCEABLE`, no `AGREEMENT_UNSIGNED`, no `ROYALTY_UNPAID`, no
 * `COPYRIGHT_NOT_SUBSISTING`, no `LICENSE_CONFLICTS_WITH_EXCLUSIVE_GRANT`.
 * AOC does not observe those facts and must not imply that it does. What it
 * can say is whether an execution stayed inside what it authorized --
 * `LICENSE_EXECUTION_NOT_AUTHORIZED`.
 */
export type LicenseGovernanceErrorCode =
  | 'LICENSE_MANDATE_NOT_FOUND'
  | 'LICENSE_MANDATE_ALREADY_EXISTS'
  | 'LICENSE_MANDATE_NOT_ACTIVE'
  | 'LICENSE_EXECUTION_NOT_FOUND'
  | 'LICENSE_EXECUTION_ALREADY_RECORDED'
  | 'LICENSE_EXECUTION_NOT_AUTHORIZED'
  | 'LICENSE_LIFECYCLE_ALREADY_RECORDED'
  | 'LICENSE_VALIDATION_ERROR'
  | 'LICENSE_PERMISSION_ESCALATION'
  | 'LICENSE_INVALID_TIMESTAMP'
  | 'LICENSE_TENANT_SCOPE_REQUIRED'
  | 'LICENSE_ACCESS_SCOPE_VIOLATION'
  | 'LICENSE_ASSET_TENANT_MISMATCH'
  | 'LICENSE_STORE_UNAVAILABLE'
  | 'LICENSE_RECORD_CORRUPTED'
  | 'LICENSE_EVALUATION_FAILED'
  | 'LICENSE_REQUEST_CONFLICT'
  | 'LICENSE_PERSISTENCE_FAILED';

export class LicenseGovernanceError extends Error {
  constructor(
    readonly code: LicenseGovernanceErrorCode,
    message: string,
    readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = 'LicenseGovernanceError';
  }
}

export function isLicenseGovernanceError(error: unknown): error is LicenseGovernanceError {
  return error instanceof LicenseGovernanceError;
}
