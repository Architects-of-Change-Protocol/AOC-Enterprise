export type EnforcementTargetType = 'tool_call' | 'api_handler' | 'workflow_step' | 'webhook' | 'scheduled_job' | 'manual_operation' | 'generic';

export interface EnforcementTarget {
  readonly id: string;
  readonly type: EnforcementTargetType;
  readonly name: string;
  readonly adapterId?: string;
  readonly description?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
