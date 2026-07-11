/**
 * The Governance Store's error taxonomy (mission section 42). Every failure
 * the Store surfaces is one of these codes — callers (the Enterprise
 * orchestrator, the HTTP adapter) map codes to transport concerns; raw
 * driver/database errors never escape the Store.
 */
export type GovernanceStoreErrorCode =
  /** The append/query input is structurally invalid (a programming or caller error, not storage trouble). */
  | 'GOVERNANCE_STORE_VALIDATION_ERROR'
  /** The underlying storage cannot be reached (closed connection, locked file, missing database). */
  | 'GOVERNANCE_STORE_UNAVAILABLE'
  /** A write transaction failed and was rolled back; nothing was persisted. */
  | 'GOVERNANCE_STORE_TRANSACTION_FAILED'
  /** No record exists for the requested identifier within the caller's scope. */
  | 'GOVERNANCE_RECORD_NOT_FOUND'
  /** A stored record is structurally broken (missing children, invalid JSON, broken linkage). */
  | 'GOVERNANCE_RECORD_CORRUPTED'
  /** Recomputed digests do not match the stored integrity metadata. */
  | 'GOVERNANCE_INTEGRITY_VERIFICATION_FAILED'
  /** The same idempotency scope+key (or requestId) was reused with a different request payload. */
  | 'GOVERNANCE_IDEMPOTENCY_CONFLICT'
  /** A non-system caller attempted a read/query without an organization scope. */
  | 'GOVERNANCE_TENANT_SCOPE_REQUIRED'
  /** A caller attempted to touch a record outside its authorized scope. */
  | 'GOVERNANCE_ACCESS_SCOPE_VIOLATION'
  /** A payload exceeds the configured persistence size limits. */
  | 'GOVERNANCE_RECORD_TOO_LARGE'
  /** The evaluation trace exceeds the configured maximum step count. */
  | 'GOVERNANCE_TRACE_LIMIT_EXCEEDED'
  /** One event payload exceeds the configured maximum size. */
  | 'GOVERNANCE_EVENT_PAYLOAD_TOO_LARGE'
  /** The stored schema version is not one this Store build understands. */
  | 'GOVERNANCE_SCHEMA_VERSION_UNSUPPORTED';

/** Which uniqueness boundary an idempotency conflict tripped — the caller-supplied idempotency key or the request id itself. Drives the HTTP mapping (both are 409s with different codes). */
export type GovernanceIdempotencyConflictKind = 'idempotency-key' | 'request-id';

export class GovernanceStoreError extends Error {
  constructor(
    readonly code: GovernanceStoreErrorCode,
    message: string,
    readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = 'GovernanceStoreError';
  }
}

export function isGovernanceStoreError(error: unknown): error is GovernanceStoreError {
  return error instanceof GovernanceStoreError;
}
