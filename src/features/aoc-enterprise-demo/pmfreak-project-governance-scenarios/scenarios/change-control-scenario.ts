import { buildDemoPMFreakProjectContext } from '../pmfreak-demo-project-context.js';
import { PMFREAK_SCENARIO_CHANGE_CONTROL_APPROVE_CHANGE_REQUEST_ID, PMFREAK_SCENARIO_CHANGE_CONTROL_REQUEST_EVIDENCE_ID } from '../pmfreak-project-governance-scenario-constants.js';
import type { PMFreakProjectGovernanceScenario } from '../pmfreak-project-governance-scenario-types.js';

const REQUEST_EVIDENCE_ACTION_ID = 'pmfreak.foundation.action.evidence.request';
const APPROVE_ACTION_ID = 'pmfreak.foundation.action.change_control.approve_request';

/**
 * Change Control -- Request Supporting Evidence.
 *
 * The Change Control Agent requests supporting evidence for the scope
 * adjustment change request ahead of classification. `change_control.classify_request`
 * (this scenario's earlier target) is flagged in the real Change Control
 * role profile's `humanApprovalRequiredFor`, so it can never reach a bare
 * `allow`; this scenario targets `evidence.request` instead so it can still
 * demonstrate the allow path. Classifying and routing the request remain
 * gated separately, unconditionally, by the real role profile.
 */
export const changeControlRequestEvidenceScenario: PMFreakProjectGovernanceScenario = {
  scenarioId: PMFREAK_SCENARIO_CHANGE_CONTROL_REQUEST_EVIDENCE_ID,
  title: 'Change Control -- Request Supporting Evidence',
  description:
    'The Change Control Agent requests supporting evidence for the scope-adjustment change request. AOC Enterprise checks passport status, the real runtime guard, authority scope, capability, and a required change-request-record evidence signal before allowing the request to proceed.',
  category: 'change_control',
  agentId: 'pmfreak.agent.change_control',
  primaryRole: 'change_control',
  action: {
    actionId: REQUEST_EVIDENCE_ACTION_ID,
    actionCategory: 'read_data',
    toolName: 'evidence_requester',
    dataCategories: ['project.change_requests'],
  },
  projectContext: buildDemoPMFreakProjectContext({ phase: 'planning' }),
  capabilityToken: {
    id: 'tok.pmfreak.scenario.change_control.request_evidence',
    capability: 'pmfreak.foundation.capability.evidence.request',
    resourceScopes: ['project.change_requests'],
    riskLevel: 'high',
  },
  evidenceRequirements: [
    { id: 'ev.pmfreak.scenario.change_control.change_request_record', type: 'change_request_record', description: 'The scope-adjustment change request record.' },
    { id: 'ev.pmfreak.scenario.change_control.scope_statement', type: 'scope_statement', description: 'The project scope statement affected by the change request.' },
  ],
  approvalRequirements: [],
  baselineEvidenceIds: ['ev.pmfreak.scenario.change_control.change_request_record', 'ev.pmfreak.scenario.change_control.scope_statement'],
  baselineApprovalIds: [],
  expectedDecision: 'allow',
  context: {
    scheduleSensitive: true,
  },
  safeNarrative: 'The Change Control Agent can request and route supporting evidence for a change request, but cannot classify, approve, or alter contract/billing terms.',
};

/**
 * Change Control -- Approve Change Request.
 *
 * The real Change Control role profile explicitly prohibits
 * `change_control.approve_request`, so the real runtime guard always denies
 * this attempt -- autonomous approval of a customer-impacting change
 * request is never granted by this role, regardless of evidence or
 * approvals.
 */
export const changeControlApproveChangeRequestScenario: PMFreakProjectGovernanceScenario = {
  scenarioId: PMFREAK_SCENARIO_CHANGE_CONTROL_APPROVE_CHANGE_REQUEST_ID,
  title: 'Change Control -- Approve Change Request',
  description:
    'The Change Control Agent attempts to approve a customer-impacting change request. The real Change Control role profile explicitly prohibits this action, so AOC Enterprise denies the attempt regardless of evidence or approvals.',
  category: 'change_control',
  agentId: 'pmfreak.agent.change_control',
  primaryRole: 'change_control',
  action: {
    actionId: APPROVE_ACTION_ID,
    actionCategory: 'update_record',
    dataCategories: ['project.change_requests'],
  },
  projectContext: buildDemoPMFreakProjectContext({ phase: 'planning' }),
  capabilityToken: {
    id: 'tok.pmfreak.scenario.change_control.approve',
    capability: 'pmfreak.foundation.capability.change_control.approve_request',
    resourceScopes: ['project.change_requests'],
    riskLevel: 'high',
  },
  evidenceRequirements: [{ id: 'ev.pmfreak.scenario.change_control.approve.change_request_record', type: 'change_request_record', description: 'The scope-adjustment change request record.' }],
  approvalRequirements: [{ id: 'appr.pmfreak.scenario.change_control.approve.pm_approval', type: 'pm_approval', riskLevel: 'high' }],
  baselineEvidenceIds: ['ev.pmfreak.scenario.change_control.approve.change_request_record'],
  baselineApprovalIds: ['appr.pmfreak.scenario.change_control.approve.pm_approval'],
  expectedDecision: 'deny',
  context: {
    scheduleSensitive: true,
    billingSensitive: true,
    contractSensitive: true,
    customerCommitment: true,
  },
  safeNarrative: 'The Change Control Agent can request evidence and recommend routing, but cannot approve customer-impacting change requests.',
};

export const changeControlScenarios: readonly PMFreakProjectGovernanceScenario[] = [changeControlRequestEvidenceScenario, changeControlApproveChangeRequestScenario];
