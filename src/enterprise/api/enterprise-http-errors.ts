import type { GovernanceStoreError } from '../governance-store/errors.js';
import type { EvidenceError } from '../evidence/errors.js';

/**
 * The AOC Enterprise Host's own HTTP error taxonomy (mission's "Enterprise
 * Error Model"). A denied/approval-required/indeterminate governance
 * outcome is never represented as one of these -- those are successful
 * evaluations with a `KernelEvaluationResult` body; see
 * `mapDecisionStatusToHttpStatus` in `governance-evaluate-contract.ts` for
 * how `status` maps to an HTTP code. This class exists solely for failures
 * *before or around* the Kernel call: malformed requests, auth failures,
 * persistence conflicts, and genuine infrastructure/provider faults.
 */
export type EnterpriseHttpErrorCode =
  | 'INVALID_REQUEST'
  | 'AUTHENTICATION_FAILED'
  | 'AUTHORIZATION_FAILED'
  | 'CONCURRENCY_CONFLICT'
  | 'INFRASTRUCTURE_FAILURE'
  | 'PROVIDER_UNAVAILABLE'
  /** The Enterprise Module Lifecycle is not `ready` (still starting, degraded-blocking, shutting down, or stopped) -- a readiness failure, never a Kernel denial (mission section 16/37). */
  | 'ENTERPRISE_NOT_READY'
  | 'NOT_FOUND'
  /** Governance Store error codes surfaced on the wire (PR-004 section 43). The Store's own taxonomy is preserved verbatim so callers see one stable vocabulary. */
  | 'GOVERNANCE_IDEMPOTENCY_CONFLICT'
  | 'GOVERNANCE_STORE_UNAVAILABLE'
  | 'GOVERNANCE_STORE_TRANSACTION_FAILED'
  | 'GOVERNANCE_STORE_VALIDATION_ERROR'
  | 'GOVERNANCE_RECORD_NOT_FOUND'
  | 'GOVERNANCE_RECORD_CORRUPTED'
  | 'GOVERNANCE_RECORD_TOO_LARGE'
  | 'GOVERNANCE_ACCESS_SCOPE_VIOLATION'
  /** Evidence Bundle error codes surfaced on the wire (PR-005). The Evidence module's own taxonomy is preserved verbatim, mirroring how Governance Store errors are handled. */
  | 'EVIDENCE_VALIDATION_ERROR'
  | 'EVIDENCE_SOURCE_RECORD_NOT_FOUND'
  | 'EVIDENCE_DISCLOSURE_POLICY_UNKNOWN'
  | 'EVIDENCE_BUNDLE_NOT_FOUND'
  | 'EVIDENCE_ACCESS_SCOPE_VIOLATION'
  | 'EVIDENCE_TENANT_SCOPE_REQUIRED'
  | 'EVIDENCE_STORE_UNAVAILABLE'
  | 'EVIDENCE_BUNDLE_ALREADY_EXISTS';

export class EnterpriseHttpError extends Error {
  constructor(
    readonly httpStatus: number,
    readonly code: EnterpriseHttpErrorCode,
    message: string,
    readonly details?: readonly string[],
    /** Additional structured fields merged into the wire error body (e.g. `{ lifecycleState }` for `ENTERPRISE_NOT_READY`, per mission section 16). Never secrets. */
    readonly extra?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = 'EnterpriseHttpError';
  }
}

export const EnterpriseHttpErrors = {
  invalidRequest: (message: string, details?: readonly string[]) => new EnterpriseHttpError(400, 'INVALID_REQUEST', message, details),
  authenticationFailed: (message = 'Authentication is required.') => new EnterpriseHttpError(401, 'AUTHENTICATION_FAILED', message),
  authorizationFailed: (message = 'The caller is not authorized to call this endpoint.') => new EnterpriseHttpError(403, 'AUTHORIZATION_FAILED', message),
  concurrencyConflict: (message: string) => new EnterpriseHttpError(409, 'CONCURRENCY_CONFLICT', message),
  infrastructureFailure: (message = 'An unexpected Enterprise Host failure occurred.') => new EnterpriseHttpError(500, 'INFRASTRUCTURE_FAILURE', message),
  providerUnavailable: (message = 'A configured provider is unavailable.') => new EnterpriseHttpError(503, 'PROVIDER_UNAVAILABLE', message),
  enterpriseNotReady: (lifecycleState: string) =>
    new EnterpriseHttpError(503, 'ENTERPRISE_NOT_READY', 'AOC Enterprise is not ready to evaluate governance requests.', undefined, { lifecycleState }),
};

/**
 * Maps a `GovernanceStoreError` onto the wire (PR-004 section 43). Raw
 * driver/database details never reach the response — only the Store's own
 * taxonomy and message. Store validation errors default to 500 (they signal
 * a Host programming error, not caller input) unless the caller-input flag
 * says the offending value came off the wire (e.g. a bad query cursor).
 */
export function mapGovernanceStoreErrorToHttp(error: GovernanceStoreError, options: { readonly callerInput?: boolean } = {}): EnterpriseHttpError {
  switch (error.code) {
    case 'GOVERNANCE_IDEMPOTENCY_CONFLICT':
      return new EnterpriseHttpError(409, 'GOVERNANCE_IDEMPOTENCY_CONFLICT', error.message);
    case 'GOVERNANCE_STORE_UNAVAILABLE':
      return new EnterpriseHttpError(503, 'GOVERNANCE_STORE_UNAVAILABLE', 'The Governance Store is unavailable; the evaluation was not durably recorded.');
    case 'GOVERNANCE_STORE_TRANSACTION_FAILED':
      return new EnterpriseHttpError(500, 'GOVERNANCE_STORE_TRANSACTION_FAILED', 'The Governance Store transaction failed; the evaluation was not durably recorded.');
    case 'GOVERNANCE_RECORD_NOT_FOUND':
      return new EnterpriseHttpError(404, 'GOVERNANCE_RECORD_NOT_FOUND', error.message);
    case 'GOVERNANCE_RECORD_CORRUPTED':
    case 'GOVERNANCE_INTEGRITY_VERIFICATION_FAILED':
      return new EnterpriseHttpError(500, 'GOVERNANCE_RECORD_CORRUPTED', 'A stored governance record is corrupted; see server logs.');
    case 'GOVERNANCE_RECORD_TOO_LARGE':
    case 'GOVERNANCE_TRACE_LIMIT_EXCEEDED':
    case 'GOVERNANCE_EVENT_PAYLOAD_TOO_LARGE':
      return new EnterpriseHttpError(413, 'GOVERNANCE_RECORD_TOO_LARGE', error.message);
    case 'GOVERNANCE_TENANT_SCOPE_REQUIRED':
    case 'GOVERNANCE_ACCESS_SCOPE_VIOLATION':
      return new EnterpriseHttpError(403, 'GOVERNANCE_ACCESS_SCOPE_VIOLATION', error.message);
    case 'GOVERNANCE_STORE_VALIDATION_ERROR':
      return options.callerInput === true
        ? new EnterpriseHttpError(400, 'INVALID_REQUEST', error.message)
        : new EnterpriseHttpError(500, 'GOVERNANCE_STORE_VALIDATION_ERROR', 'The Governance Store rejected an internally-built record; see server logs.');
    case 'GOVERNANCE_SCHEMA_VERSION_UNSUPPORTED':
      return new EnterpriseHttpError(500, 'GOVERNANCE_STORE_TRANSACTION_FAILED', 'The Governance Store schema version is unsupported by this build.');
  }
}

/** Maps an `EvidenceError` onto the wire (PR-005), mirroring `mapGovernanceStoreErrorToHttp`. */
export function mapEvidenceErrorToHttp(error: EvidenceError): EnterpriseHttpError {
  switch (error.code) {
    case 'EVIDENCE_VALIDATION_ERROR':
    case 'EVIDENCE_DISCLOSURE_POLICY_UNKNOWN':
      return new EnterpriseHttpError(400, error.code, error.message);
    case 'EVIDENCE_SOURCE_RECORD_NOT_FOUND':
    case 'EVIDENCE_BUNDLE_NOT_FOUND':
      return new EnterpriseHttpError(404, error.code, error.message);
    case 'EVIDENCE_ACCESS_SCOPE_VIOLATION':
    case 'EVIDENCE_TENANT_SCOPE_REQUIRED':
      return new EnterpriseHttpError(403, error.code, error.message);
    case 'EVIDENCE_STORE_UNAVAILABLE':
      return new EnterpriseHttpError(503, error.code, error.message);
    case 'EVIDENCE_BUNDLE_ALREADY_EXISTS':
      return new EnterpriseHttpError(409, error.code, error.message);
  }
}
