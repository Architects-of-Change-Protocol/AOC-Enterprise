import type { DemoScenarioOutcome } from '../domain/demo-outcome.js';
import type { DemoNarrative, DemoNarrativeMessage } from '../domain/demo-message.js';
import type { DemoProofChain } from '../domain/demo-proof-chain.js';
import type { DemoScenario } from '../domain/demo-scenario.js';

/**
 * Turns a scenario definition and its real outcome/proof chain into
 * buyer-facing narrative messages. Every claim is grounded in fields the
 * runtime actually produced (outcome.status, outcome.reason, proof chain
 * completeness) -- this service never asserts an outcome the runtime did not
 * report.
 */
export class DemoNarrativeService {
  buildNarrative(scenario: DemoScenario, outcome: DemoScenarioOutcome, proofChain?: DemoProofChain): DemoNarrative {
    const messages: DemoNarrativeMessage[] = [
      {
        id: `narrative-${scenario.id}-buyer-pain`,
        kind: 'buyer_pain',
        title: 'Buyer pain',
        body: scenario.buyerPain,
      },
      {
        id: `narrative-${scenario.id}-aoc-value`,
        kind: 'aoc_value',
        title: 'Soberanía value',
        body: scenario.aocValue,
      },
      {
        id: `narrative-${scenario.id}-what-happened`,
        kind: 'what_happened',
        title: 'What happened',
        body: this.whatHappened(scenario, outcome),
      },
      {
        id: `narrative-${scenario.id}-why-it-matters`,
        kind: 'why_it_matters',
        title: 'Why it matters',
        body: scenario.enterpriseMessage,
      },
      {
        id: `narrative-${scenario.id}-proof-explanation`,
        kind: 'proof_explanation',
        title: 'Proof / audit explanation',
        body: this.proofExplanation(outcome, proofChain),
      },
      {
        id: `narrative-${scenario.id}-suggested-narration`,
        kind: 'suggested_narration',
        title: 'Suggested narration',
        body: `"${scenario.title}. ${scenario.summary}"`,
      },
    ];

    return { scenarioId: scenario.id, messages };
  }

  private whatHappened(scenario: DemoScenario, outcome: DemoScenarioOutcome): string {
    const executorClause = outcome.executorRan ? 'The real executor ran.' : 'The real executor did not run.';
    return `${scenario.primaryActorId} attempted "${scenario.action}" on ${scenario.resourceScope}. The outcome was "${outcome.status}" (${outcome.reasonCode}). ${executorClause}`;
  }

  private proofExplanation(outcome: DemoScenarioOutcome, proofChain?: DemoProofChain): string {
    if (proofChain === undefined) {
      return `Enforcement decision ${outcome.enforcementDecisionId ?? 'unknown'} was recorded, but no proof chain was extracted for this run.`;
    }
    const sourceList = proofChain.sources.length > 0 ? proofChain.sources.join(', ') : 'none';
    const completeness = proofChain.complete
      ? 'The proof chain is complete: every source this decision depended on was found.'
      : `The proof chain is incomplete: missing ${proofChain.missingSources.join(', ') || 'unknown source(s)'}.`;
    return `This decision is backed by proofs from: ${sourceList}. ${completeness}`;
  }
}

export function createDemoNarrativeService(): DemoNarrativeService {
  return new DemoNarrativeService();
}
