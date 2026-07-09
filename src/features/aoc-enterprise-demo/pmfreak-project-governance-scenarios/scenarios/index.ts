import { billingReadinessCheckReadinessScenario, billingReadinessScenarios } from './billing-readiness-scenario.js';
import { milestoneAcceptanceScenarios, milestoneAcceptanceValidateAcceptanceScenario } from './milestone-acceptance-scenario.js';
import { scheduleChangeApplyReplanScenario, scheduleChangeDetectVarianceScenario, scheduleChangeScenarios } from './schedule-change-scenario.js';
import { riskEscalationPrepareEscalationScenario, riskEscalationScenarios } from './risk-escalation-scenario.js';
import { clientCommunicationDraftStatusUpdateScenario, clientCommunicationScenarios, clientCommunicationSendStatusUpdateScenario } from './client-communication-scenario.js';
import { changeControlApproveChangeRequestScenario, changeControlRequestEvidenceScenario, changeControlScenarios } from './change-control-scenario.js';
import type { PMFreakProjectGovernanceScenario } from '../pmfreak-project-governance-scenario-types.js';

export {
  billingReadinessCheckReadinessScenario,
  milestoneAcceptanceValidateAcceptanceScenario,
  scheduleChangeDetectVarianceScenario,
  scheduleChangeApplyReplanScenario,
  riskEscalationPrepareEscalationScenario,
  clientCommunicationDraftStatusUpdateScenario,
  clientCommunicationSendStatusUpdateScenario,
  changeControlRequestEvidenceScenario,
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
