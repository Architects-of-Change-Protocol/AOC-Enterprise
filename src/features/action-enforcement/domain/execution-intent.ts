import type { SideEffectType } from './side-effect.js';

export type ExecutionRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface ExecutionIntent {
  readonly id: string;
  readonly action: string;
  readonly capability?: string;
  readonly resourceScope: string;
  readonly riskLevel: ExecutionRiskLevel;
  readonly sideEffectType: SideEffectType;
  readonly description?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
