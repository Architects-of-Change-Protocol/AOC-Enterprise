import { buildDemoPMFreakProjectContext } from '../pmfreak-demo-project-context.js';
import { PMFREAK_SCENARIO_SCHEDULE_CHANGE_APPLY_REPLAN_ID, PMFREAK_SCENARIO_SCHEDULE_CHANGE_DETECT_VARIANCE_ID } from '../pmfreak-project-governance-scenario-constants.js';
import type { PMFreakProjectGovernanceScenario } from '../pmfreak-project-governance-scenario-types.js';

const DETECT_ACTION_ID = 'pmfreak.foundation.action.schedule.detect_variance';
const APPLY_ACTION_ID = 'pmfreak.foundation.action.schedule.apply_change';

/**
 * Schedule Change -- Detect Variance.
 *
 * The Planning Agent detects schedule variance ahead of a possible replan.
 * This requires schedule-baseline and dependency evidence; it never
 * requires an approval on its own.
 *
 * (`schedule.propose_change`, this scenario's earlier target, is flagged in
 * the real Planning role profile's `humanApprovalRequiredFor`, so it can
 * never reach a bare `allow`; this scenario targets `schedule.detect_variance`
 * instead so it can still demonstrate the allow path. Proposing -- and
 * applying -- a replan both remain gated separately.)
 */
export const scheduleChangeDetectVarianceScenario: PMFreakProjectGovernanceScenario = {
  scenarioId: PMFREAK_SCENARIO_SCHEDULE_CHANGE_DETECT_VARIANCE_ID,
  title: 'Schedule Change -- Detect Variance',
  description:
    'The Planning Agent detects schedule variance against the project baseline. AOC Enterprise checks passport status, the real runtime guard, authority scope, capability, and required schedule-baseline and dependency evidence before allowing the detection to proceed. Proposing a replan, applying a change, or committing a new date to the customer are all out of scope for this action.',
  category: 'schedule_change',
  agentId: 'pmfreak.agent.planning',
  primaryRole: 'planning',
  action: {
    actionId: DETECT_ACTION_ID,
    actionCategory: 'read_data',
    toolName: 'schedule_reader',
    dataCategories: ['project.schedule'],
  },
  projectContext: buildDemoPMFreakProjectContext({ phase: 'planning' }),
  capabilityToken: {
    id: 'tok.pmfreak.scenario.schedule_change.detect_variance',
    capability: 'pmfreak.foundation.capability.schedule.detect_variance',
    resourceScopes: ['project.schedule'],
    riskLevel: 'medium',
  },
  evidenceRequirements: [
    { id: 'ev.pmfreak.scenario.schedule_change.schedule_baseline', type: 'schedule_baseline', description: 'The current schedule baseline.' },
    { id: 'ev.pmfreak.scenario.schedule_change.dependency_record', type: 'dependency_record', description: 'Dependency records affecting the schedule.' },
  ],
  approvalRequirements: [],
  baselineEvidenceIds: ['ev.pmfreak.scenario.schedule_change.schedule_baseline', 'ev.pmfreak.scenario.schedule_change.dependency_record'],
  baselineApprovalIds: [],
  expectedDecision: 'allow',
  context: {
    scheduleSensitive: true,
  },
  safeNarrative: 'The Planning Agent may detect variance and propose replanning, but cannot approve contractual date changes or externally commit to a new delivery date.',
};

/**
 * Schedule Change -- Apply Replan.
 *
 * The real Planning role profile explicitly prohibits `schedule.apply_change`,
 * so the real runtime guard always denies this attempt for this role,
 * regardless of evidence or approvals supplied -- a prohibited action is
 * denied before evidence or approval gating is ever evaluated.
 */
export const scheduleChangeApplyReplanScenario: PMFreakProjectGovernanceScenario = {
  scenarioId: PMFREAK_SCENARIO_SCHEDULE_CHANGE_APPLY_REPLAN_ID,
  title: 'Schedule Change -- Apply Replan',
  description:
    'The Planning Agent attempts to apply a schedule change that carries a customer-facing, contract-sensitive commitment. The real Planning role profile explicitly prohibits this action, so AOC Enterprise denies the attempt regardless of evidence or approvals.',
  category: 'schedule_change',
  agentId: 'pmfreak.agent.planning',
  primaryRole: 'planning',
  action: {
    actionId: APPLY_ACTION_ID,
    actionCategory: 'update_record',
    dataCategories: ['project.schedule'],
  },
  projectContext: buildDemoPMFreakProjectContext({ phase: 'execution' }),
  capabilityToken: {
    id: 'tok.pmfreak.scenario.schedule_change.apply_change',
    capability: 'pmfreak.foundation.capability.schedule.apply_change',
    resourceScopes: ['project.schedule'],
    riskLevel: 'high',
  },
  evidenceRequirements: [
    { id: 'ev.pmfreak.scenario.schedule_change.apply.schedule_baseline', type: 'schedule_baseline', description: 'The current schedule baseline.' },
    { id: 'ev.pmfreak.scenario.schedule_change.apply.dependency_record', type: 'dependency_record', description: 'Dependency records affecting the schedule.' },
  ],
  approvalRequirements: [],
  baselineEvidenceIds: ['ev.pmfreak.scenario.schedule_change.apply.schedule_baseline', 'ev.pmfreak.scenario.schedule_change.apply.dependency_record'],
  baselineApprovalIds: [],
  expectedDecision: 'deny',
  context: {
    scheduleSensitive: true,
    customerFacing: true,
    contractSensitive: true,
    customerCommitment: true,
  },
  safeNarrative: 'The Planning Agent may detect variance and recommend schedule changes, but cannot apply customer-impacting schedule changes under this real role profile.',
};

export const scheduleChangeScenarios: readonly PMFreakProjectGovernanceScenario[] = [scheduleChangeDetectVarianceScenario, scheduleChangeApplyReplanScenario];
