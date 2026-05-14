export type RuntimeNegotiationType =
  | 'federation_expansion'
  | 'delegation_extension'
  | 'ai_execution_request'
  | 'temporary_isolation_exception'
  | 'remote_execution_authority'
  | 'trust_recovery'
  | 'emergency_governance';

export type RuntimeNegotiationStatus =
  | 'proposed'
  | 'under_review'
  | 'conditionally_approved'
  | 'approved'
  | 'denied'
  | 'expired'
  | 'revoked';

export interface RuntimeNegotiation {
  negotiationId: string;
  sourceRuntimeId: string;
  targetRuntimeId: string;
  negotiationType: RuntimeNegotiationType;
  requestedAuthorities: string[];
  requestedFederationModes: string[];
  requestedExecutionScopes: string[];
  trustRequirements: string[];
  isolationExceptions: string[];
  status: RuntimeNegotiationStatus;
  createdAt: string;
  resolvedAt?: string;
}

export interface NegotiationEnvelope {
  envelopeId: string;
  negotiationId: string;
  sourceTrustPostureRef: string;
  targetTrustPostureRef: string;
  requiredAttestationRefs: string[];
  capabilityBoundaryRefs: string[];
  executionRestrictions: string[];
  temporalConstraints: { notBefore: string; notAfter: string };
  replayProtectionRefs: string[];
}

export interface NegotiationProposal {
  proposalId: string;
  negotiationId: string;
  proposedFederationModes: string[];
  proposedDelegationLimits: string[];
  proposedExecutionBoundaries: string[];
  proposedAIGovernanceLimits: string[];
  proposedRecoveryConditions: string[];
  explainabilityRefs: string[];
}

export interface NegotiationBoundaryDecision {
  compatible: boolean;
  incompatibilityReasons: string[];
  blockedCapabilities: string[];
  blockedExecutionScopes: string[];
  requiredHumanReviews: string[];
  trustWarnings: string[];
}

export interface NegotiationTrustDecision {
  trustCompatible: boolean;
  trustDelta: number;
  degradationRisk: 'low' | 'moderate' | 'high' | 'critical';
  recoveryEligibility: boolean;
  escalationRequired: boolean;
}

export interface RuntimeBoundaryContext {
  sourceIsolationProfile: string;
  targetIsolationProfile: string;
  sourceCapabilities: string[];
  targetCapabilities: string[];
  blockedRuntimeTypes: string[];
  sourceRuntimeType: string;
  targetRuntimeType: string;
  federationRestrictions: string[];
  executionRestrictions: string[];
  aiGovernanceRestrictions: string[];
}

export interface RuntimeTrustContext {
  sourceTrustPosture: number;
  targetTrustPosture: number;
  federationHistoryScore: number;
  degradationSignals: string[];
  attestationContinuity: boolean;
  unresolvedFailures: number;
  escalationHistoryCount: number;
}

export interface NegotiationAttestation {
  attestationId: string;
  negotiationId: string;
  envelopeId: string;
  evidenceRefs: string[];
  trustBoundaryContinuityRef: string;
  replayChainRef: string;
  temporaryAgreementRef: string;
  issuedAt: string;
  previousAttestationRef?: string;
}

export interface NegotiationIntegrationDecision {
  executionContinuationEligible: boolean;
  federationExpansionEligible: boolean;
  temporaryExecutionAuthorityEligible: boolean;
  aiExecutionEligible: boolean;
  distributedEscalationRequired: boolean;
  humanReviewRequired: boolean;
  reasons: string[];
}
