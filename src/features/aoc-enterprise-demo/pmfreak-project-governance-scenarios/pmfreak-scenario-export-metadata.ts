import { assertNoPMFreakScenarioOverclaim } from './pmfreak-scenario-claim-safety.js';
import { PMFREAK_PROJECT_GOVERNANCE_SCENARIO_PACK_ID } from './pmfreak-project-governance-scenario-constants.js';
import type { PMFreakDemoProjectContext, PMFreakProjectGovernanceScenarioExportMetadata, PMFreakProjectGovernanceScenarioRunResult } from './pmfreak-project-governance-scenario-types.js';

/**
 * Builds export metadata for a single scenario run result -- a claim-safe,
 * deterministic audit record. Never claims legal approval, compliance
 * certification, guaranteed billing, production authorization, invoice
 * validity, or customer acceptance certification; re-scanned here with
 * `assertNoPMFreakScenarioOverclaim` as defense in depth.
 */
export function createPMFreakProjectGovernanceScenarioExportMetadata(
  result: PMFreakProjectGovernanceScenarioRunResult,
  projectContext: PMFreakDemoProjectContext,
): PMFreakProjectGovernanceScenarioExportMetadata {
  const metadata: PMFreakProjectGovernanceScenarioExportMetadata = {
    packId: PMFREAK_PROJECT_GOVERNANCE_SCENARIO_PACK_ID,
    exportId: `aoc.export.pmfreak.project_governance_scenario.${result.actionAttemptId}`,
    scenarioId: result.scenarioId,
    scenarioTitle: result.scenarioTitle,
    category: result.category,
    projectContext,
    agentId: result.agentId,
    ...(result.role !== undefined ? { role: result.role } : {}),
    actionId: result.actionId,
    passportResolution: result.passportResolution,
    decision: result.decision,
    requiredEvidenceIds: result.passportResolution.requiredEvidenceIds,
    missingEvidenceIds: result.missingEvidenceIds,
    requiredApprovalIds: result.passportResolution.requiredApprovalIds,
    missingApprovalIds: result.missingApprovalIds,
    appliedPolicyPackIds: result.appliedPolicyPackIds,
    jurisdictionPackIds: result.jurisdictionPackIds,
    scenarioTrace: result.scenarioTrace,
    warnings: result.warnings,
    errors: result.errors,
    safeFraming: {
      notLegalAdvice: true,
      notComplianceCertification: true,
      noCompletenessClaim: true,
      demoOnly: true,
    },
  };

  assertNoPMFreakScenarioOverclaim(metadata);
  return metadata;
}
