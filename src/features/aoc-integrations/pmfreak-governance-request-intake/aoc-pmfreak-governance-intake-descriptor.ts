import {
  AOC_PMFREAK_GOVERNANCE_INTAKE_CAPABILITIES,
  AOC_PMFREAK_GOVERNANCE_INTAKE_DISCLAIMERS,
  AOC_PMFREAK_GOVERNANCE_INTAKE_FORBIDDEN_OPERATIONS,
  AOC_PMFREAK_GOVERNANCE_INTAKE_SAFE_LABELS,
  AOC_PMFREAK_GOVERNANCE_REQUEST_INTAKE_ID,
  AOC_PMFREAK_GOVERNANCE_REQUEST_INTAKE_NAME,
} from './aoc-pmfreak-governance-intake-constants.js';
import { assertNoAocPMFreakGovernanceIntakeOverclaim } from './aoc-pmfreak-governance-intake-claim-safety.js';
import type { AocPMFreakGovernanceRequestIntakeDescriptor } from './aoc-pmfreak-governance-intake-types.js';

/**
 * Builds the descriptor for `aoc.integration.pmfreak.governance_request_intake.v1`.
 *
 * AOC Enterprise is the governance provider; PMFreak is the governance
 * consumer -- the runtime direction is `pmfreak_consumes_aoc_governance`,
 * never the reverse. This intake receives, validates, and evaluates PMFreak
 * governance requests and returns governed AOC decisions; it never mutates
 * PMFreak data, executes a PMFreak action, or writes a decision back into
 * PMFreak.
 */
export function createAocPMFreakGovernanceRequestIntakeDescriptor(): AocPMFreakGovernanceRequestIntakeDescriptor {
  const descriptor: AocPMFreakGovernanceRequestIntakeDescriptor = {
    intakeId: AOC_PMFREAK_GOVERNANCE_REQUEST_INTAKE_ID,
    intakeName: AOC_PMFREAK_GOVERNANCE_REQUEST_INTAKE_NAME,
    providerId: 'aoc',
    consumerId: 'pmfreak',
    version: 'v1',
    mode: 'governance_request_intake',
    runtimeDirection: 'pmfreak_consumes_aoc_governance',
    productionMutationCapable: false,
    pmfreakMutationCapable: false,
    actionExecutionCapable: false,
    capabilities: Object.values(AOC_PMFREAK_GOVERNANCE_INTAKE_CAPABILITIES),
    forbiddenOperations: [...AOC_PMFREAK_GOVERNANCE_INTAKE_FORBIDDEN_OPERATIONS],
    safeLabels: [...AOC_PMFREAK_GOVERNANCE_INTAKE_SAFE_LABELS],
    disclaimers: [...AOC_PMFREAK_GOVERNANCE_INTAKE_DISCLAIMERS],
  };

  assertNoAocPMFreakGovernanceIntakeOverclaim(descriptor);
  return descriptor;
}
