export type AutonomyLevel = 'low' | 'medium' | 'high';
export type RiskTier = 'low' | 'medium' | 'high' | 'critical';
export type HumanOversightRequirement = 'required' | 'optional' | 'none';

export interface HumanOversight {
  readonly requirement: HumanOversightRequirement;
  readonly description?: string;
}

export interface EscalationRule {
  readonly trigger: string;
  readonly action: string;
  readonly escalateTo?: string;
}

export interface AgentEnrollmentInput {
  readonly agentName: string;
  readonly ownerId: string;
  readonly ownerName: string;
  readonly purpose: string;
  readonly region?: string;
  readonly jurisdiction?: string;
  readonly autonomyLevel: AutonomyLevel;
  readonly riskTier: RiskTier;
  readonly dataAccess: readonly string[];
  readonly tools: readonly string[];
  readonly humanOversight: HumanOversight;
  readonly prohibitedActions: readonly string[];
  readonly escalationRules: readonly EscalationRule[];
  readonly createdBy: string;
  readonly issuedAt: string;
  readonly description?: string;
  readonly publicDisplayName?: string;
  readonly externalAgentRef?: string;
  readonly modelProvider?: string;
  readonly runtimeEnvironment?: string;
  readonly tags?: readonly string[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}
