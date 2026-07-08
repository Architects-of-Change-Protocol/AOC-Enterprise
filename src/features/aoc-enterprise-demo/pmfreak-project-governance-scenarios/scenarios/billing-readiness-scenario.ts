import { findPMFreakAction } from '../../pmfreak-agent-passport/index.js';
import { buildDemoPMFreakProjectContext } from '../pmfreak-demo-project-context.js';
import { PMFREAK_SCENARIO_BILLING_READINESS_MARK_MILESTONE_READY_ID } from '../pmfreak-project-governance-scenario-constants.js';
import type { PMFreakProjectGovernanceScenario } from '../pmfreak-project-governance-scenario-types.js';

const PRIMARY_ACTION_ID = 'pmfreak.action.billing.mark_ready';
const action = findPMFreakAction(PRIMARY_ACTION_ID);
if (action === undefined) throw new Error(`PMFreak Project Governance Scenario Pack: unknown action id "${PRIMARY_ACTION_ID}".`);

/**
 * Billing Readiness -- Mark Milestone Ready.
 *
 * The Billing Readiness Agent attempts to mark a milestone ready for
 * billing. This scenario's required evidence/approvals are read directly
 * from the PMFreak Agent Passport Demo Pack's `pmfreak.action.billing.mark_ready`
 * action definition -- never re-declared here -- so this scenario can never
 * drift from what `resolvePMFreakAgentPassportAction` actually enforces.
 *
 * `allow` in this demo means only that AOC Enterprise's demo governance
 * policy allows the agent to mark readiness in PMFreak. It does not certify
 * invoice validity, does not certify customer acceptance, and does not
 * guarantee billing entitlement.
 */
export const billingReadinessMarkMilestoneReadyScenario: PMFreakProjectGovernanceScenario = {
  scenarioId: PMFREAK_SCENARIO_BILLING_READINESS_MARK_MILESTONE_READY_ID,
  title: 'Billing Readiness -- Mark Milestone Ready',
  description:
    'The Billing Readiness Agent attempts to mark the Phase 1 delivery milestone ready for billing. AOC Enterprise checks passport status, authority scope, capability, required deliverable and customer-acceptance evidence, and required PM/billing approvals before allowing the demo action to proceed.',
  category: 'billing_readiness',
  primaryAgentId: 'pmfreak.agent.billing_readiness',
  primaryPassportId: 'aoc.passport.pmfreak.billing_readiness.demo.v1',
  primaryActionId: PRIMARY_ACTION_ID,
  projectContext: buildDemoPMFreakProjectContext({ phase: 'billing', status: 'ready_for_billing_review' }),
  requiredEvidenceIds: action.requiresEvidenceIds,
  requiredApprovalIds: action.requiresApprovalIds,
  expectedDecision: 'allow',
  context: {
    billingSensitive: true,
    projectClosureSensitive: true,
  },
  safeNarrative:
    'AOC allows the demo governance policy to permit the Billing Readiness Agent to mark this milestone ready for billing only once deliverable evidence, customer acceptance evidence, PM approval, and billing review are all present. This does not certify invoice validity, does not certify customer acceptance, and does not guarantee billing entitlement.',
};

export const billingReadinessScenarios: readonly PMFreakProjectGovernanceScenario[] = [billingReadinessMarkMilestoneReadyScenario];
