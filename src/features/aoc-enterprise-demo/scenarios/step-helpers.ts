import type { DemoScenarioId } from '../domain/demo-scenario.js';
import type { DemoStepDefinition, DemoStepRun, DemoStepRunStatus } from '../domain/demo-step.js';

export function completeStep(
  scenarioId: DemoScenarioId,
  step: DemoStepDefinition,
  status: DemoStepRunStatus,
  startedAt: string,
  completedAt: string,
  summary: string,
  relatedEntityIds: readonly string[] = [],
  relatedProofIds: readonly string[] = [],
): DemoStepRun {
  return {
    id: `step-run-${scenarioId}-${step.id}`,
    scenarioId,
    stepId: step.id,
    kind: step.kind,
    status,
    title: step.title,
    startedAt,
    completedAt,
    summary,
    relatedEntityIds,
    relatedProofIds,
  };
}

export function skipStep(scenarioId: DemoScenarioId, step: DemoStepDefinition, at: string, summary: string): DemoStepRun {
  return {
    id: `step-run-${scenarioId}-${step.id}`,
    scenarioId,
    stepId: step.id,
    kind: step.kind,
    status: 'skipped',
    title: step.title,
    startedAt: at,
    completedAt: at,
    summary,
    relatedEntityIds: [],
    relatedProofIds: [],
  };
}
