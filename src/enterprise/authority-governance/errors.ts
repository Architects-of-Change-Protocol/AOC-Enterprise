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
  | 'GOVERNED_AUTHORITY_RECORD_CORRUPTED';

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
