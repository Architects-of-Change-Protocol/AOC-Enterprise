import type { PMFreakPassportActionDecision } from '@aoc-enterprise/pmfreak-agent-passport-foundation';
import type { PMFreakDemoControlPlaneViewModel } from '../pmfreak-demo-control-plane-view/index.js';
import { PMFREAK_DEMO_NARRATIVE_SECTION_IDS } from './pmfreak-demo-narrative-export-constants.js';
import { assertNoPMFreakDemoNarrativeOverclaim } from './pmfreak-demo-narrative-claim-safety.js';
import type { PMFreakDemoNarrativeSection } from './pmfreak-demo-narrative-export-types.js';

/**
 * Decision -> next-steps mapping. Every entry is a demo-only recommendation
 * for updating and re-running the scenario -- never an instruction implying
 * real production mutation, real billing execution, or real communication
 * sending.
 */
const NEXT_STEPS: Record<PMFreakPassportActionDecision, readonly string[]> = {
  allow: ['Use the export as a demo explanation of why the governed action was allowed.', 'Do not treat this export as production execution evidence.'],
  hold: ['Review passport status before retrying the demo action.', 'Run the scenario again once the passport is reinstated.'],
  deny: ['Review passport scope, restricted actions and capability tokens.', 'Do not proceed with the attempted action under the current demo context.'],
  require_evidence: ['Provide or link the missing demo evidence signals.', 'Run the scenario again with updated evidence inputs.', 'Review the updated Control Plane decision.'],
  require_pm_approval: ['Provide the missing PM approval signal.', 'Run the scenario again with updated approval inputs.'],
  require_billing_review: ['Provide the missing billing review approval signal.', 'Run the scenario again with updated approval inputs.', 'Review the updated Control Plane decision.'],
  require_customer_validation: ['Provide the missing customer validation signal.', 'Run the scenario again with updated approval inputs.'],
  require_contract_review: ['Provide the missing contract review signal.', 'Run the scenario again with updated approval inputs.'],
  require_legal_review: ['Provide the missing legal review signal.', 'Run the scenario again with updated approval inputs.'],
  require_security_review: ['Provide the missing security review signal.', 'Run the scenario again with updated approval inputs.'],
  require_executive_approval: ['Provide the missing executive approval signal.', 'Run the scenario again with updated approval inputs.'],
};

/**
 * Builds the next-steps narrative section from an existing Control Plane
 * view model. Only selects a fixed, decision-aware recommendation list
 * keyed on the already-computed decision -- never re-derives the decision
 * or implies a real production mutation.
 */
export function createPMFreakDemoNextStepsSection(viewModel: PMFreakDemoControlPlaneViewModel): PMFreakDemoNarrativeSection {
  const bullets = [...NEXT_STEPS[viewModel.decisionBadge.decision]];

  const section: PMFreakDemoNarrativeSection = {
    sectionId: PMFREAK_DEMO_NARRATIVE_SECTION_IDS.nextSteps,
    kind: 'next_steps',
    title: 'Next Steps',
    summary: 'These next steps are demo-only recommendations for updating and re-running the scenario. They are not production instructions.',
    bullets,
    safeLabels: [],
    warnings: [],
  };

  assertNoPMFreakDemoNarrativeOverclaim(section);
  return section;
}
