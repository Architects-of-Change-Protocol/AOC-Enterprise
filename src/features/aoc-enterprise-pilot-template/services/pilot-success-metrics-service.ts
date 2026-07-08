import type { PilotSuccessMetric } from '../domain/pilot-success-metric.js';
import type { PilotReadinessReport } from '../domain/pilot-kit.js';
import type { PilotScenarioBindingResult } from './pilot-scenario-binding-service.js';
import type { PilotExportPackageBindingResult } from './pilot-export-package-binding-service.js';

export interface PilotSuccessMetricEvaluation {
  readonly metricId: string;
  readonly targetValue: string;
  readonly currentSignal: string;
}

export interface PilotSuccessMetricsReport {
  readonly metrics: readonly PilotSuccessMetric[];
  readonly evaluations: readonly PilotSuccessMetricEvaluation[];
}

/**
 * Computes a factual `currentSignal` string for each pilot success metric
 * from real scenario/export-package binding counts and readiness status.
 * `targetValue` is always passed through unchanged -- this service never
 * invents a measured customer KPI value.
 */
export class PilotSuccessMetricsService {
  compute(
    metrics: readonly PilotSuccessMetric[],
    scenarioBindings: readonly PilotScenarioBindingResult[],
    exportPackageBindings: readonly PilotExportPackageBindingResult[],
    readiness?: PilotReadinessReport,
  ): PilotSuccessMetricsReport {
    const boundScenarios = scenarioBindings.filter((binding) => binding.bound).length;
    const totalScenarios = scenarioBindings.length;
    const boundExports = exportPackageBindings.filter((binding) => binding.bound).length;
    const totalExports = exportPackageBindings.length;

    const evaluations = metrics.map((metric) => ({
      metricId: metric.id,
      targetValue: metric.targetValue,
      currentSignal: this.signalFor(metric, boundScenarios, totalScenarios, boundExports, totalExports, readiness),
    }));

    return { metrics, evaluations };
  }

  private signalFor(
    metric: PilotSuccessMetric,
    boundScenarios: number,
    totalScenarios: number,
    boundExports: number,
    totalExports: number,
    readiness: PilotReadinessReport | undefined,
  ): string {
    switch (metric.category) {
      case 'auditability':
      case 'evidence_readiness':
        return `${boundExports}/${totalExports} pilot export packages are currently bound and verified.`;
      case 'operator_visibility':
        return readiness !== undefined ? `Control Plane / readiness status: ${readiness.status}.` : 'Pilot readiness has not yet been checked.';
      case 'execution_safety':
      case 'policy_enforcement':
      case 'risk_reduction':
        return `${boundScenarios}/${totalScenarios} pilot scenarios currently match their expected runtime outcome.`;
      case 'buyer_confidence':
      default:
        return `${boundScenarios}/${totalScenarios} scenarios bound, ${boundExports}/${totalExports} export packages verified.`;
    }
  }
}

export function createPilotSuccessMetricsService(): PilotSuccessMetricsService {
  return new PilotSuccessMetricsService();
}
