import { buildDemoPMFreakProjectContext } from '../pmfreak-demo-project-context.js';
import { PMFREAK_SCENARIO_CLIENT_COMMUNICATION_DRAFT_STATUS_UPDATE_ID, PMFREAK_SCENARIO_CLIENT_COMMUNICATION_SEND_STATUS_UPDATE_ID } from '../pmfreak-project-governance-scenario-constants.js';
import type { PMFreakProjectGovernanceScenario } from '../pmfreak-project-governance-scenario-types.js';

const DRAFT_ACTION_ID = 'pmfreak.foundation.action.communication.draft_client_update';
const SEND_ACTION_ID = 'pmfreak.foundation.action.communication.send_client_update';

/**
 * Client Communication -- Draft Status Update.
 *
 * `communication.draft_client_update` requires no evidence or approval of
 * its own. Because this draft is customer-facing content,
 * `resolvePMFreakAgentPassportAction`'s customer-facing/external-communication
 * context gate still requires PM approval before the draft can be
 * considered fully clear -- this is the resolver's own context-sensitivity
 * gate, not a re-implementation of it.
 */
export const clientCommunicationDraftStatusUpdateScenario: PMFreakProjectGovernanceScenario = {
  scenarioId: PMFREAK_SCENARIO_CLIENT_COMMUNICATION_DRAFT_STATUS_UPDATE_ID,
  title: 'Client Communication -- Draft Status Update',
  description:
    'The Client Communication Agent drafts a neutral, non-committal status update for the customer. AOC Enterprise checks passport status, the real runtime guard, authority scope, and capability, and -- because the draft is customer-facing content -- requires PM approval before treating the draft as fully cleared. The draft is never sent by this action.',
  category: 'client_communication',
  agentId: 'pmfreak.agent.client_communication',
  primaryRole: 'client_communication',
  action: {
    actionId: DRAFT_ACTION_ID,
    actionCategory: 'create_record',
    toolName: 'communication_drafter',
    dataCategories: ['project.communications'],
  },
  projectContext: buildDemoPMFreakProjectContext({ phase: 'monitoring' }),
  capabilityToken: {
    id: 'tok.pmfreak.scenario.client_communication.draft',
    capability: 'pmfreak.foundation.capability.communication.draft_client_update',
    resourceScopes: ['project.communications'],
    riskLevel: 'medium',
  },
  evidenceRequirements: [{ id: 'ev.pmfreak.scenario.client_communication.draft.meeting_minutes', type: 'meeting_minutes', description: 'Meeting minutes informing the status update draft.' }],
  approvalRequirements: [{ id: 'appr.pmfreak.scenario.client_communication.draft.pm_approval', type: 'pm_approval', riskLevel: 'high' }],
  baselineEvidenceIds: ['ev.pmfreak.scenario.client_communication.draft.meeting_minutes'],
  baselineApprovalIds: [],
  expectedDecision: 'require_pm_approval',
  context: {
    customerFacing: true,
    externalCommunication: false,
    customerCommitment: false,
  },
  safeNarrative: 'The Client Communication Agent may draft a neutral update, but cannot send it or make commitments without approval.',
};

/**
 * Client Communication -- Send Status Update.
 *
 * `communication.send_client_update` is flagged in the real Client
 * Communication role profile's `humanApprovalRequiredFor`, so the real
 * runtime guard always routes a send attempt to human approval --
 * unconditionally, by the role's own design ("Cannot send a client
 * communication without approval"). Even once this pack's own draft
 * evidence and PM approval are both satisfied, the decision is still
 * `require_pm_approval`: sending externally is never softened into a bare
 * `allow` by this role's real governance model.
 */
export const clientCommunicationSendStatusUpdateScenario: PMFreakProjectGovernanceScenario = {
  scenarioId: PMFREAK_SCENARIO_CLIENT_COMMUNICATION_SEND_STATUS_UPDATE_ID,
  title: 'Client Communication -- Send Status Update',
  description:
    'The Client Communication Agent attempts to send a previously drafted status update externally to the customer. Even with a client-communication-draft evidence record and PM approval already in hand, the real Client Communication role profile always routes an external send through human approval before it can proceed.',
  category: 'client_communication',
  agentId: 'pmfreak.agent.client_communication',
  primaryRole: 'client_communication',
  action: {
    actionId: SEND_ACTION_ID,
    actionCategory: 'send_message',
    toolName: 'communication_sender',
    dataCategories: ['project.communications'],
  },
  projectContext: buildDemoPMFreakProjectContext({ phase: 'monitoring' }),
  capabilityToken: {
    id: 'tok.pmfreak.scenario.client_communication.send',
    capability: 'pmfreak.foundation.capability.communication.send_client_update',
    resourceScopes: ['project.communications'],
    riskLevel: 'high',
  },
  evidenceRequirements: [{ id: 'ev.pmfreak.scenario.client_communication.send.client_communication_draft', type: 'client_communication_draft', description: 'The drafted status update.' }],
  approvalRequirements: [{ id: 'appr.pmfreak.scenario.client_communication.send.pm_approval', type: 'pm_approval', riskLevel: 'high' }],
  baselineEvidenceIds: ['ev.pmfreak.scenario.client_communication.send.client_communication_draft'],
  baselineApprovalIds: ['appr.pmfreak.scenario.client_communication.send.pm_approval'],
  expectedDecision: 'require_pm_approval',
  context: {
    customerFacing: true,
    externalCommunication: true,
    customerCommitment: false,
    contractSensitive: false,
  },
  safeNarrative: 'AOC may allow drafting, but sending external client communication always requires human sign-off under this role\'s real governance model.',
};

export const clientCommunicationScenarios: readonly PMFreakProjectGovernanceScenario[] = [clientCommunicationDraftStatusUpdateScenario, clientCommunicationSendStatusUpdateScenario];
