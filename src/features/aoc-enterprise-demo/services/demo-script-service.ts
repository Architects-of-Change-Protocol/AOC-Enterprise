import type { DemoScript, DemoScriptAudience, DemoScriptSegment } from '../domain/demo-script.js';
import type { DemoScenario } from '../domain/demo-scenario.js';
import type { DemoScenarioOutcome } from '../domain/demo-outcome.js';
import { DEMO_SCRIPT_AUDIENCE_PROFILES } from '../fixtures/enterprise-demo-scripts.fixture.js';

/**
 * Generates a deterministic per-audience talk track from a scenario
 * definition and its real outcome. Every segment either quotes the
 * scenario's own narrative fields or the outcome's own status/reason -- it
 * never states an outcome the scenario did not actually produce.
 */
export class DemoScriptService {
  buildScript(scenario: DemoScenario, outcome: DemoScenarioOutcome, audience: DemoScriptAudience): DemoScript {
    const profile = DEMO_SCRIPT_AUDIENCE_PROFILES.find((candidate) => candidate.audience === audience);
    if (profile === undefined) {
      throw new Error(`Unknown demo script audience: "${audience}".`);
    }

    const talkTrack: DemoScriptSegment[] = scenario.steps.map((step, index) => ({
      id: `script-segment-${scenario.id}-${audience}-${step.id}`,
      stepId: step.id,
      title: step.title,
      narration: step.operatorNarration,
      showInControlPlane: step.kind === 'control_plane' || step.kind === 'proof' ? step.description : `Step ${index + 1}: ${step.description}`,
      ...(index === scenario.steps.length - 1 ? { expectedBuyerReaction: scenario.enterpriseMessage } : {}),
    }));

    return {
      id: `script-${scenario.id}-${audience}`,
      scenarioId: scenario.id,
      title: scenario.title,
      audience,
      durationMinutes: profile.durationMinutes,
      opening: `${profile.openingPrefix}${scenario.summary}`,
      talkTrack,
      closing: `Outcome: ${outcome.status} (${outcome.reasonCode}). ${profile.closingSuffix}`,
    };
  }

  buildAllAudienceScripts(scenario: DemoScenario, outcome: DemoScenarioOutcome): readonly DemoScript[] {
    return DEMO_SCRIPT_AUDIENCE_PROFILES.map((profile) => this.buildScript(scenario, outcome, profile.audience));
  }
}

export function createDemoScriptService(): DemoScriptService {
  return new DemoScriptService();
}
