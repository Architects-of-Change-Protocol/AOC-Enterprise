import { findPMFreakAction } from '../../pmfreak-agent-passport/index.js';
import { buildDemoPMFreakProjectContext } from '../pmfreak-demo-project-context.js';
import { PMFREAK_SCENARIO_RISK_ESCALATION_PREPARE_ESCALATION_ID } from '../pmfreak-project-governance-scenario-constants.js';
import type { PMFreakProjectGovernanceScenario } from '../pmfreak-project-governance-scenario-types.js';

const PRIMARY_ACTION_ID = 'pmfreak.action.risk.create_draft';
const action = findPMFreakAction(PRIMARY_ACTION_ID);
if (action === undefined) throw new Error(`PMFreak Project Governance Scenario Pack: unknown action id "${PRIMARY_ACTION_ID}".`);

/**
 * Risk Escalation -- Prepare Escalation.
 *
 * The Risk Agent drafts a risk record and recommended mitigation.
 * `pmfreak.action.risk.create_draft` requires no evidence or approval in the
 * passport pack's action catalog -- closing a risk (`pmfreak.action.risk.close`)
 * does require a risk record and PM approval, but that action is explicitly
 * restricted for every demo Risk Agent passport, so this scenario -- which
 * models what the Risk Agent *can* attempt -- targets the draft action.
 */
export const riskEscalationPrepareEscalationScenario: PMFreakProjectGovernanceScenario = {
  scenarioId: PMFREAK_SCENARIO_RISK_ESCALATION_PREPARE_ESCALATION_ID,
  title: 'Risk Escalation -- Prepare Escalation',
  description:
    'The Risk Agent prepares a draft risk record and recommended mitigation for the unconfirmed-customer-acceptance risk. AOC Enterprise checks passport status, authority scope, and capability before allowing the draft to be prepared. Closing the risk, assigning blame, or escalating externally all remain out of scope for this action and require separate approval.',
  category: 'risk_escalation',
  primaryAgentId: 'pmfreak.agent.risk',
  primaryPassportId: 'aoc.passport.pmfreak.risk.demo.v1',
  primaryActionId: PRIMARY_ACTION_ID,
  projectContext: buildDemoPMFreakProjectContext({ phase: 'execution', status: 'at_risk' }),
  requiredEvidenceIds: action.requiresEvidenceIds,
  requiredApprovalIds: action.requiresApprovalIds,
  expectedDecision: 'allow',
  context: {},
  safeNarrative: 'The Risk Agent can prepare escalation material, but cannot assign blame, claim breach, or send escalation externally without approval.',
};

export const riskEscalationScenarios: readonly PMFreakProjectGovernanceScenario[] = [riskEscalationPrepareEscalationScenario];
