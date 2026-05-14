export type GovernanceTreatyType =
  | 'bilateral'
  | 'multilateral'
  | 'coalition'
  | 'delegated_sovereignty_bloc'
  | 'emergency_governance'
  | 'audit_cooperation'
  | 'ai_safety_coalition';

export type GovernanceTreatyStatus = 'proposed' | 'active' | 'suspended' | 'expired' | 'revoked' | 'disputed';

export interface GovernanceTreaty {
  treatyId: string;
  treatyType: GovernanceTreatyType;
  title: string;
  participantRuntimeIds: string[];
  trustDomainRefs: string[];
  authorityScopeRefs: string[];
  capabilityBoundaryRefs: string[];
  executionBoundaryRefs: string[];
  quorumRulesRef: string;
  attestationRefs: string[];
  status: GovernanceTreatyStatus;
  createdAt: string;
  effectiveAt?: string;
  expiresAt?: string;
  revokedAt?: string;
}

export type TreatyParticipantRole = 'signatory' | 'observer' | 'arbitrator' | 'delegated_authority' | 'audit_witness';

export interface TreatyParticipant {
  participantId: string;
  treatyId: string;
  runtimeId: string;
  participantRole: TreatyParticipantRole;
  votingWeight: number;
  joinedAt: string;
  suspendedAt?: string;
  exitedAt?: string;
}

export interface TreatyQuorumRule {
  quorumRuleId: string;
  treatyId: string;
  minimumParticipants: number;
  minimumVotingWeight: number;
  requiredRoles: TreatyParticipantRole[];
  emergencyOverrideAllowed: boolean;
  humanReviewRequired: boolean;
}

export type TreatyAmendmentType =
  | 'add_participant'
  | 'remove_participant'
  | 'expand_authority'
  | 'reduce_authority'
  | 'update_quorum'
  | 'extend_expiration'
  | 'revoke_treaty'
  | 'emergency_constraint';
export type TreatyAmendmentStatus = 'proposed' | 'approved' | 'denied' | 'applied';

export interface TreatyAmendment {
  amendmentId: string;
  treatyId: string;
  proposedByRuntimeId: string;
  amendmentType: TreatyAmendmentType;
  proposedChanges: Record<string, unknown>;
  requiredQuorumRef: string;
  attestationRefs: string[];
  status: TreatyAmendmentStatus;
  proposedAt: string;
  resolvedAt?: string;
}

export interface TreatyAuthorityDecision {
  allowed: boolean;
  reasons: string[];
  requiredQuorumSatisfied: boolean;
  blockedAuthorityRefs: string[];
  requiredHumanReviews: string[];
  requiredAttestations: string[];
}

export type TreatyDisputeType =
  | 'authority_overreach'
  | 'execution_violation'
  | 'attestation_gap'
  | 'participant_breach'
  | 'quorum_disagreement'
  | 'revocation_dispute';
export type TreatyDisputeStatus = 'open' | 'resolved';

export interface TreatyDispute {
  disputeId: string;
  treatyId: string;
  raisedByRuntimeId: string;
  disputeType: TreatyDisputeType;
  affectedAuthorityRefs: string[];
  status: TreatyDisputeStatus;
  arbitratorRefs: string[];
  attestationRefs: string[];
  raisedAt: string;
  resolvedAt?: string;
}

export type TreatyAttestationPurpose = 'treaty_creation' | 'amendment' | 'dispute' | 'quorum' | 'authority_decision';
export interface TreatyAttestationRef {
  treatyAttestationId: string;
  treatyId: string;
  purpose: TreatyAttestationPurpose;
  attestationRef: string;
  createdAt: string;
}
