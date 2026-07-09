import { AOC_PMFREAK_GOVERNANCE_REQUEST_INTAKE_ID } from './aoc-pmfreak-governance-intake-constants.js';
import type { AocPMFreakGovernanceRequestIntakeConfig, AocPMFreakGovernanceRequestIntakeConfigInput } from './aoc-pmfreak-governance-intake-types.js';

/**
 * Builds a safe-by-default intake config. `allowPMFreakMutations`,
 * `allowActionExecution`, and `allowDecisionWriteback` are always forced to
 * `false` regardless of what the caller requests -- a caller attempting to
 * enable any of them gets a deterministic warning explaining why the
 * request was ignored, rather than a silent override.
 */
export function createAocPMFreakGovernanceRequestIntakeConfig(input?: AocPMFreakGovernanceRequestIntakeConfigInput): AocPMFreakGovernanceRequestIntakeConfig {
  const warnings: string[] = [...(input?.warnings ?? [])];

  if (input?.allowPMFreakMutations === true) {
    warnings.push('allowPMFreakMutations was requested but is forced to false; this intake never mutates PMFreak data.');
  }
  if (input?.allowActionExecution === true) {
    warnings.push('allowActionExecution was requested but is forced to false; this intake never executes PMFreak actions.');
  }
  if (input?.allowDecisionWriteback === true) {
    warnings.push('allowDecisionWriteback was requested but is forced to false; this intake never writes decisions back to PMFreak.');
  }

  return {
    intakeId: input?.intakeId ?? AOC_PMFREAK_GOVERNANCE_REQUEST_INTAKE_ID,
    environment: input?.environment ?? 'demo',
    evaluationMode: input?.evaluationMode ?? 'deterministic_local',
    requestMode: input?.requestMode ?? 'dry_run',
    allowPMFreakMutations: false,
    allowActionExecution: false,
    allowDecisionWriteback: false,
    timeoutMs: input?.timeoutMs ?? 5000,
    maxPayloadSizeKb: input?.maxPayloadSizeKb ?? 256,
    redactionMode: input?.redactionMode ?? 'safe_demo',
    notes: [...(input?.notes ?? [])],
    warnings,
  };
}
