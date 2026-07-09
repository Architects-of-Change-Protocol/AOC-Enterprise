import { buildDemoPMFreakProjectContext } from '../pmfreak-demo-project-context.js';
import { PMFREAK_SCENARIO_RISK_ESCALATION_PREPARE_ESCALATION_ID } from '../pmfreak-project-governance-scenario-constants.js';
import type { PMFreakProjectGovernanceScenario } from '../pmfreak-project-governance-scenario-types.js';

const PRIMARY_ACTION_ID = 'pmfreak.foundation.action.risk.detect';

/**
 * Risk Escalation -- Prepare Escalation.
 *
 * The Risk Agent detects the unconfirmed-customer-acceptance risk ahead of
 * preparing an escalation draft. `risk.detect` requires no evidence or
 * approval on its own in this pack's declared requirements -- drafting
 * mitigation (`risk.draft_mitigation`) is flagged in the real Risk role
 * profile's `humanApprovalRequiredFor`, so this scenario -- which models
 * what the Risk Agent can attempt without triggering that gate -- targets
 * the detection action.
 */
export const riskEscalationPrepareEscalationScenario: PMFreakProjectGovernanceScenario = {
  scenarioId: PMFREAK_SCENARIO_RISK_ESCALATION_PREPARE_ESCALATION_ID,
  title: 'Risk Escalation -- Prepare Escalation',
  description:
    'The Risk Agent detects the unconfirmed-customer-acceptance risk in preparation for an escalation draft. AOC Enterprise checks passport status, the real runtime guard, authority scope, and capability before allowing the detection to proceed. Drafting mitigation, closing the risk, assigning blame, or escalating externally all remain out of scope for this action and require separate approval.',
  category: 'risk_escalation',
  agentId: 'pmfreak.agent.risk',
  primaryRole: 'risk',
  action: {
    actionId: PRIMARY_ACTION_ID,
    actionCategory: 'read_data',
    toolName: 'risk_register_reader',
    dataCategories: ['project.risk_register'],
  },
  projectContext: buildDemoPMFreakProjectContext({ phase: 'execution', status: 'at_risk' }),
  capabilityToken: {
    id: 'tok.pmfreak.scenario.risk_escalation.detect',
    capability: 'pmfreak.foundation.capability.risk.detect',
    resourceScopes: ['project.risk_register'],
    riskLevel: 'high',
  },
  evidenceRequirements: [
    { id: 'ev.pmfreak.scenario.risk_escalation.risk_record', type: 'risk_record', description: 'The unconfirmed-customer-acceptance risk record.' },
    { id: 'ev.pmfreak.scenario.risk_escalation.dependency_record', type: 'dependency_record', description: 'Dependency records relevant to the risk.' },
  ],
  approvalRequirements: [],
  baselineEvidenceIds: ['ev.pmfreak.scenario.risk_escalation.risk_record', 'ev.pmfreak.scenario.risk_escalation.dependency_record'],
  baselineApprovalIds: [],
  expectedDecision: 'allow',
  context: {},
  safeNarrative: 'The Risk Agent can detect risk and prepare escalation material, but cannot assign blame, claim breach, or send escalation externally without approval.',
};

export const riskEscalationScenarios: readonly PMFreakProjectGovernanceScenario[] = [riskEscalationPrepareEscalationScenario];
