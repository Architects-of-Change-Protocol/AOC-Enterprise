export const TRUST_LEVELS = {
  UNTRUSTED: 0,
  VERIFIED: 1,
  TRUSTED: 2,
  SOVEREIGN: 3,
} as const;

export type TrustLevel = typeof TRUST_LEVELS[keyof typeof TRUST_LEVELS];

export const TRUST_DEGRADATION_RISKS = {
  LOW: 'low',
  MODERATE: 'moderate',
  HIGH: 'high',
  CRITICAL: 'critical',
} as const;

export type TrustDegradationRisk = typeof TRUST_DEGRADATION_RISKS[keyof typeof TRUST_DEGRADATION_RISKS];

export interface TrustDomainRef {
  readonly trustDomain: string;
  readonly environment?: string;
}

export interface TrustCompatibilityDecision {
  readonly trustCompatible: boolean;
  readonly trustDelta: number;
  readonly degradationRisk: TrustDegradationRisk;
  readonly recoveryEligibility: boolean;
  readonly escalationRequired: boolean;
}
