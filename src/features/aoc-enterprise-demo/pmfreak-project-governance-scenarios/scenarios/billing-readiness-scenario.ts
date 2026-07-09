import { buildDemoPMFreakProjectContext } from '../pmfreak-demo-project-context.js';
import { PMFREAK_SCENARIO_BILLING_READINESS_CHECK_READINESS_ID } from '../pmfreak-project-governance-scenario-constants.js';
import type { PMFreakProjectGovernanceScenario } from '../pmfreak-project-governance-scenario-types.js';

const PRIMARY_ACTION_ID = 'pmfreak.foundation.action.billing.check_readiness';

/**
 * Billing Readiness -- Check Milestone Readiness.
 *
 * The Billing Readiness Agent checks whether the Phase 1 delivery milestone
 * appears ready for billing. Every gate below is enforced by
 * `resolvePMFreakAgentPassportAction`, imported from
 * `@aoc-enterprise/pmfreak-agent-passport-foundation` -- this scenario only
 * declares the evidence/approval requirements and the collected signals; it
 * never re-implements the gate itself.
 *
 * This scenario targets `billing.check_readiness` -- a read-only readiness
 * check -- rather than `billing.mark_ready` (the action this scenario's
 * earlier, demo-resolver version targeted), to keep the attempted action
 * itself low-risk while still demonstrating the full evidence/approval
 * gating path; marking a milestone ready for billing is a separate,
 * higher-risk action this pack does not attempt here.
 *
 * `allow` in this demo means only that AOC Enterprise's governance model
 * allows the agent to check readiness in PMFreak. It does not certify
 * invoice validity, does not certify customer acceptance, and does not
 * guarantee billing entitlement.
 */
export const billingReadinessCheckReadinessScenario: PMFreakProjectGovernanceScenario = {
  scenarioId: PMFREAK_SCENARIO_BILLING_READINESS_CHECK_READINESS_ID,
  title: 'Billing Readiness -- Check Milestone Readiness',
  description:
    'The Billing Readiness Agent checks whether the Phase 1 delivery milestone appears ready for billing. AOC Enterprise checks passport status, the real runtime guard, authority scope, capability, required deliverable and customer-acceptance evidence, and required PM/billing approvals before allowing the demo action to proceed.',
  category: 'billing_readiness',
  agentId: 'pmfreak.agent.billing_readiness',
  primaryRole: 'billing_readiness',
  action: {
    actionId: PRIMARY_ACTION_ID,
    actionCategory: 'read_data',
    toolName: 'billing_readiness_checker',
    dataCategories: ['project.billing_milestones'],
  },
  projectContext: buildDemoPMFreakProjectContext({ phase: 'billing', status: 'ready_for_billing_review' }),
  capabilityToken: {
    id: 'tok.pmfreak.scenario.billing_readiness.check_readiness',
    capability: 'pmfreak.foundation.capability.billing.check_readiness',
    resourceScopes: ['project.billing_milestones'],
    riskLevel: 'critical',
  },
  evidenceRequirements: [
    { id: 'ev.pmfreak.scenario.billing_readiness.deliverable_evidence', type: 'deliverable_evidence', description: 'Deliverable evidence for the Phase 1 delivery milestone.' },
    { id: 'ev.pmfreak.scenario.billing_readiness.customer_acceptance_record', type: 'customer_acceptance_record', description: 'Customer acceptance signal for the Phase 1 delivery milestone.' },
  ],
  approvalRequirements: [
    { id: 'appr.pmfreak.scenario.billing_readiness.pm_approval', type: 'pm_approval', riskLevel: 'critical' },
    { id: 'appr.pmfreak.scenario.billing_readiness.billing_review', type: 'billing_review', riskLevel: 'critical' },
  ],
  baselineEvidenceIds: ['ev.pmfreak.scenario.billing_readiness.deliverable_evidence', 'ev.pmfreak.scenario.billing_readiness.customer_acceptance_record'],
  baselineApprovalIds: ['appr.pmfreak.scenario.billing_readiness.pm_approval', 'appr.pmfreak.scenario.billing_readiness.billing_review'],
  expectedDecision: 'allow',
  context: {
    billingSensitive: true,
    projectClosureSensitive: true,
  },
  safeNarrative:
    'AOC allows the Billing Readiness Agent to check this milestone\'s readiness only once deliverable evidence, customer acceptance evidence, PM approval, and billing review are all present. This does not certify invoice validity, does not certify customer acceptance, and does not guarantee billing entitlement.',
};

export const billingReadinessScenarios: readonly PMFreakProjectGovernanceScenario[] = [billingReadinessCheckReadinessScenario];
