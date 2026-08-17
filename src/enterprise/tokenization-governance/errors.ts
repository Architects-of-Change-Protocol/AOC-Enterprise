/**
 * The Tokenization Governance Runtime's error taxonomy, parallel in shape to
 * `AccessGovernanceErrorCode` (`../access-governance/errors.ts`) and
 * `GovernanceStoreErrorCode`. Every failure this module surfaces is one of
 * these codes; raw driver/internal errors never escape it.
 *
 * Note what is deliberately absent: there is no code for "the requester
 * lacks TOKENIZE authority". That is not an error -- it is a governance
 * denial, produced by the Kernel and returned as a `denied`/`approval_required`
 * outcome with the Kernel's own reason codes, exactly as every other
 * capability's denial is. This module never converts a governance decision
 * into an exception, and never converts an exception into a governance
 * decision.
 */
export type TokenizationGovernanceErrorCode =
  | 'TOKENIZATION_MANDATE_NOT_FOUND'
  | 'TOKENIZATION_MANDATE_ALREADY_EXISTS'
  | 'TOKENIZATION_MANDATE_NOT_ACTIVE'
  | 'TOKENIZATION_EXECUTION_ALREADY_RECORDED'
  | 'TOKENIZATION_EXECUTION_NOT_AUTHORIZED'
  | 'TOKENIZATION_VALIDATION_ERROR'
  | 'TOKENIZATION_SCOPE_ESCALATION'
  | 'TOKENIZATION_INVALID_TIMESTAMP'
  | 'TOKENIZATION_TENANT_SCOPE_REQUIRED'
  | 'TOKENIZATION_ACCESS_SCOPE_VIOLATION'
  | 'TOKENIZATION_ASSET_TENANT_MISMATCH'
  | 'TOKENIZATION_STORE_UNAVAILABLE'
  | 'TOKENIZATION_EVALUATION_FAILED'
  | 'TOKENIZATION_REQUEST_CONFLICT'
  | 'TOKENIZATION_PERSISTENCE_FAILED';

export class TokenizationGovernanceError extends Error {
  constructor(
    readonly code: TokenizationGovernanceErrorCode,
    message: string,
    readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = 'TokenizationGovernanceError';
  }
}

export function isTokenizationGovernanceError(error: unknown): error is TokenizationGovernanceError {
  return error instanceof TokenizationGovernanceError;
}
