import { AOC_PMFREAK_REMOTE_GOVERNANCE_ENDPOINT_ID, AOC_PMFREAK_REMOTE_GOVERNANCE_ENDPOINT_ID_HEADER_NAME, AOC_PMFREAK_REMOTE_GOVERNANCE_ENDPOINT_SAFE_LABELS } from './aoc-pmfreak-remote-governance-endpoint-constants.js';
import { mapAocPMFreakRemoteGovernanceErrorToStatus } from './aoc-pmfreak-remote-governance-status-mapping.js';
import type {
  AocPMFreakGovernanceResponse,
  AocPMFreakRemoteGovernanceEndpointConfig,
  AocPMFreakRemoteGovernanceEndpointError,
  AocPMFreakRemoteGovernanceEndpointErrorBody,
  AocPMFreakRemoteGovernanceEndpointResponse,
  AocPMFreakRemoteGovernanceEndpointSuccessBody,
} from './aoc-pmfreak-remote-governance-endpoint-types.js';

function baseResponseHeaders(): Record<string, string> {
  return {
    'content-type': 'application/json',
    [AOC_PMFREAK_REMOTE_GOVERNANCE_ENDPOINT_ID_HEADER_NAME]: AOC_PMFREAK_REMOTE_GOVERNANCE_ENDPOINT_ID,
  };
}

/**
 * Serializes a successful governance evaluation. Always returns HTTP 200,
 * even when the governance decision itself is `deny`, `hold`, or any
 * `require_*` decision -- the endpoint succeeded; the decision lives in the
 * response body.
 */
export function serializeAocPMFreakRemoteGovernanceSuccess(
  response: AocPMFreakGovernanceResponse,
  config: AocPMFreakRemoteGovernanceEndpointConfig,
  warnings?: readonly string[],
): AocPMFreakRemoteGovernanceEndpointResponse {
  const body: AocPMFreakRemoteGovernanceEndpointSuccessBody = {
    ok: true,
    endpointId: config.endpointId,
    response,
    safeLabels: [...AOC_PMFREAK_REMOTE_GOVERNANCE_ENDPOINT_SAFE_LABELS],
    warnings: [...(warnings ?? [])],
  };

  return {
    status: 200,
    headers: baseResponseHeaders(),
    body,
  };
}

/** Serializes a safe endpoint error. Status is derived from the error code via `mapAocPMFreakRemoteGovernanceErrorToStatus`. */
export function serializeAocPMFreakRemoteGovernanceError(
  error: AocPMFreakRemoteGovernanceEndpointError,
  config: AocPMFreakRemoteGovernanceEndpointConfig,
  warnings?: readonly string[],
): AocPMFreakRemoteGovernanceEndpointResponse {
  const body: AocPMFreakRemoteGovernanceEndpointErrorBody = {
    ok: false,
    endpointId: config.endpointId,
    error,
    safeLabels: [...AOC_PMFREAK_REMOTE_GOVERNANCE_ENDPOINT_SAFE_LABELS],
    warnings: [...(warnings ?? [])],
  };

  return {
    status: mapAocPMFreakRemoteGovernanceErrorToStatus(error),
    headers: baseResponseHeaders(),
    body,
  };
}
