import type { DemoScenario } from '../../aoc-enterprise-demo/domain/demo-scenario.js';
import type { DemoScenarioRun } from '../../aoc-enterprise-demo/domain/demo-step.js';
import type { DemoExportArtifact } from '../../aoc-enterprise-demo/domain/demo-export.js';
import { createDigest } from '../domain/export-package.js';
import type { ExportRuntimeContext } from '../domain/export-runtime-context.js';
import type { ExportPackageItem } from '../domain/export-package-item.js';

function buildItem(ctx: ExportRuntimeContext, type: ExportPackageItem['type'], sourceId: string, title: string, summary: string, payload: Record<string, unknown>): ExportPackageItem {
  return {
    id: ctx.ids.nextId('export-item'),
    type,
    sourceModule: 'aoc_enterprise_demo',
    sourceId,
    title,
    summary,
    payload,
    payloadHash: createDigest(payload),
    references: [],
    createdAt: ctx.clock.now(),
  };
}

/** Maps a real DemoScenario definition into an ExportPackageItem. */
export function mapDemoScenarioToItem(ctx: ExportRuntimeContext, scenario: DemoScenario): ExportPackageItem {
  const payload = { ...scenario } as unknown as Record<string, unknown>;
  return buildItem(ctx, 'demo_scenario', scenario.id, scenario.title, scenario.summary, payload);
}

/**
 * Maps a real DemoScenarioRun into an ExportPackageItem. The run's own
 * outcome/assertions/proofChain are copied verbatim -- this adapter never
 * fabricates a scenario outcome and never re-runs the scenario.
 */
export function mapDemoScenarioRunToItem(ctx: ExportRuntimeContext, run: DemoScenarioRun): ExportPackageItem {
  const payload = { ...run } as unknown as Record<string, unknown>;
  return buildItem(ctx, 'demo_run', run.id, `Demo run ${run.id}`, `Scenario ${run.scenarioId}: ${run.status}.`, payload);
}

/** Maps a real DemoExportArtifact into an ExportPackageItem. */
export function mapDemoExportArtifactToItem(ctx: ExportRuntimeContext, artifact: DemoExportArtifact): ExportPackageItem {
  const payload = { ...artifact } as unknown as Record<string, unknown>;
  return buildItem(ctx, 'demo_export_artifact', artifact.id, artifact.title, `${artifact.type} artifact for scenario ${artifact.scenarioId}.`, payload);
}
