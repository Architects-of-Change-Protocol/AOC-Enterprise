export type AocControlPlaneHealthStatus = 'healthy' | 'attention_required' | 'degraded' | 'critical';

export interface AocControlPlaneHealth {
  readonly status: AocControlPlaneHealthStatus;
  readonly reasonCode: string;
  readonly reason: string;
}

export type AocDecisionStatus =
  | 'allowed'
  | 'blocked'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'revoked'
  | 'requires_attention';

export type AocMetricTone = 'neutral' | 'success' | 'warning' | 'danger';

export type AocTimelineStatus = 'info' | 'success' | 'warning' | 'danger';
