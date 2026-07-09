import type { PolicyPackControlPlaneRequirement } from '../../policy-pack-foundation/manifest/policy-pack-manifest-types.js';
import { assertNoPMFreakScenarioOverclaim } from './pmfreak-scenario-claim-safety.js';
import { PMFREAK_PROJECT_GOVERNANCE_SCENARIO_PACK_ID } from './pmfreak-project-governance-scenario-constants.js';
import type { PMFreakProjectGovernanceScenarioControlPlaneSummary, PMFreakProjectGovernanceScenarioRunResult } from './pmfreak-project-governance-scenario-types.js';

/**
 * Safe, natural-language Control Plane labels for the Project Governance
 * Scenario Pack. Every label is checked by this pack's own tests against
 * `evaluatePMFreakScenarioClaimSafety` -- none claims invoice validity,
 * customer acceptance certification, contractual compliance, or full trust.
 */
export const PMFREAK_SCENARIO_CONTROL_PLANE_SAFE_LABELS = [
  'PMFreak project governance scenario',
  'AOC-governed agent',
  'Demo scenario',
  'Passport-gated',
  'Capability-gated',
  'Authority-scoped',
  'Evidence required',
  'Approval required',
  'Audit-ready',
  'Not production integration',
  'Not compliance certification',
  'No invoice validity claimed',
  'No customer acceptance certification',
] as const;

/** The Control Plane requirement carried on the scenario pack manifest itself. */
export const PMFREAK_SCENARIO_CONTROL_PLANE_REQUIREMENT: PolicyPackControlPlaneRequirement = {
  id: `${PMFREAK_PROJECT_GOVERNANCE_SCENARIO_PACK_ID}.control-plane`,
  surface: 'policy_pack',
  required: true,
  safeDisplayLabels: PMFREAK_SCENARIO_CONTROL_PLANE_SAFE_LABELS,
};

/**
 * Builds a Control Plane summary for a single scenario run result. Never
 * renders UI and never calls a real Control Plane -- this is a plain,
 * deterministic, claim-safe data projection of the run result, re-scanned
 * here with `assertNoPMFreakScenarioOverclaim` as defense in depth.
 */
export function createPMFreakProjectGovernanceScenarioControlPlaneSummary(result: PMFreakProjectGovernanceScenarioRunResult): PMFreakProjectGovernanceScenarioControlPlaneSummary {
  const summary: PMFreakProjectGovernanceScenarioControlPlaneSummary = {
    scenarioId: result.scenarioId,
    scenarioTitle: result.scenarioTitle,
    category: result.category,
    projectId: result.projectId,
    workspaceId: result.workspaceId,
    ...(result.customerId !== undefined ? { customerId: result.customerId } : {}),
    agentId: result.agentId,
    ...(result.role !== undefined ? { role: result.role } : {}),
    actionId: result.actionId,
    decision: result.decision,
    passportStatus: result.passportResolution.passportStatus,
    allowedByRuntimeGuard: result.passportResolution.allowedByRuntimeGuard,
    allowedByCapabilityToken: result.passportResolution.allowedByCapabilityToken,
    allowedByAuthorityScope: result.passportResolution.allowedByAuthorityScope,
    evidenceSatisfied: result.evidenceSatisfied,
    approvalsSatisfied: result.approvalsSatisfied,
    missingEvidenceIds: result.missingEvidenceIds,
    missingApprovalIds: result.missingApprovalIds,
    appliedPolicyPackIds: result.appliedPolicyPackIds,
    jurisdictionPackIds: result.jurisdictionPackIds,
    scenarioTrace: result.scenarioTrace,
    safeDisplayLabels: PMFREAK_SCENARIO_CONTROL_PLANE_SAFE_LABELS,
    warnings: result.warnings,
    errors: result.errors,
  };

  assertNoPMFreakScenarioOverclaim(summary);
  return summary;
}
