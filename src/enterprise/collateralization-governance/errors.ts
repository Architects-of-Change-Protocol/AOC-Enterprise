/**
 * The Collateralization Governance Runtime's error taxonomy, parallel in
 * shape to `AccessGovernanceErrorCode` (`../access-governance/errors.ts`),
 * `TokenizationGovernanceErrorCode` and `GovernanceStoreErrorCode`. Every
 * failure this module surfaces is one of these codes; raw driver/internal
 * errors never escape it.
 *
 * Note what is deliberately absent: there is no code for "the requester
 * lacks COLLATERALIZE authority". That is not an error -- it is a governance
 * denial, produced by the Kernel and returned as a `denied`/`approval_required`
 * outcome with the Kernel's own reason codes, exactly as every other action's
 * denial is. This module never converts a governance decision into an
 * exception, and never converts an exception into a governance decision.
 *
 * Also deliberately absent, and specific to this action: no code here asserts
 * anything about the external world. There is no "COLLATERAL_NOT_PERFECTED",
 * no "PRIORITY_LOST", no "COLLATERAL_ALREADY_ENCUMBERED". Soberanía does not
 * observe those facts and must not imply that it does.
 */
export type CollateralizationGovernanceErrorCode =
  | 'COLLATERALIZATION_MANDATE_NOT_FOUND'
  | 'COLLATERALIZATION_MANDATE_ALREADY_EXISTS'
  | 'COLLATERALIZATION_MANDATE_NOT_ACTIVE'
  | 'COLLATERALIZATION_EXECUTION_NOT_FOUND'
  | 'COLLATERALIZATION_EXECUTION_ALREADY_RECORDED'
  | 'COLLATERALIZATION_EXECUTION_NOT_AUTHORIZED'
  | 'COLLATERALIZATION_RELEASE_ALREADY_RECORDED'
  | 'COLLATERALIZATION_VALIDATION_ERROR'
  | 'COLLATERALIZATION_SCOPE_ESCALATION'
  | 'COLLATERALIZATION_INVALID_TIMESTAMP'
  | 'COLLATERALIZATION_TENANT_SCOPE_REQUIRED'
  | 'COLLATERALIZATION_ACCESS_SCOPE_VIOLATION'
  | 'COLLATERALIZATION_ASSET_TENANT_MISMATCH'
  | 'COLLATERALIZATION_STORE_UNAVAILABLE'
  | 'COLLATERALIZATION_RECORD_CORRUPTED'
  | 'COLLATERALIZATION_EVALUATION_FAILED'
  | 'COLLATERALIZATION_REQUEST_CONFLICT'
  | 'COLLATERALIZATION_PERSISTENCE_FAILED';

export class CollateralizationGovernanceError extends Error {
  constructor(
    readonly code: CollateralizationGovernanceErrorCode,
    message: string,
    readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = 'CollateralizationGovernanceError';
  }
}

export function isCollateralizationGovernanceError(error: unknown): error is CollateralizationGovernanceError {
  return error instanceof CollateralizationGovernanceError;
}
