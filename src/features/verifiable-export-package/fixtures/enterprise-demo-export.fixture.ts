import { createEnterpriseDemoSuite, type EnterpriseDemoSuite } from '../../aoc-enterprise-demo/services/index.js';
import type { DemoPolicyPackScenarioRun } from '../../aoc-enterprise-demo/domain/demo-policy-pack.js';
import { buildEnterpriseDemoWorld } from '../../aoc-enterprise-demo/fixtures/enterprise-demo-world.fixture.js';
import { SCENARIO_EXECUTORS, createTickingClock } from '../../aoc-enterprise-demo/scenarios/index.js';
import { createExportRuntimeContext, type ExportRuntimeContext } from '../domain/export-runtime-context.js';
import { ExportPackageRuntime, createExportPackageRuntime } from '../services/export-package-runtime.js';
import { buildSummaryTextItem } from '../services/export-package-section-builder.js';
import { mapDemoScenarioToItem, mapDemoScenarioRunToItem, mapDemoExportArtifactToItem } from '../integrations/enterprise-demo-export-adapter.js';
import { mapDemoControlPlaneSnapshotToItem } from '../integrations/control-plane-export-adapter.js';
import { mapPolicyDecisionToItem, mapPolicyProofToItem } from '../integrations/policy-pack-export-adapter.js';
import { mapEnforcementDecisionToItem } from '../integrations/action-enforcement-export-adapter.js';

export const NOW = '2026-01-09T00:00:00.000Z';
export const SCENARIO_ID = 'policy-pack-payment-approval-required';
const REPLAY_CLOCK_START = '2026-01-01T00:00:00.000Z';

export interface EnterpriseDemoExportFixture {
  readonly suite: EnterpriseDemoSuite;
  readonly run: DemoPolicyPackScenarioRun;
  readonly ctx: ExportRuntimeContext;
  readonly runtime: ExportPackageRuntime;
  readonly packageId: string;
}

/**
 * Runs a real Enterprise Demo policy-pack scenario end to end (through the
 * same DemoPolicyPackScenarioService the Control Plane and sales demo use),
 * then packages its scenario definition, run, Control Plane snapshot, and
 * the underlying policy/enforcement decision and proof into one enterprise
 * demo packet. Never fabricates a scenario outcome -- every included fact
 * is exactly what the real scenario run produced.
 *
 * To obtain the real PolicyPackDecision/PolicyPackProof/EnforcementDecision
 * objects (the official run only returns their ids), this fixture replays
 * the scenario's own executor once more against a fresh, deterministic
 * world -- the same technique DemoPolicyPackScenarioService itself uses to
 * build its Control Plane snapshot. Because both runs use a fresh world, a
 * fixed clock, and sequential ids, they produce byte-identical decision and
 * proof ids; this replay never re-evaluates policy or re-runs execution
 * against the *official* run's own state, it only re-derives the same
 * deterministic facts a second time so they can be included by reference.
 */
export async function buildEnterpriseDemoExportFixture(): Promise<EnterpriseDemoExportFixture> {
  const suite = createEnterpriseDemoSuite();
  const run = await suite.policyPackScenarioService.runScenario(SCENARIO_ID);

  if (run.outcome === undefined || run.controlPlaneSnapshot === undefined) {
    throw new Error(`Expected scenario "${SCENARIO_ID}" to produce an outcome and a Control Plane snapshot.`);
  }
  const policyDecisionId = run.outcome.policyDecisionId;
  const policyProofId = run.outcome.policyProofId;
  if (policyDecisionId === undefined || policyProofId === undefined) {
    throw new Error(`Expected scenario "${SCENARIO_ID}" to produce a policy decision and proof.`);
  }

  const replayWorld = buildEnterpriseDemoWorld();
  const replayClock = createTickingClock(REPLAY_CLOCK_START);
  const replay = await SCENARIO_EXECUTORS[SCENARIO_ID](replayWorld, { now: replayClock });
  const policyDecision = replayWorld.fixture.policyPackRuntime.getPolicyPackDecision(policyDecisionId);
  const policyProof = replayWorld.fixture.policyPackRuntime.getPolicyPackProof(policyProofId);
  const enforcementOutcome = replay.enforcementOutcomes[replay.enforcementOutcomes.length - 1];
  if (enforcementOutcome === undefined) {
    throw new Error(`Expected scenario "${SCENARIO_ID}" replay to produce at least one enforcement outcome.`);
  }

  const ctx = createExportRuntimeContext(NOW);
  const runtime = createExportPackageRuntime(ctx);

  const { pkg } = runtime.createEnterpriseDemoPacket({
    title: `Enterprise demo packet: ${run.scenario.title}`,
    description: run.scenario.summary,
    trustDomainId: run.scenario.trustDomainId,
    targetType: 'demo_scenario',
    targetId: run.scenarioId,
    sections: [
      { type: 'summary', required: true, items: [buildSummaryTextItem(ctx, `Enterprise demo scenario "${run.scenario.title}" ran with status "${run.status}".`)] },
      {
        type: 'enterprise_demo',
        required: true,
        items: [mapDemoScenarioToItem(ctx, run.scenario), mapDemoScenarioRunToItem(ctx, run), ...run.exportArtifacts.map((artifact) => mapDemoExportArtifactToItem(ctx, artifact))],
      },
      { type: 'policy', required: true, items: [mapPolicyDecisionToItem(ctx, policyDecision), mapPolicyProofToItem(ctx, policyProof)] },
      { type: 'enforcement', required: true, items: [mapEnforcementDecisionToItem(ctx, enforcementOutcome.decision)] },
      { type: 'control_plane', required: true, items: [mapDemoControlPlaneSnapshotToItem(ctx, run.controlPlaneSnapshot)] },
    ],
  });

  runtime.sealPackage(pkg.id);
  runtime.verifyPackage(pkg.id);

  return { suite, run, ctx, runtime, packageId: pkg.id };
}
