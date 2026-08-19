import { buildDemoPMFreakProjectContext } from '../pmfreak-demo-project-context.js';
import { PMFREAK_SCENARIO_MILESTONE_ACCEPTANCE_VALIDATE_ACCEPTANCE_ID } from '../pmfreak-project-governance-scenario-constants.js';
import type { PMFreakProjectGovernanceScenario } from '../pmfreak-project-governance-scenario-types.js';

const PRIMARY_ACTION_ID = 'pmfreak.foundation.action.evidence.classify';

/**
 * Milestone Acceptance -- Validate Acceptance Signals.
 *
 * The Evidence Agent classifies collected evidence for milestone acceptance
 * review. The Evidence Agent's real role profile explicitly cannot certify
 * customer acceptance itself (see its `prohibitedActions`), so
 * customer-acceptance and PM-approval sign-off remain gated by the Billing
 * Readiness scenario, which actually attempts the billing-sensitive action
 * that requires that evidence. This scenario never re-implements that gate
 * here.
 *
 * This scenario targets `evidence.classify` rather than
 * `evidence.prepare_bundle` (this scenario's earlier, demo-resolver
 * version) to keep the attempted action itself lower-risk while still
 * demonstrating the full evidence-gating path; preparing a bundle for
 * downstream sign-off is a separate action this pack does not attempt
 * here.
 */
export const milestoneAcceptanceValidateAcceptanceScenario: PMFreakProjectGovernanceScenario = {
  scenarioId: PMFREAK_SCENARIO_MILESTONE_ACCEPTANCE_VALIDATE_ACCEPTANCE_ID,
  title: 'Milestone Acceptance -- Validate Acceptance Signals',
  description:
    'The Evidence Agent classifies a bundle of collected evidence for milestone acceptance review. Soberanía Enterprise checks passport status, the real runtime guard, authority scope, capability, and required deliverable evidence before allowing the classification to proceed. The Evidence Agent cannot certify customer acceptance -- that decision is out of scope for this action and this pack.',
  category: 'milestone_acceptance',
  agentId: 'pmfreak.agent.evidence',
  primaryRole: 'evidence',
  action: {
    actionId: PRIMARY_ACTION_ID,
    actionCategory: 'read_data',
    toolName: 'evidence_classifier',
    dataCategories: ['project.evidence_store'],
  },
  projectContext: buildDemoPMFreakProjectContext({ phase: 'closure', status: 'pending_acceptance' }),
  capabilityToken: {
    id: 'tok.pmfreak.scenario.milestone_acceptance.classify',
    capability: 'pmfreak.foundation.capability.evidence.classify',
    resourceScopes: ['project.evidence_store'],
    riskLevel: 'medium',
  },
  evidenceRequirements: [{ id: 'ev.pmfreak.scenario.milestone_acceptance.deliverable_evidence', type: 'deliverable_evidence', description: 'Deliverable evidence for the Phase 1 delivery milestone.' }],
  approvalRequirements: [],
  baselineEvidenceIds: ['ev.pmfreak.scenario.milestone_acceptance.deliverable_evidence'],
  baselineApprovalIds: [],
  expectedDecision: 'allow',
  context: {
    projectClosureSensitive: true,
  },
  safeNarrative:
    'The Evidence Agent can organize evidence signals, including a deliverable-evidence bundle, but cannot certify customer acceptance. Customer acceptance and billing readiness for this milestone are governed separately by the Billing Readiness scenario.',
};

export const milestoneAcceptanceScenarios: readonly PMFreakProjectGovernanceScenario[] = [milestoneAcceptanceValidateAcceptanceScenario];
