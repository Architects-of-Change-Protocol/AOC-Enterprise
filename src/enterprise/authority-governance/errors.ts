/**
 * The Governed Authority Runtime's error taxonomy, parallel in shape to
 * `TransferGovernanceErrorCode` (`../transfer-governance/errors.ts`),
 * `LicenseGovernanceErrorCode` and `GovernanceStoreErrorCode`. Every failure
 * this module surfaces is one of these codes; raw driver errors never escape
 * it.
 *
 * Note what is deliberately absent, exactly as it is absent from the four
 * action modules: there is **no code for "the actor lacks authority over this
 * right"**. That is not an error. It is a governance denial, produced by the
 * Kernel from a `GovernedAuthorityCoverage` verdict and returned with the
 * Kernel's own reason codes, in the same shape every other denial in AOC has.
 * This module never converts a coverage verdict into an exception, and never
 * converts an exception into a coverage verdict — a store that cannot be read
 * is emphatically not an actor that holds nothing.
 *
 * The codes here are about *state that could not be written or trusted*:
 * a debit larger than the position, two quantities that cannot be added, a
 * tenant boundary crossed, a row whose digest no longer matches its contents.
 */
export type AuthorityGovernanceErrorCode =
  /** A conserving transition asked to debit more than the source position holds. Authority is never negative and never clamped. */
  | 'GOVERNED_AUTHORITY_INSUFFICIENT_SCOPE'
  /** Two scopes that cannot be compared or added met: a proportional share against a unit count, or two unit denominations AOC holds no conversion between. */
  | 'GOVERNED_AUTHORITY_SCOPE_INCOMPATIBLE'
  /** A scope that is not a well-formed non-negative integer quantity. */
  | 'GOVERNED_AUTHORITY_SCOPE_INVALID'
  /** A conserving transition named no source, or an issuing transition named one. The basis and the movement must agree. */
  | 'GOVERNED_AUTHORITY_BASIS_INVALID'
  /** Position creation was attempted outside a privileged administrative context. There is no self-issuance path. */
  | 'GOVERNED_AUTHORITY_BOOTSTRAP_NOT_PERMITTED'
  | 'GOVERNED_AUTHORITY_POSITION_NOT_FOUND'
  | 'GOVERNED_AUTHORITY_TRANSITION_CONFLICT'
  | 'GOVERNED_AUTHORITY_INVALID_TIMESTAMP'
  | 'GOVERNED_AUTHORITY_TENANT_SCOPE_REQUIRED'
  | 'GOVERNED_AUTHORITY_ACCESS_SCOPE_VIOLATION'
  | 'GOVERNED_AUTHORITY_STORE_UNAVAILABLE'
  /** A stored row's digest does not match its contents, or a transition chain link is broken. Reads fail closed rather than reconstructing authority from bytes that changed after commit. */
  | 'GOVERNED_AUTHORITY_RECORD_CORRUPTED'
  // -------------------------------------------------------------------------
  // Governed authority reservation. Same discipline, same deliberate absence:
  // there is **no code for "this holder lacks the authority"**. What is here is
  // about commitments that could not be *written* or *trusted*.
  // -------------------------------------------------------------------------
  /** The holder's authority is sufficient in isolation, but commitments already standing against it leave too little uncommitted. Distinct from `INSUFFICIENT_SCOPE` on purpose: the remedy is to wait or release, not to acquire more of the right. */
  | 'GOVERNED_AUTHORITY_AVAILABILITY_INSUFFICIENT'
  /** The same idempotency key was reused for a materially different commitment, or a reservation already reached a terminal state incompatible with the operation. Refused rather than reinterpreted. */
  | 'GOVERNED_AUTHORITY_RESERVATION_CONFLICT'
  | 'GOVERNED_AUTHORITY_RESERVATION_NOT_FOUND'
  /** A stored reservation's digest does not match its contents. Reads fail closed rather than dropping the row — silently skipping a tampered reservation would free exactly the capacity it commits. */
  | 'GOVERNED_AUTHORITY_RESERVATION_RECORD_CORRUPTED'
  // -------------------------------------------------------------------------
  // Holder-bound representation. Same taxonomy, same discipline, and the same
  // deliberate absence: there is **no code for "this representative may not
  // act for that holder"**. That is a governance denial, produced by the
  // Kernel from a `GovernedRepresentationCoverage` verdict, not an exception.
  // The codes below are about representations that could not be *written* or
  // *trusted*.
  // -------------------------------------------------------------------------
  /** A representation was granted outside a context permitted to grant it — a non-system caller using an issuing basis, or a redelegation by someone other than the parent's representative. There is no self-appointment path. */
  | 'GOVERNED_REPRESENTATION_GRANT_NOT_PERMITTED'
  /** A representation's own fields are not internally coherent: no rights, no actions, a party representing itself, an unknown governed right, or a malformed ceiling. */
  | 'GOVERNED_REPRESENTATION_INVALID'
  /** A basis that could not be corroborated: an `authority-graph-delegation` naming a grant that is absent, not live, in another trust domain, delegated to someone else, or held for a different principal; an evidence basis with no evidence; a redelegation naming a parent that does not exist or may not be redelegated. */
  | 'GOVERNED_REPRESENTATION_BASIS_INVALID'
  /** A redelegation would be wider than the representation it derives from, on any of the seven dimensions. No chain operation may broaden holder, resource, right, action, ceiling or either end of the validity window. */
  | 'GOVERNED_REPRESENTATION_SCOPE_EXPANSION'
  | 'GOVERNED_REPRESENTATION_NOT_FOUND'
  /** The same idempotency key was reused for a materially different representation. Refused rather than reinterpreted. */
  | 'GOVERNED_REPRESENTATION_CONFLICT'
  /** A stored representation's digest does not match its contents. Reads fail closed rather than recognizing a representation from bytes that changed after commit. */
  | 'GOVERNED_REPRESENTATION_RECORD_CORRUPTED';

export class AuthorityGovernanceError extends Error {
  constructor(
    readonly code: AuthorityGovernanceErrorCode,
    message: string,
    readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = 'AuthorityGovernanceError';
  }
}

export function isAuthorityGovernanceError(error: unknown): error is AuthorityGovernanceError {
  return error instanceof AuthorityGovernanceError;
}
