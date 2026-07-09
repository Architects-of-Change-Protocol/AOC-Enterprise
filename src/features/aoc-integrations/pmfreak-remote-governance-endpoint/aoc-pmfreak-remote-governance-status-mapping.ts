import type { AocPMFreakRemoteGovernanceEndpointError, AocPMFreakRemoteGovernanceEndpointErrorCode } from './aoc-pmfreak-remote-governance-endpoint-types.js';

/**
 * Maps an endpoint error code to a safe HTTP-like status. A successful
 * governance decision (including `deny`, `hold`, or any `require_*`
 * decision) always returns HTTP 200 via the success serializer -- the
 * endpoint succeeded, and the governance decision itself lives in the
 * response body, never in the HTTP status.
 */
const STATUS_BY_ERROR_CODE: Readonly<Record<AocPMFreakRemoteGovernanceEndpointErrorCode, number>> = {
  invalid_method: 405,
  unsupported_content_type: 415,
  payload_too_large: 413,
  auth_required: 401,
  auth_failed: 403,
  unsafe_production_config: 503,
  invalid_request: 400,
  evaluation_failed: 500,
  serialization_failed: 500,
  unsafe_claim: 500,
  mutation_not_allowed: 500,
  unknown_error: 500,
};

export function mapAocPMFreakRemoteGovernanceErrorToStatus(error: AocPMFreakRemoteGovernanceEndpointError): number {
  return STATUS_BY_ERROR_CODE[error.code] ?? 500;
}
