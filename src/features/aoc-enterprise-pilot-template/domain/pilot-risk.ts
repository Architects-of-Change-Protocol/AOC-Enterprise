export type PilotRiskSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface PilotRisk {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly severity: PilotRiskSeverity;
  readonly mitigation: string;
  readonly ownerPersonaId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
