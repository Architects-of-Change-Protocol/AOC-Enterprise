export type AgentRuntimeActionCategory =
  | 'read_data'
  | 'write_data'
  | 'send_message'
  | 'create_record'
  | 'update_record'
  | 'delete_record'
  | 'execute_tool'
  | 'external_call'
  | 'financial_action'
  | 'legal_commitment'
  | 'unknown';

export interface AgentRuntimeActionRequest {
  readonly requestId: string;
  readonly passportId: string;
  readonly agentId?: string;
  readonly tenantId?: string;
  readonly orgId?: string;
  readonly actorId: string;
  readonly requestedAction: string;
  readonly actionCategory: AgentRuntimeActionCategory;
  readonly toolName?: string;
  readonly resource?: string;
  readonly dataCategories?: readonly string[];
  readonly payload?: Readonly<Record<string, unknown>>;
  readonly riskTier?: string;
  readonly requestedAt: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
