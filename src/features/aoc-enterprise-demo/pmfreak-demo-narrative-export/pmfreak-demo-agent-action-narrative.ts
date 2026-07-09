import type { PMFreakDemoControlPlaneViewModel } from '../pmfreak-demo-control-plane-view/index.js';
import { PMFREAK_DEMO_NARRATIVE_SECTION_IDS } from './pmfreak-demo-narrative-export-constants.js';
import { assertNoPMFreakDemoNarrativeOverclaim } from './pmfreak-demo-narrative-claim-safety.js';
import type { PMFreakDemoNarrativeSection } from './pmfreak-demo-narrative-export-types.js';

const SAFE_SUMMARY =
  'The agent attempted an action in a deterministic PMFreak demo scenario. The passport status and action authorization were presented from the existing scenario result.';

/**
 * Builds the agent/action narrative section from an existing Control Plane
 * view model. Only relabels `agentPassportCard` and `attemptedActionCard`,
 * already computed by the Control Plane View -- never re-derives passport,
 * capability, or authority-scope status.
 */
export function createPMFreakDemoAgentActionSection(viewModel: PMFreakDemoControlPlaneViewModel): PMFreakDemoNarrativeSection {
  const { agentPassportCard, attemptedActionCard } = viewModel;

  const bullets = [
    `Agent ID: ${agentPassportCard.agentId}`,
    `Passport ID: ${agentPassportCard.passportId}`,
    `Passport status: ${agentPassportCard.statusLabel}`,
    `Attempted action: ${attemptedActionCard.actionLabel} (${attemptedActionCard.actionId})`,
    `Workspace ID: ${attemptedActionCard.workspaceId}`,
    `Project ID: ${attemptedActionCard.projectId}`,
    ...(attemptedActionCard.customerId !== undefined ? [`Customer ID: ${attemptedActionCard.customerId}`] : []),
    `Scenario category: ${attemptedActionCard.scenarioCategory}`,
    `Context flags: ${attemptedActionCard.contextFlags.length > 0 ? attemptedActionCard.contextFlags.join(', ') : 'none'}`,
  ];

  const section: PMFreakDemoNarrativeSection = {
    sectionId: PMFREAK_DEMO_NARRATIVE_SECTION_IDS.agentAction,
    kind: 'agent_action',
    title: 'Agent / Action',
    summary: SAFE_SUMMARY,
    bullets,
    safeLabels: ['AOC-governed agent'],
    warnings: [],
  };

  assertNoPMFreakDemoNarrativeOverclaim(section);
  return section;
}
