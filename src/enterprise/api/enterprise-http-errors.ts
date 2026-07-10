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
  | 'ENTERPRISE_NOT_READY';

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
