import { AOC_PMFREAK_GOVERNANCE_INTAKE_CAPABILITIES, AOC_PMFREAK_GOVERNANCE_REQUEST_INTAKE_ID } from './aoc-pmfreak-governance-intake-constants.js';
import type { AocPMFreakGovernanceIntakeHealth, AocPMFreakGovernanceIntakeHealthStatus, AocPMFreakGovernanceRequestIntakeConfig } from './aoc-pmfreak-governance-intake-types.js';

/**
 * Builds a health snapshot for the given config. `status` is `unavailable`
 * when the evaluation mode cannot evaluate anything, `degraded` when the
 * config carries warnings (e.g. a caller asked for a forbidden mutation
 * flag that got forced back to `false`), and `healthy` otherwise.
 */
export function createAocPMFreakGovernanceIntakeHealth(config: AocPMFreakGovernanceRequestIntakeConfig): AocPMFreakGovernanceIntakeHealth {
  const warnings = [...config.warnings];
  const errors: string[] = [];

  if (config.evaluationMode === 'unsupported') {
    errors.push('Evaluation mode is "unsupported"; this intake cannot evaluate requests in its current configuration.');
  }

  const status: AocPMFreakGovernanceIntakeHealthStatus = errors.length > 0 ? 'unavailable' : warnings.length > 0 ? 'degraded' : 'healthy';

  return {
    intakeId: config.intakeId || AOC_PMFREAK_GOVERNANCE_REQUEST_INTAKE_ID,
    evaluationMode: config.evaluationMode,
    status,
    productionMutationCapable: false,
    pmfreakMutationCapable: false,
    actionExecutionCapable: false,
    checkedCapabilities: Object.values(AOC_PMFREAK_GOVERNANCE_INTAKE_CAPABILITIES),
    warnings,
    errors,
  };
}
