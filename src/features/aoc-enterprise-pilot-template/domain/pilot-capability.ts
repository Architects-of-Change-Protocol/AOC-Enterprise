export type PilotCapabilityRiskLevel = 'low' | 'medium' | 'high' | 'critical';

/**
 * A capability a pilot template exercises. Named `PilotCapability` (not
 * `CapabilityToken`) to keep this feature a consumer, never a redefiner, of
 * the canonical `@aoc/protocol` `CapabilityToken` contract.
 */
export interface PilotCapability {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly action: string;
  readonly resourceScope: string;
  readonly riskLevel: PilotCapabilityRiskLevel;
  readonly requiredAuthority: boolean;
  readonly requiredApproval: boolean;
  readonly requiredEvidence: boolean;
  readonly policyPackSensitive: boolean;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
