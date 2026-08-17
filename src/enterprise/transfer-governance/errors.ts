/**
 * The Transfer Governance Runtime's error taxonomy, parallel in shape to
 * `AccessGovernanceErrorCode` (`../access-governance/errors.ts`),
 * `TokenizationGovernanceErrorCode`, `CollateralizationGovernanceErrorCode`,
 * `LicenseGovernanceErrorCode` and `GovernanceStoreErrorCode`. Every failure
 * this module surfaces is one of these codes; raw driver/internal errors never
 * escape it.
 *
 * Note what is deliberately absent: there is no code for "the requester lacks
 * TRANSFER authority". That is not an error -- it is a governance denial,
 * produced by the Kernel and returned as a `denied`/`approval_required`
 * outcome with the Kernel's own reason codes, exactly as every other action's
 * denial is. This module never converts a governance decision into an
 * exception, and never converts an exception into a governance decision.
 *
 * Also deliberately absent, and specific to this action: no code here asserts
 * anything about the world outside AOC, and no code here asserts anything
 * about the *consequences* of a transfer inside AOC. There is no
 * `TRANSFER_TITLE_NOT_PASSED`, no `TRANSFEROR_DOES_NOT_HOLD_RIGHT`, no
 * `REGISTRY_NOT_UPDATED`, no `CONSIDERATION_UNPAID`, and -- most importantly
 * -- no `RECIPIENT_AUTHORITY_NOT_UPDATED`. AOC does not observe the first
 * four, and the fifth is not a failure at all: not moving authority is what
 * this module correctly does, and the fact that no mechanism exists to move it
 * is an architectural finding recorded in
 * `docs/architecture/ADR-TRANSFER-ACTION.md`, not a runtime error.
 *
 * What this module can say is whether an execution stayed inside what it
 * authorized -- `TRANSFER_EXECUTION_NOT_AUTHORIZED`.
 */
export type TransferGovernanceErrorCode =
  | 'TRANSFER_MANDATE_NOT_FOUND'
  | 'TRANSFER_MANDATE_ALREADY_EXISTS'
  | 'TRANSFER_MANDATE_NOT_ACTIVE'
  | 'TRANSFER_EXECUTION_NOT_FOUND'
  | 'TRANSFER_EXECUTION_ALREADY_RECORDED'
  | 'TRANSFER_EXECUTION_NOT_AUTHORIZED'
  | 'TRANSFER_LIFECYCLE_ALREADY_RECORDED'
  | 'TRANSFER_VALIDATION_ERROR'
  | 'TRANSFER_SCOPE_ESCALATION'
  | 'TRANSFER_INVALID_TIMESTAMP'
  | 'TRANSFER_TENANT_SCOPE_REQUIRED'
  | 'TRANSFER_ACCESS_SCOPE_VIOLATION'
  | 'TRANSFER_ASSET_TENANT_MISMATCH'
  | 'TRANSFER_STORE_UNAVAILABLE'
  | 'TRANSFER_RECORD_CORRUPTED'
  | 'TRANSFER_EVALUATION_FAILED'
  | 'TRANSFER_REQUEST_CONFLICT'
  | 'TRANSFER_PERSISTENCE_FAILED';

export class TransferGovernanceError extends Error {
  constructor(
    readonly code: TransferGovernanceErrorCode,
    message: string,
    readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = 'TransferGovernanceError';
  }
}

export function isTransferGovernanceError(error: unknown): error is TransferGovernanceError {
  return error instanceof TransferGovernanceError;
}
