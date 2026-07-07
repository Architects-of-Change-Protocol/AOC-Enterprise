export type EnforcementAdapterType = 'tool_call' | 'api_handler' | 'workflow_step' | 'webhook' | 'scheduled_job' | 'manual_operation' | 'generic';

export interface EnforcementAdapter {
  readonly id: string;

  readonly type: EnforcementAdapterType;

  readonly name: string;

  readonly allowedActions?: readonly string[];
  readonly deniedActions?: readonly string[];

  readonly allowedCapabilities?: readonly string[];
  readonly deniedCapabilities?: readonly string[];

  readonly allowedResourceScopes?: readonly string[];
  readonly deniedResourceScopes?: readonly string[];

  readonly requiresIdempotencyKey: boolean;

  readonly metadata?: Readonly<Record<string, unknown>>;
}
