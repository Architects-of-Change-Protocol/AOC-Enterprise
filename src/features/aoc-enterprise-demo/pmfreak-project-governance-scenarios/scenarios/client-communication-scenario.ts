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
    'The Client Communication Agent drafts a neutral, non-committal status update for the customer. Soberanía Enterprise checks passport status, the real runtime guard, authority scope, and capability, and -- because the draft is customer-facing content -- requires PM approval before treating the draft as fully cleared. The draft is never sent by this action.',
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
 * `communication.send_client_update` requires a drafted communication and
 * PM approval per this pack's own declared requirements. Once both are
 * satisfied, the real runtime guard allows the send: the real Client
 * Communication role profile's `allowedActions`/`humanApprovalRequiredFor`
 * (action-id lists on `PMFreakAgentRoleProfile`) are not currently threaded
 * through `buildPMFreakAgentEnrollmentInput`/`createAgentPolicyManifest`
 * into the real `AgentPolicyManifest` -- that manifest's own
 * `humanApprovalRequiredFor` is derived from tool names, not action ids
 * (see `packages/agent-governance/src/policy-manifest/policy-manifest.ts`),
 * so it can never match an action id like this one. Verified directly
 * against the real resolver; this is a known gap in the foundation
 * package's enrollment wiring, out of scope for this pack to fix -- see
 * this pack's README for the reference.
 */
export const clientCommunicationSendStatusUpdateScenario: PMFreakProjectGovernanceScenario = {
  scenarioId: PMFREAK_SCENARIO_CLIENT_COMMUNICATION_SEND_STATUS_UPDATE_ID,
  title: 'Client Communication -- Send Status Update',
  description:
    'The Client Communication Agent attempts to send a previously drafted status update externally to the customer. Soberanía Enterprise requires a client-communication-draft evidence record and PM approval before allowing the send.',
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
  expectedDecision: 'allow',
  context: {
    customerFacing: true,
    externalCommunication: true,
    customerCommitment: false,
    contractSensitive: false,
  },
  safeNarrative: 'Soberanía allows the Client Communication Agent to send this update only once a drafted communication and PM approval are both present. This does not certify legal approval or contractual authorization.',
};

export const clientCommunicationScenarios: readonly PMFreakProjectGovernanceScenario[] = [clientCommunicationDraftStatusUpdateScenario, clientCommunicationSendStatusUpdateScenario];
