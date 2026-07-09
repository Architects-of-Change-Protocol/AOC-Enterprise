import type { PMFreakPassportActionDecision } from '@aoc-enterprise/pmfreak-agent-passport-foundation';
import type { PMFreakDemoControlPlaneViewModel } from '../pmfreak-demo-control-plane-view/index.js';
import { PMFREAK_DEMO_NARRATIVE_DISCLAIMERS, PMFREAK_DEMO_NARRATIVE_SECTION_IDS } from './pmfreak-demo-narrative-export-constants.js';
import { assertNoPMFreakDemoNarrativeOverclaim } from './pmfreak-demo-narrative-claim-safety.js';
import type { PMFreakDemoNarrativeSection } from './pmfreak-demo-narrative-export-types.js';

/**
 * Decision -> safe-interpretation mapping. Only relabels an
 * already-computed `PMFreakPassportActionDecision` for presentation; never
 * decides anything itself. Every entry states what the demo decision means
 * -- and, via the shared disclaimers appended below, what it does not mean.
 */
const SAFE_INTERPRETATION: Record<PMFreakPassportActionDecision, string> = {
  allow:
    'In this demo, `allow` means the configured AOC demo governance model allowed the governed demo action to proceed based on the available passport, evidence, approvals and scenario context.',
  hold: 'In this demo, `hold` means the configured AOC demo governance model held the demo action pending passport reinstatement.',
  deny: '`deny` means the configured demo governance model did not allow the attempted action under the presented passport/scenario context.',
  require_evidence: '`require_evidence` means required demo evidence was missing before governed execution could proceed.',
  require_pm_approval: '`require_pm_approval` means a required PM approval signal was missing before governed execution could proceed.',
  require_customer_validation: '`require_customer_validation` means a required customer validation signal was missing before governed execution could proceed.',
  require_contract_review: '`require_contract_review` means a required contract review signal was missing before governed execution could proceed.',
  require_billing_review: '`require_billing_review` means a billing review signal was required by the configured demo scenario before governed execution could proceed.',
  require_legal_review: '`require_legal_review` means a required legal review signal was missing before governed execution could proceed.',
  require_security_review: '`require_security_review` means a required security review signal was missing before governed execution could proceed.',
  require_executive_approval: '`require_executive_approval` means a required executive approval signal was missing before governed execution could proceed.',
};

/**
 * Builds the safe-interpretation narrative section from an existing Control
 * Plane view model. This section is the export's most important safety
 * guardrail: it always pairs a decision-aware "what this means" sentence
 * with the pack's fixed set of "what this does not mean" disclaimers.
 */
export function createPMFreakDemoSafeInterpretationSection(viewModel: PMFreakDemoControlPlaneViewModel): PMFreakDemoNarrativeSection {
  const interpretation = SAFE_INTERPRETATION[viewModel.decisionBadge.decision];

  const bullets = [interpretation, ...PMFREAK_DEMO_NARRATIVE_DISCLAIMERS];

  const section: PMFreakDemoNarrativeSection = {
    sectionId: PMFREAK_DEMO_NARRATIVE_SECTION_IDS.safeInterpretation,
    kind: 'safe_interpretation',
    title: 'Safe Interpretation',
    summary: interpretation,
    bullets,
    safeLabels: ['Not compliance certification', 'No invoice validity claimed', 'No customer acceptance certification'],
    warnings: [],
  };

  assertNoPMFreakDemoNarrativeOverclaim(section);
  return section;
}
