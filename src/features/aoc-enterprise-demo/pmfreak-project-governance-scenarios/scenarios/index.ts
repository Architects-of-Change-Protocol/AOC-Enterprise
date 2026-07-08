import { billingReadinessMarkMilestoneReadyScenario, billingReadinessScenarios } from './billing-readiness-scenario.js';
import { milestoneAcceptanceScenarios, milestoneAcceptanceValidateAcceptanceScenario } from './milestone-acceptance-scenario.js';
import { scheduleChangeApplyReplanScenario, scheduleChangeProposeReplanScenario, scheduleChangeScenarios } from './schedule-change-scenario.js';
import { riskEscalationPrepareEscalationScenario, riskEscalationScenarios } from './risk-escalation-scenario.js';
import { clientCommunicationDraftStatusUpdateScenario, clientCommunicationScenarios, clientCommunicationSendStatusUpdateScenario } from './client-communication-scenario.js';
import { changeControlApproveChangeRequestScenario, changeControlClassifyChangeRequestScenario, changeControlScenarios } from './change-control-scenario.js';
import type { PMFreakProjectGovernanceScenario } from '../pmfreak-project-governance-scenario-types.js';

export {
  billingReadinessMarkMilestoneReadyScenario,
  milestoneAcceptanceValidateAcceptanceScenario,
  scheduleChangeProposeReplanScenario,
  scheduleChangeApplyReplanScenario,
  riskEscalationPrepareEscalationScenario,
  clientCommunicationDraftStatusUpdateScenario,
  clientCommunicationSendStatusUpdateScenario,
  changeControlClassifyChangeRequestScenario,
  changeControlApproveChangeRequestScenario,
};

/**
 * Every demo scenario, in deterministic, documented order: billing
 * readiness, milestone acceptance, schedule change, risk escalation, client
 * communication, change control -- matching this pack's README.
 */
export const demoPMFreakProjectGovernanceScenarios: readonly PMFreakProjectGovernanceScenario[] = [
  ...billingReadinessScenarios,
  ...milestoneAcceptanceScenarios,
  ...scheduleChangeScenarios,
  ...riskEscalationScenarios,
  ...clientCommunicationScenarios,
  ...changeControlScenarios,
];
