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
 * anything about the world outside AOC. There is no `TRANSFER_TITLE_NOT_PASSED`,
 * no `REGISTRY_NOT_UPDATED` and no `CONSIDERATION_UNPAID` — AOC observes none
 * of those, and a code for one would be a claim it cannot support.
 *
 * There is also no `RECIPIENT_AUTHORITY_NOT_UPDATED`, and there still should
 * not be. When this taxonomy was written, not moving authority was what this
 * module correctly did, because no mechanism existed to move it — an
 * architectural finding recorded in
 * `docs/architecture/ADR-TRANSFER-ACTION.md`. That mechanism now exists, and a
 * completed transfer does move recognized governed authority. It still does
 * not produce an error code here: a transition that cannot be conserved
 * surfaces as the authority layer's own
 * `GOVERNED_AUTHORITY_INSUFFICIENT_SCOPE`
 * (`../authority-governance/errors.ts`), because "the transferor does not hold
 * what is moving" is a fact about authority state rather than about this
 * module's mandates. That is also why there is no
 * `TRANSFEROR_DOES_NOT_HOLD_RIGHT` here.
 *
 * The same reasoning, applied again, is why there is no
 * `TRANSFER_AUTHORITY_UNAVAILABLE` either. A request that passed every
 * governance check but lost the race to commit the transferor's remaining
 * capacity surfaces as the authority layer's
 * `GOVERNED_AUTHORITY_AVAILABILITY_INSUFFICIENT`: how much of a holder's
 * authority already stands committed to still-live authorizations is a fact
 * about authority state, not about this module's mandates. It is deliberately
 * not reported as a governance `denied` outcome, either — the Kernel decided
 * `allowed`, that decision is durably committed, and restating it as a denial
 * would misreport what governance actually concluded. What failed is the
 * commitment, after the decision and before any artifact existed.
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
