import { findPMFreakAction } from '../../pmfreak-agent-passport/index.js';
import { buildDemoPMFreakProjectContext } from '../pmfreak-demo-project-context.js';
import { PMFREAK_SCENARIO_SCHEDULE_CHANGE_APPLY_REPLAN_ID, PMFREAK_SCENARIO_SCHEDULE_CHANGE_PROPOSE_REPLAN_ID } from '../pmfreak-project-governance-scenario-constants.js';
import type { PMFreakProjectGovernanceScenario } from '../pmfreak-project-governance-scenario-types.js';

const PROPOSE_ACTION_ID = 'pmfreak.action.schedule.propose_change';
const proposeAction = findPMFreakAction(PROPOSE_ACTION_ID);
if (proposeAction === undefined) throw new Error(`PMFreak Project Governance Scenario Pack: unknown action id "${PROPOSE_ACTION_ID}".`);

const APPLY_ACTION_ID = 'pmfreak.action.schedule.apply_change';
const applyAction = findPMFreakAction(APPLY_ACTION_ID);
if (applyAction === undefined) throw new Error(`PMFreak Project Governance Scenario Pack: unknown action id "${APPLY_ACTION_ID}".`);

/**
 * Schedule Change -- Propose Replan.
 *
 * The Planning Agent proposes a schedule change. This action requires
 * schedule-baseline and dependency evidence per the passport pack's action
 * catalog; it never requires an approval on its own.
 */
export const scheduleChangeProposeReplanScenario: PMFreakProjectGovernanceScenario = {
  scenarioId: PMFREAK_SCENARIO_SCHEDULE_CHANGE_PROPOSE_REPLAN_ID,
  title: 'Schedule Change -- Propose Replan',
  description:
    'The Planning Agent proposes a replanning recommendation after detecting schedule variance. AOC Enterprise checks passport status, authority scope, capability, and required schedule-baseline and dependency evidence before allowing the proposal to proceed. Applying the change, or committing a new date to the customer, is out of scope for this action.',
  category: 'schedule_change',
  primaryAgentId: 'pmfreak.agent.planning',
  primaryPassportId: 'aoc.passport.pmfreak.planning.demo.v1',
  primaryActionId: PROPOSE_ACTION_ID,
  projectContext: buildDemoPMFreakProjectContext({ phase: 'planning' }),
  requiredEvidenceIds: proposeAction.requiresEvidenceIds,
  requiredApprovalIds: proposeAction.requiresApprovalIds,
  expectedDecision: 'allow',
  context: {
    scheduleSensitive: true,
  },
  safeNarrative: 'The Planning Agent may propose replanning, but cannot approve contractual date changes or externally commit to a new delivery date.',
};

/**
 * Schedule Change -- Apply Replan.
 *
 * Every demo Planning Agent passport explicitly restricts
 * `pmfreak.action.schedule.apply_change` (see `pmfreak-agent-passport-fixtures.ts`'s
 * `PLANNING_RESTRICTED_ACTION_IDS`), so `resolvePMFreakAgentPassportAction`
 * always denies this attempt for this passport, regardless of evidence or
 * approvals supplied -- a restricted action is denied before evidence or
 * approval gating is ever evaluated.
 */
export const scheduleChangeApplyReplanScenario: PMFreakProjectGovernanceScenario = {
  scenarioId: PMFREAK_SCENARIO_SCHEDULE_CHANGE_APPLY_REPLAN_ID,
  title: 'Schedule Change -- Apply Replan',
  description:
    'The Planning Agent attempts to apply a schedule change that carries a customer-facing, contract-sensitive commitment. The demo Planning Agent passport explicitly restricts this action, so AOC Enterprise denies the attempt regardless of evidence or approvals.',
  category: 'schedule_change',
  primaryAgentId: 'pmfreak.agent.planning',
  primaryPassportId: 'aoc.passport.pmfreak.planning.demo.v1',
  primaryActionId: APPLY_ACTION_ID,
  projectContext: buildDemoPMFreakProjectContext({ phase: 'execution' }),
  requiredEvidenceIds: applyAction.requiresEvidenceIds,
  requiredApprovalIds: applyAction.requiresApprovalIds,
  expectedDecision: 'deny',
  context: {
    scheduleSensitive: true,
    customerFacing: true,
    contractSensitive: true,
    customerCommitment: true,
  },
  safeNarrative: 'The Planning Agent may draft or recommend schedule changes, but cannot apply customer-impacting schedule changes under this demo passport.',
};

export const scheduleChangeScenarios: readonly PMFreakProjectGovernanceScenario[] = [scheduleChangeProposeReplanScenario, scheduleChangeApplyReplanScenario];
