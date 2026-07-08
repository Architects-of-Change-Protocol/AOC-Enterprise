import { findPMFreakAction } from '../../pmfreak-agent-passport/index.js';
import { buildDemoPMFreakProjectContext } from '../pmfreak-demo-project-context.js';
import { PMFREAK_SCENARIO_MILESTONE_ACCEPTANCE_VALIDATE_ACCEPTANCE_ID } from '../pmfreak-project-governance-scenario-constants.js';
import type { PMFreakProjectGovernanceScenario } from '../pmfreak-project-governance-scenario-types.js';

const PRIMARY_ACTION_ID = 'pmfreak.action.evidence.prepare_bundle';
const action = findPMFreakAction(PRIMARY_ACTION_ID);
if (action === undefined) throw new Error(`PMFreak Project Governance Scenario Pack: unknown action id "${PRIMARY_ACTION_ID}".`);

/**
 * Milestone Acceptance -- Validate Acceptance Signals.
 *
 * The Evidence Agent prepares an evidence bundle for milestone acceptance
 * review. Its passport-pack action, `pmfreak.action.evidence.prepare_bundle`,
 * requires only deliverable evidence -- the Evidence Agent's role profile
 * explicitly cannot certify customer acceptance itself (see
 * `pmfreak-agent-roles.ts`'s `evidence_agent` safe-operating notes), so
 * customer-acceptance and PM-approval sign-off remain gated by the
 * Billing Readiness scenario, which actually attempts the billing-sensitive
 * action that requires that evidence. This scenario never re-implements
 * that gate here.
 */
export const milestoneAcceptanceValidateAcceptanceScenario: PMFreakProjectGovernanceScenario = {
  scenarioId: PMFREAK_SCENARIO_MILESTONE_ACCEPTANCE_VALIDATE_ACCEPTANCE_ID,
  title: 'Milestone Acceptance -- Validate Acceptance Signals',
  description:
    'The Evidence Agent prepares a bundle of collected evidence for milestone acceptance review. AOC Enterprise checks passport status, authority scope, capability, and required deliverable evidence before allowing the bundle to be prepared. The Evidence Agent cannot certify customer acceptance -- that decision is out of scope for this action and this pack.',
  category: 'milestone_acceptance',
  primaryAgentId: 'pmfreak.agent.evidence',
  primaryPassportId: 'aoc.passport.pmfreak.evidence.demo.v1',
  primaryActionId: PRIMARY_ACTION_ID,
  projectContext: buildDemoPMFreakProjectContext({ phase: 'closure', status: 'pending_acceptance' }),
  requiredEvidenceIds: action.requiresEvidenceIds,
  requiredApprovalIds: action.requiresApprovalIds,
  expectedDecision: 'allow',
  context: {
    projectClosureSensitive: true,
  },
  safeNarrative:
    'The Evidence Agent can organize evidence signals, including a deliverable-evidence bundle, but cannot certify customer acceptance. Customer acceptance and billing readiness for this milestone are governed separately by the Billing Readiness scenario.',
};

export const milestoneAcceptanceScenarios: readonly PMFreakProjectGovernanceScenario[] = [milestoneAcceptanceValidateAcceptanceScenario];
