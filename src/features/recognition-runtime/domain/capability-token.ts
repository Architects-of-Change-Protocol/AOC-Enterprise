import type { RecognitionProof } from './proof.js';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical' | 'prohibited';

export type CapabilityTokenStatus = 'valid' | 'expired' | 'suspended' | 'revoked';

export interface CapabilityConstraints {
  readonly prohibitedActions: readonly string[];
}

export interface DelegationPolicyRecord {
  readonly delegable: boolean;
  readonly delegatedFromTokenId?: string;
  readonly delegationDepth: number;
  readonly maxDelegationDepth: number;
}

export interface EvidenceRequirement {
  readonly action: string;
  readonly requiredEvidenceTypes: readonly string[];
}

export interface ApprovalRequirement {
  readonly actions: readonly string[];
  readonly requiredApproverActorIds?: readonly string[];
}

export interface RecognitionCapabilityToken {
  readonly id: string;
  readonly subjectActorId: string;
  readonly principalActorId: string;
  readonly issuerActorId: string;
  readonly trustDomainId: string;
  readonly capability: string;
  readonly actions: readonly string[];
  readonly resourceScopes: readonly string[];
  readonly jurisdiction?: string;
  readonly constraints: CapabilityConstraints;
  readonly delegation: DelegationPolicyRecord;
  readonly evidenceRequirements: readonly EvidenceRequirement[];
  readonly approvalRequirement?: ApprovalRequirement;
  readonly riskLevel: RiskLevel;
  readonly status: CapabilityTokenStatus;
  readonly issuedAt: string;
  readonly expiresAt?: string;
  readonly proof?: RecognitionProof;
}
