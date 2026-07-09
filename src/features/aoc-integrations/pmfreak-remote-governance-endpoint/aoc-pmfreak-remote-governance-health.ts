import { AOC_PMFREAK_REMOTE_GOVERNANCE_ENDPOINT_CAPABILITIES, AOC_PMFREAK_REMOTE_GOVERNANCE_ENDPOINT_ID } from './aoc-pmfreak-remote-governance-endpoint-constants.js';
import type { AocPMFreakRemoteGovernanceEndpointConfig, AocPMFreakRemoteGovernanceEndpointHealth, AocPMFreakRemoteGovernanceEndpointHealthStatus } from './aoc-pmfreak-remote-governance-endpoint-types.js';

export interface CreateAocPMFreakRemoteGovernanceEndpointHealthInput {
  readonly config: AocPMFreakRemoteGovernanceEndpointConfig;
  readonly warnings?: readonly string[];
  readonly errors?: readonly string[];
}

/**
 * Builds a health snapshot for the given config. No network call is
 * performed -- this is a pure, static evaluation of the config itself.
 * `status` is `unavailable` when the config is unsafe to evaluate requests
 * against (e.g. `environment: "production"` with `authMode: "none_demo"`) or
 * an explicit error was passed in, `degraded` when only warnings are
 * present, and `healthy` otherwise.
 */
export function createAocPMFreakRemoteGovernanceEndpointHealth(input: CreateAocPMFreakRemoteGovernanceEndpointHealthInput): AocPMFreakRemoteGovernanceEndpointHealth {
  const { config } = input;
  const warnings = [...config.warnings, ...(input.warnings ?? [])];
  const errors: string[] = [...(input.errors ?? [])];

  if (config.environment === 'production' && config.authMode === 'none_demo') {
    errors.push('authMode "none_demo" is not allowed in production; this endpoint cannot safely evaluate requests in its current configuration.');
  }

  const status: AocPMFreakRemoteGovernanceEndpointHealthStatus = errors.length > 0 ? 'unavailable' : warnings.length > 0 ? 'degraded' : 'healthy';

  return {
    endpointId: config.endpointId || AOC_PMFREAK_REMOTE_GOVERNANCE_ENDPOINT_ID,
    path: config.path,
    status,
    authMode: config.authMode,
    productionMutationCapable: false,
    pmfreakMutationCapable: false,
    actionExecutionCapable: false,
    invoiceCreationCapable: false,
    communicationCapable: false,
    checkedCapabilities: Object.values(AOC_PMFREAK_REMOTE_GOVERNANCE_ENDPOINT_CAPABILITIES),
    warnings,
    errors,
  };
}
