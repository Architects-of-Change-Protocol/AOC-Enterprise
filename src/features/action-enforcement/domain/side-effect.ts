export type SideEffectType =
  | 'none'
  | 'read'
  | 'write'
  | 'send_message'
  | 'external_api_call'
  | 'financial'
  | 'legal'
  | 'data_export'
  | 'state_change';

export type SideEffectStatus = 'planned' | 'blocked' | 'executed' | 'failed' | 'compensated' | 'skipped';

export interface SideEffectDescriptor {
  readonly id: string;
  readonly enforcementRequestId: string;
  readonly type: SideEffectType;
  readonly status: SideEffectStatus;
  readonly targetSystem?: string;
  readonly targetResource?: string;
  readonly description?: string;
  readonly plannedAt: string;
  readonly executedAt?: string;
  readonly failedAt?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
