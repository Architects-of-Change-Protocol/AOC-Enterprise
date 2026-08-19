import type { DemoPolicyPackControlPlaneSnapshot, DemoPolicyPackNarrative, DemoPolicyPackNarrativeSection } from '../domain/demo-policy-pack.js';
import type { DemoScenarioOutcome } from '../domain/demo-outcome.js';
import type { DemoScenario } from '../domain/demo-scenario.js';

/**
 * The single, deterministic legal/compliance disclaimer every policy-pack
 * narrative carries. It never claims legal compliance, jurisdictional
 * completeness, or that Soberanía provides legal advice -- it states only what is
 * true: this is a demo-only enterprise policy model, and the Control Plane
 * shows enforcement trace and policy evidence, not a legal conclusion.
 */
const LEGAL_DISCLAIMER =
  'This demo pack models an enterprise policy requirement. A customer- or counsel-validated pack could encode real customer policy. The Control Plane shows policy evidence and enforcement trace, not legal advice or a certified compliance conclusion.';

function policyFactLine(outcome: DemoScenarioOutcome): string {
  const parts = [`status=${outcome.status}`, `reasonCode=${outcome.reasonCode}`];
  if (outcome.policyDecisionId !== undefined) parts.push(`policyDecisionId=${outcome.policyDecisionId}`);
  if (outcome.policyProofId !== undefined) parts.push(`policyProofId=${outcome.policyProofId}`);
  if (outcome.policyPackVersionIds !== undefined && outcome.policyPackVersionIds.length > 0) parts.push(`policyPackVersionIds=${outcome.policyPackVersionIds.join(',')}`);
  if (outcome.policyMatchedRuleIds !== undefined && outcome.policyMatchedRuleIds.length > 0) parts.push(`matchedRuleIds=${outcome.policyMatchedRuleIds.join(',')}`);
  return parts.join(', ');
}

function controlPlaneWalkthroughLine(snapshot?: DemoPolicyPackControlPlaneSnapshot): string {
  if (snapshot === undefined) {
    return 'Open the Control Plane\'s Policy Packs, Enforcement and Proofs / Audit panels to inspect this decision.';
  }
  const anchorPanels = [...new Set(snapshot.walkthroughAnchors.map((anchor) => anchor.panel))];
  return `In the Control Plane, walk the operator through: ${anchorPanels.join(' -> ')}. Proof chain complete: ${snapshot.policyProofChainComplete}.`;
}

function buildExecutiveSection(scenario: DemoScenario, outcome: DemoScenarioOutcome): DemoPolicyPackNarrativeSection {
  return {
    id: `narrative-${scenario.id}-executive`,
    audience: 'executive',
    title: 'Executive summary',
    body: `${scenario.buyerPain} ${scenario.aocValue} Result: ${outcome.status}.`,
  };
}

function buildTechnicalSection(scenario: DemoScenario, outcome: DemoScenarioOutcome): DemoPolicyPackNarrativeSection {
  return {
    id: `narrative-${scenario.id}-technical`,
    audience: 'technical',
    title: 'Technical trace',
    body: `${scenario.action} on ${scenario.resourceScope} for actor ${scenario.primaryActorId}. ${policyFactLine(outcome)}. executorRan=${outcome.executorRan}, sideEffectsExecuted=${outcome.sideEffectsExecuted}.`,
  };
}

function buildOperatorSection(scenario: DemoScenario, snapshot?: DemoPolicyPackControlPlaneSnapshot): DemoPolicyPackNarrativeSection {
  return {
    id: `narrative-${scenario.id}-operator`,
    audience: 'operator',
    title: 'Operator walkthrough',
    body: `${controlPlaneWalkthroughLine(snapshot)} What to show: ${scenario.enterpriseMessage}`,
  };
}

function buildInvestorSection(scenario: DemoScenario): DemoPolicyPackNarrativeSection {
  return {
    id: `narrative-${scenario.id}-investor`,
    audience: 'investor',
    title: 'Investor framing',
    body: `Buyer pain: ${scenario.buyerPain} Soberanía value: ${scenario.aocValue} This is a repeatable enterprise pattern -- the same policy-pack integration applies across payments, procurement, data boundaries and event settlement.`,
  };
}

/**
 * Generates deterministic, audience-segmented demo narration for a
 * policy-pack scenario run. Every claim is grounded in the scenario's own
 * declared narrative fields (`buyerPain`, `aocValue`, `enterpriseMessage`)
 * and the real `DemoScenarioOutcome`/`DemoPolicyPackControlPlaneSnapshot` a
 * run actually produced -- this service never uses an LLM, never makes a
 * network call, and never asserts legal compliance.
 */
export class DemoPolicyPackNarrativeService {
  buildNarrative(scenario: DemoScenario, outcome: DemoScenarioOutcome, controlPlaneSnapshot?: DemoPolicyPackControlPlaneSnapshot): DemoPolicyPackNarrative {
    const sections: DemoPolicyPackNarrativeSection[] = [
      buildExecutiveSection(scenario, outcome),
      buildTechnicalSection(scenario, outcome),
      buildOperatorSection(scenario, controlPlaneSnapshot),
      buildInvestorSection(scenario),
    ];

    return {
      scenarioId: scenario.id,
      buyerPain: scenario.buyerPain,
      aocValue: scenario.aocValue,
      controlPlaneWalkthrough: controlPlaneWalkthroughLine(controlPlaneSnapshot),
      legalDisclaimer: LEGAL_DISCLAIMER,
      sections,
    };
  }
}

export function createDemoPolicyPackNarrativeService(): DemoPolicyPackNarrativeService {
  return new DemoPolicyPackNarrativeService();
}
