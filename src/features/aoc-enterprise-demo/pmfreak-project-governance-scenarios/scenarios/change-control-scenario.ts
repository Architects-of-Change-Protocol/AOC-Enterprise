import { findPMFreakAction } from '../../pmfreak-agent-passport/index.js';
import { buildDemoPMFreakProjectContext } from '../pmfreak-demo-project-context.js';
import { PMFREAK_SCENARIO_CHANGE_CONTROL_APPROVE_CHANGE_REQUEST_ID, PMFREAK_SCENARIO_CHANGE_CONTROL_CLASSIFY_CHANGE_REQUEST_ID } from '../pmfreak-project-governance-scenario-constants.js';
import type { PMFreakProjectGovernanceScenario } from '../pmfreak-project-governance-scenario-types.js';

const CLASSIFY_ACTION_ID = 'pmfreak.action.change_control.classify_request';
const classifyAction = findPMFreakAction(CLASSIFY_ACTION_ID);
if (classifyAction === undefined) throw new Error(`PMFreak Project Governance Scenario Pack: unknown action id "${CLASSIFY_ACTION_ID}".`);

const APPROVE_ACTION_ID = 'pmfreak.action.change_control.approve_request';
const approveAction = findPMFreakAction(APPROVE_ACTION_ID);
if (approveAction === undefined) throw new Error(`PMFreak Project Governance Scenario Pack: unknown action id "${APPROVE_ACTION_ID}".`);

/**
 * Change Control -- Classify Change Request.
 *
 * `pmfreak.action.change_control.classify_request` requires a change-request
 * record per the passport pack's action catalog. When the request also
 * carries a contract-sensitive impact, the resolver's decision priority
 * (`deny > require_legal_review > require_contract_review > ... > require_evidence`,
 * documented in `pmfreak-passport-resolver.ts`) surfaces `require_contract_review`
 * ahead of `require_evidence`, even if the change-request-record evidence is
 * also missing -- this scenario documents that chosen priority rather than
 * re-deciding it.
 */
export const changeControlClassifyChangeRequestScenario: PMFreakProjectGovernanceScenario = {
  scenarioId: PMFREAK_SCENARIO_CHANGE_CONTROL_CLASSIFY_CHANGE_REQUEST_ID,
  title: 'Change Control -- Classify Change Request',
  description:
    'The Change Control Agent classifies and routes the scope-adjustment change request. AOC Enterprise checks passport status, authority scope, capability, and a required change-request-record evidence signal; a contract-sensitive or billing-sensitive impact escalates to contract or billing review ahead of the evidence gate, per the resolver\'s documented decision priority.',
  category: 'change_control',
  primaryAgentId: 'pmfreak.agent.change_control',
  primaryPassportId: 'aoc.passport.pmfreak.change_control.demo.v1',
  primaryActionId: CLASSIFY_ACTION_ID,
  projectContext: buildDemoPMFreakProjectContext({ phase: 'planning' }),
  requiredEvidenceIds: classifyAction.requiresEvidenceIds,
  requiredApprovalIds: classifyAction.requiresApprovalIds,
  expectedDecision: 'allow',
  context: {
    scheduleSensitive: true,
  },
  safeNarrative: 'The Change Control Agent can classify and route a change request, but cannot approve the change or alter contract/billing terms.',
};

/**
 * Change Control -- Approve Change Request.
 *
 * Every demo Change Control Agent passport explicitly restricts
 * `pmfreak.action.change_control.approve_request` (see
 * `CHANGE_CONTROL_RESTRICTED_ACTION_IDS` in `pmfreak-agent-passport-fixtures.ts`),
 * so `resolvePMFreakAgentPassportAction` always denies this attempt --
 * autonomous approval of a customer-impacting change request is never
 * granted by this demo passport, regardless of evidence or approvals.
 */
export const changeControlApproveChangeRequestScenario: PMFreakProjectGovernanceScenario = {
  scenarioId: PMFREAK_SCENARIO_CHANGE_CONTROL_APPROVE_CHANGE_REQUEST_ID,
  title: 'Change Control -- Approve Change Request',
  description:
    'The Change Control Agent attempts to approve a customer-impacting change request. The demo Change Control Agent passport explicitly restricts this action, so AOC Enterprise denies the attempt regardless of evidence or approvals.',
  category: 'change_control',
  primaryAgentId: 'pmfreak.agent.change_control',
  primaryPassportId: 'aoc.passport.pmfreak.change_control.demo.v1',
  primaryActionId: APPROVE_ACTION_ID,
  projectContext: buildDemoPMFreakProjectContext({ phase: 'planning' }),
  requiredEvidenceIds: approveAction.requiresEvidenceIds,
  requiredApprovalIds: approveAction.requiresApprovalIds,
  expectedDecision: 'deny',
  context: {
    scheduleSensitive: true,
    billingSensitive: true,
    contractSensitive: true,
    customerCommitment: true,
  },
  safeNarrative: 'The Change Control Agent can classify and recommend routing, but cannot approve customer-impacting change requests.',
};

export const changeControlScenarios: readonly PMFreakProjectGovernanceScenario[] = [changeControlClassifyChangeRequestScenario, changeControlApproveChangeRequestScenario];
