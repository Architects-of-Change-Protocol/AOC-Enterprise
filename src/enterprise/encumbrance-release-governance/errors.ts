/**
 * The Encumbrance Release Governance Runtime's error taxonomy, parallel in
 * shape to `CollateralizationGovernanceErrorCode`,
 * `TransferGovernanceErrorCode` and `AuthorityGovernanceErrorCode`. Every
 * failure this module surfaces is one of these codes; raw driver and adapter
 * errors never escape it.
 *
 * Note what is deliberately absent, exactly as it is absent from the four
 * existing action modules: there is **no code for "the requester lacks
 * RELEASE_ENCUMBRANCE authority"**. That is not an error — it is a governance
 * denial, produced by the Kernel and returned as a `denied` /
 * `approval_required` outcome carrying the Kernel's own reason codes. This
 * module never converts a governance decision into an exception, and never
 * converts an exception into a governance decision.
 *
 * Also deliberately absent, and specific to this action: nothing here asserts
 * anything about the world outside Soberanía. There is no
 * `LIEN_NOT_DISCHARGED`, no `DEBT_OUTSTANDING`, no `PAYOFF_INSUFFICIENT`, no
 * `REGISTRY_NOT_UPDATED`. Soberanía does not observe those facts and must not imply
 * that it does. What it can say is what a trusted executor reported, and
 * whether that report matched the constraint it was asked about —
 * `ENCUMBRANCE_RELEASE_EXECUTOR_TARGET_MISMATCH`.
 */
export type EncumbranceReleaseGovernanceErrorCode =
  | 'ENCUMBRANCE_RELEASE_MANDATE_NOT_FOUND'
  | 'ENCUMBRANCE_RELEASE_MANDATE_ALREADY_EXISTS'
  /** A second live release authorization was asked for over a constraint that already has one. Two concurrent commitments to discharge one thing is a fact a caller has to see rather than a race to resolve. */
  | 'ENCUMBRANCE_RELEASE_MANDATE_ALREADY_ACTIVE'
  /** The mandate is revoked, already spent, or outside its validity window at the moment execution was attempted. The executor is not called and the constraint stays active. */
  | 'ENCUMBRANCE_RELEASE_MANDATE_NOT_EXECUTABLE'
  | 'ENCUMBRANCE_RELEASE_EXECUTION_ALREADY_RECORDED'
  /** The target constraint does not exist in this tenant, or is no longer readable. Fails closed: an unresolvable target is never treated as an already-discharged one. */
  | 'ENCUMBRANCE_RELEASE_TARGET_NOT_FOUND'
  /** The target constraint is not `'active'`, and the request is not the idempotent replay of the execution that ended it. */
  | 'ENCUMBRANCE_RELEASE_TARGET_NOT_ACTIVE'
  /** The request named a resource, tenant or constraint that does not correspond to the stored constraint. No coercion: a mismatch is refused rather than reconciled. */
  | 'ENCUMBRANCE_RELEASE_TARGET_MISMATCH'
  /** A trusted executor reported success for a constraint other than the one it was asked about. Recorded as a definitive failure and never terminalized. */
  | 'ENCUMBRANCE_RELEASE_EXECUTOR_TARGET_MISMATCH'
  /** The executor could not be reached or threw. Distinct from a reported failure: the outcome is unknown, so the constraint stays active. */
  | 'ENCUMBRANCE_RELEASE_EXECUTOR_UNAVAILABLE'
  | 'ENCUMBRANCE_RELEASE_VALIDATION_ERROR'
  | 'ENCUMBRANCE_RELEASE_INVALID_TIMESTAMP'
  | 'ENCUMBRANCE_RELEASE_TENANT_SCOPE_REQUIRED'
  | 'ENCUMBRANCE_RELEASE_ACCESS_SCOPE_VIOLATION'
  | 'ENCUMBRANCE_RELEASE_RESOURCE_TENANT_MISMATCH'
  | 'ENCUMBRANCE_RELEASE_STORE_UNAVAILABLE'
  | 'ENCUMBRANCE_RELEASE_RECORD_CORRUPTED'
  | 'ENCUMBRANCE_RELEASE_EVALUATION_FAILED'
  | 'ENCUMBRANCE_RELEASE_REQUEST_CONFLICT'
  | 'ENCUMBRANCE_RELEASE_PERSISTENCE_FAILED';

export class EncumbranceReleaseGovernanceError extends Error {
  constructor(
    readonly code: EncumbranceReleaseGovernanceErrorCode,
    message: string,
    readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = 'EncumbranceReleaseGovernanceError';
  }
}

export function isEncumbranceReleaseGovernanceError(error: unknown): error is EncumbranceReleaseGovernanceError {
  return error instanceof EncumbranceReleaseGovernanceError;
}
