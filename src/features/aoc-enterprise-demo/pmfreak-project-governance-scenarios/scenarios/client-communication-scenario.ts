import { findPMFreakAction } from '../../pmfreak-agent-passport/index.js';
import { buildDemoPMFreakProjectContext } from '../pmfreak-demo-project-context.js';
import { PMFREAK_SCENARIO_CLIENT_COMMUNICATION_DRAFT_STATUS_UPDATE_ID, PMFREAK_SCENARIO_CLIENT_COMMUNICATION_SEND_STATUS_UPDATE_ID } from '../pmfreak-project-governance-scenario-constants.js';
import type { PMFreakProjectGovernanceScenario } from '../pmfreak-project-governance-scenario-types.js';

const DRAFT_ACTION_ID = 'pmfreak.action.communication.draft_client_update';
const draftAction = findPMFreakAction(DRAFT_ACTION_ID);
if (draftAction === undefined) throw new Error(`PMFreak Project Governance Scenario Pack: unknown action id "${DRAFT_ACTION_ID}".`);

const SEND_ACTION_ID = 'pmfreak.action.communication.send_client_update';
const sendAction = findPMFreakAction(SEND_ACTION_ID);
if (sendAction === undefined) throw new Error(`PMFreak Project Governance Scenario Pack: unknown action id "${SEND_ACTION_ID}".`);

/**
 * Client Communication -- Draft Status Update.
 *
 * `pmfreak.action.communication.draft_client_update` requires no evidence or
 * approval in the passport pack's action catalog. Because this draft is
 * customer-facing content, `resolvePMFreakAgentPassportAction`'s
 * customer-facing/external-communication context gate still requires PM
 * approval before the draft can be considered fully clear -- this is the
 * resolver's own context-sensitivity gate, not a re-implementation of it.
 */
export const clientCommunicationDraftStatusUpdateScenario: PMFreakProjectGovernanceScenario = {
  scenarioId: PMFREAK_SCENARIO_CLIENT_COMMUNICATION_DRAFT_STATUS_UPDATE_ID,
  title: 'Client Communication -- Draft Status Update',
  description:
    'The Client Communication Agent drafts a neutral, non-committal status update for the customer. AOC Enterprise checks passport status, authority scope, and capability, and -- because the draft is customer-facing content -- requires PM approval before treating the draft as fully cleared. The draft is never sent by this action.',
  category: 'client_communication',
  primaryAgentId: 'pmfreak.agent.client_communication',
  primaryPassportId: 'aoc.passport.pmfreak.client_communication.demo.v1',
  primaryActionId: DRAFT_ACTION_ID,
  projectContext: buildDemoPMFreakProjectContext({ phase: 'monitoring' }),
  requiredEvidenceIds: draftAction.requiresEvidenceIds,
  requiredApprovalIds: draftAction.requiresApprovalIds,
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
 * `pmfreak.action.communication.send_client_update` requires a drafted
 * communication and PM approval per the passport pack's action catalog. The
 * demo Client Communication Agent passport does not restrict this action
 * (only billing/schedule/change-control/risk-close actions are restricted
 * for this role), so the resolver evaluates it on evidence, approval, and
 * context sensitivity rather than denying it outright.
 */
export const clientCommunicationSendStatusUpdateScenario: PMFreakProjectGovernanceScenario = {
  scenarioId: PMFREAK_SCENARIO_CLIENT_COMMUNICATION_SEND_STATUS_UPDATE_ID,
  title: 'Client Communication -- Send Status Update',
  description:
    'The Client Communication Agent attempts to send a previously drafted status update externally to the customer. AOC Enterprise requires a client-communication-draft evidence record and PM approval before allowing the send; a customer-commitment, contract-sensitive send additionally requires contract review and customer validation.',
  category: 'client_communication',
  primaryAgentId: 'pmfreak.agent.client_communication',
  primaryPassportId: 'aoc.passport.pmfreak.client_communication.demo.v1',
  primaryActionId: SEND_ACTION_ID,
  projectContext: buildDemoPMFreakProjectContext({ phase: 'monitoring' }),
  requiredEvidenceIds: sendAction.requiresEvidenceIds,
  requiredApprovalIds: sendAction.requiresApprovalIds,
  expectedDecision: 'allow',
  context: {
    customerFacing: true,
    externalCommunication: true,
    customerCommitment: false,
    contractSensitive: false,
  },
  safeNarrative: 'AOC may allow drafting, but sending external client communication requires explicit authorization and approvals.',
};

export const clientCommunicationScenarios: readonly PMFreakProjectGovernanceScenario[] = [clientCommunicationDraftStatusUpdateScenario, clientCommunicationSendStatusUpdateScenario];
