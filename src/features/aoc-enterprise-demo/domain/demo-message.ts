import type { DemoScenarioId } from './demo-scenario.js';

export type DemoNarrativeMessageKind =
  | 'buyer_pain'
  | 'aoc_value'
  | 'what_happened'
  | 'why_it_matters'
  | 'proof_explanation'
  | 'suggested_narration';

export interface DemoNarrativeMessage {
  readonly id: string;
  readonly kind: DemoNarrativeMessageKind;
  readonly title: string;
  readonly body: string;
}

export interface DemoNarrative {
  readonly scenarioId: DemoScenarioId;
  readonly messages: readonly DemoNarrativeMessage[];
}
