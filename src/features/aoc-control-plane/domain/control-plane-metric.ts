import type { AocMetricTone } from './control-plane-status.js';

export interface AocMetric {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly tone: AocMetricTone;
  readonly description?: string;
}
