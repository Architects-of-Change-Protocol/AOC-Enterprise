import {
  AOC_PMFREAK_REMOTE_GOVERNANCE_DEFAULT_PATH,
  AOC_PMFREAK_REMOTE_GOVERNANCE_ENDPOINT_CAPABILITIES,
  AOC_PMFREAK_REMOTE_GOVERNANCE_ENDPOINT_DISCLAIMERS,
  AOC_PMFREAK_REMOTE_GOVERNANCE_ENDPOINT_FORBIDDEN_OPERATIONS,
  AOC_PMFREAK_REMOTE_GOVERNANCE_ENDPOINT_ID,
  AOC_PMFREAK_REMOTE_GOVERNANCE_ENDPOINT_NAME,
  AOC_PMFREAK_REMOTE_GOVERNANCE_ENDPOINT_SAFE_LABELS,
} from './aoc-pmfreak-remote-governance-endpoint-constants.js';
import { assertNoAocPMFreakRemoteGovernanceEndpointOverclaim } from './aoc-pmfreak-remote-governance-claim-safety.js';
import type { AocPMFreakRemoteGovernanceEndpointDescriptor } from './aoc-pmfreak-remote-governance-endpoint-types.js';

/**
 * Builds the descriptor for `aoc.integration.pmfreak.remote_governance_endpoint.v1`.
 *
 * AOC Enterprise is the governance provider; PMFreak is the governance
 * consumer -- the runtime direction is `pmfreak_consumes_aoc_governance`,
 * never the reverse. This endpoint receives PMFreak governance requests over
 * a request/response boundary, evaluates them through the already-merged AOC
 * PMFreak Governance Request Intake, and returns governed AOC decisions; it
 * never mutates PMFreak data, executes a PMFreak action, writes a decision
 * back into PMFreak, sends a communication, or creates an invoice.
 */
export function createAocPMFreakRemoteGovernanceEndpointDescriptor(): AocPMFreakRemoteGovernanceEndpointDescriptor {
  const descriptor: AocPMFreakRemoteGovernanceEndpointDescriptor = {
    endpointId: AOC_PMFREAK_REMOTE_GOVERNANCE_ENDPOINT_ID,
    endpointName: AOC_PMFREAK_REMOTE_GOVERNANCE_ENDPOINT_NAME,
    providerId: 'aoc',
    consumerId: 'pmfreak',
    version: 'v1',
    mode: 'remote_governance_endpoint',
    runtimeDirection: 'pmfreak_consumes_aoc_governance',
    defaultPath: AOC_PMFREAK_REMOTE_GOVERNANCE_DEFAULT_PATH,
    productionMutationCapable: false,
    pmfreakMutationCapable: false,
    actionExecutionCapable: false,
    invoiceCreationCapable: false,
    communicationCapable: false,
    capabilities: Object.values(AOC_PMFREAK_REMOTE_GOVERNANCE_ENDPOINT_CAPABILITIES),
    forbiddenOperations: [...AOC_PMFREAK_REMOTE_GOVERNANCE_ENDPOINT_FORBIDDEN_OPERATIONS],
    safeLabels: [...AOC_PMFREAK_REMOTE_GOVERNANCE_ENDPOINT_SAFE_LABELS],
    disclaimers: [...AOC_PMFREAK_REMOTE_GOVERNANCE_ENDPOINT_DISCLAIMERS],
  };

  assertNoAocPMFreakRemoteGovernanceEndpointOverclaim(descriptor);
  return descriptor;
}
