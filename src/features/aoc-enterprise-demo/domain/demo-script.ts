import type { DemoScenarioId } from './demo-scenario.js';

export type DemoScriptAudience = 'executive' | 'technical' | 'operator' | 'investor';

export interface DemoScriptSegment {
  readonly id: string;
  readonly stepId?: string;
  readonly title: string;
  readonly narration: string;
  readonly showInControlPlane?: string;
  readonly expectedBuyerReaction?: string;
}

export interface DemoScript {
  readonly id: string;
  readonly scenarioId: DemoScenarioId;
  readonly title: string;
  readonly audience: DemoScriptAudience;
  readonly durationMinutes: number;
  readonly opening: string;
  readonly talkTrack: readonly DemoScriptSegment[];
  readonly closing: string;
}
