/**
 * The Agent Passport Runtime's error taxonomy, parallel in shape to
 * `GovernanceStoreErrorCode`/`EvidenceErrorCode` (mission section 42).
 * Every failure this module surfaces is one of these codes; raw
 * driver/internal errors never escape it.
 */
export type AgentPassportErrorCode =
  | 'PASSPORT_NOT_FOUND'
  | 'PASSPORT_ALREADY_EXISTS'
  | 'PASSPORT_IDEMPOTENCY_CONFLICT'
  | 'PASSPORT_INVALID_STATE_TRANSITION'
  | 'PASSPORT_ALREADY_REVOKED'
  | 'PASSPORT_EXPIRED'
  | 'PASSPORT_TENANT_SCOPE_REQUIRED'
  | 'PASSPORT_ACCESS_SCOPE_VIOLATION'
  | 'PASSPORT_REFERENCE_INVALID'
  | 'PASSPORT_EVIDENCE_NOT_FOUND'
  | 'PASSPORT_GOVERNANCE_RECORD_NOT_FOUND'
  | 'PASSPORT_INTEGRITY_FAILED'
  | 'PASSPORT_STORE_UNAVAILABLE'
  | 'PASSPORT_VERSION_UNSUPPORTED'
  | 'PASSPORT_VALIDATION_ERROR';

export class AgentPassportError extends Error {
  constructor(
    readonly code: AgentPassportErrorCode,
    message: string,
    readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = 'AgentPassportError';
  }
}

export function isAgentPassportError(error: unknown): error is AgentPassportError {
  return error instanceof AgentPassportError;
}
