import type { DemoScenarioId } from '../domain/demo-scenario.js';
import type { DemoScenarioRun, DemoScenarioRunStatus } from '../domain/demo-step.js';

export interface DemoScenarioReportEntry {
  readonly scenarioId: DemoScenarioId;
  readonly runId: string;
  readonly status: DemoScenarioRunStatus;
  readonly outcomeStatus: string;
  readonly executorRan: boolean;
  readonly proofChainComplete: boolean;
  readonly warnings: readonly string[];
}

export interface DemoReport {
  readonly generatedAt: string;
  readonly totalScenarios: number;
  readonly passedCount: number;
  readonly failedCount: number;
  readonly demoReady: boolean;
  readonly entries: readonly DemoScenarioReportEntry[];
  readonly warnings: readonly string[];
}

function warningsForRun(run: DemoScenarioRun): readonly string[] {
  const warnings: string[] = [];
  if (run.outcome === undefined) {
    warnings.push(`Scenario "${run.scenarioId}" produced no outcome.`);
  }
  if (run.proofChain === undefined) {
    warnings.push(`Scenario "${run.scenarioId}" produced no proof chain.`);
  } else if (!run.proofChain.complete && run.proofChain.missingSources.length > 0) {
    warnings.push(`Scenario "${run.scenarioId}" has an incomplete proof chain (missing: ${run.proofChain.missingSources.join(', ')}).`);
  }
  const failedAssertions = run.assertions.filter((assertion) => !assertion.passed);
  for (const assertion of failedAssertions) {
    warnings.push(`Scenario "${run.scenarioId}" failed assertion "${assertion.assertionId}": ${assertion.reason}`);
  }
  if (run.exportArtifacts.length === 0) {
    warnings.push(`Scenario "${run.scenarioId}" produced no export artifacts.`);
  }
  return warnings;
}

/**
 * Aggregates DemoScenarioRun results across every scenario into a single
 * demo-readiness report. "demoReady" is only true when every run passed --
 * this service surfaces warnings rather than hiding them, so a sales or
 * investor demo is never staged on top of a runtime that actually blocked
 * something unexpectedly.
 */
export class DemoReportService {
  buildReport(runs: readonly DemoScenarioRun[], now: () => string): DemoReport {
    const entries: DemoScenarioReportEntry[] = runs.map((run) => {
      const warnings = warningsForRun(run);
      return {
        scenarioId: run.scenarioId,
        runId: run.id,
        status: run.status,
        outcomeStatus: run.outcome?.status ?? 'unknown',
        executorRan: run.outcome?.executorRan ?? false,
        proofChainComplete: run.proofChain?.complete ?? false,
        warnings,
      };
    });

    const passedCount = entries.filter((entry) => entry.status === 'passed').length;
    const failedCount = entries.filter((entry) => entry.status !== 'passed').length;
    const warnings = entries.flatMap((entry) => entry.warnings);

    return {
      generatedAt: now(),
      totalScenarios: runs.length,
      passedCount,
      failedCount,
      demoReady: runs.length > 0 && failedCount === 0,
      entries,
      warnings,
    };
  }
}

export function createDemoReportService(): DemoReportService {
  return new DemoReportService();
}
