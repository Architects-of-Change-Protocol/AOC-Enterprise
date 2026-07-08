export type PilotSuccessMetricCategory =
  | 'risk_reduction'
  | 'auditability'
  | 'operator_visibility'
  | 'execution_safety'
  | 'policy_enforcement'
  | 'evidence_readiness'
  | 'buyer_confidence';

/**
 * A target-defined success metric. `targetValue` describes what "good"
 * looks like for the pilot -- it is never a measured customer KPI value
 * this feature invents on its own; see
 * `services/pilot-success-metrics-service.ts`.
 */
export interface PilotSuccessMetric {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly category: PilotSuccessMetricCategory;
  readonly targetValue: string;
  readonly measurementMethod: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
