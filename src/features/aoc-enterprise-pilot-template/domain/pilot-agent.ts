export type PilotAgentType =
  | 'pm_agent'
  | 'finance_agent'
  | 'procurement_agent'
  | 'data_agent'
  | 'settlement_agent'
  | 'external_agent'
  | 'operator_assistant';

/**
 * An autonomous agent referenced by a pilot template. Allowed/denied action
 * lists here are pilot-authored expectations describing the bounded use
 * case -- the actual allow/deny decision always comes from Action
 * Enforcement at runtime.
 */
export interface PilotAgent {
  readonly id: string;
  readonly name: string;
  readonly agentType: PilotAgentType;
  readonly ownerActorId: string;
  readonly trustDomainId: string;
  readonly allowedActions: readonly string[];
  readonly deniedActions: readonly string[];
  readonly requiredCapabilities: readonly string[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}
