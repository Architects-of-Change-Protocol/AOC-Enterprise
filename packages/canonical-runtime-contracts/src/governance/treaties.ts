export const TREATY_TYPES = {
  BILATERAL: 'bilateral',
  MULTILATERAL: 'multilateral',
  COALITION: 'coalition',
  DELEGATED_SOVEREIGNTY_BLOC: 'delegated_sovereignty_bloc',
  EMERGENCY_GOVERNANCE: 'emergency_governance',
  AUDIT_COOPERATION: 'audit_cooperation',
  AI_SAFETY_COALITION: 'ai_safety_coalition',
} as const;

export type GovernanceTreatyType = typeof TREATY_TYPES[keyof typeof TREATY_TYPES];

export const TREATY_STATUSES = {
  PROPOSED: 'proposed',
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  EXPIRED: 'expired',
  REVOKED: 'revoked',
  DISPUTED: 'disputed',
} as const;

export type GovernanceTreatyStatus = typeof TREATY_STATUSES[keyof typeof TREATY_STATUSES];

export const TREATY_PARTICIPANT_ROLES = {
  SIGNATORY: 'signatory',
  OBSERVER: 'observer',
  ARBITRATOR: 'arbitrator',
  DELEGATED_AUTHORITY: 'delegated_authority',
  AUDIT_WITNESS: 'audit_witness',
} as const;

export type TreatyParticipantRole = typeof TREATY_PARTICIPANT_ROLES[keyof typeof TREATY_PARTICIPANT_ROLES];

export const TREATY_AMENDMENT_TYPES = {
  ADD_PARTICIPANT: 'add_participant',
  REMOVE_PARTICIPANT: 'remove_participant',
  EXPAND_AUTHORITY: 'expand_authority',
  REDUCE_AUTHORITY: 'reduce_authority',
  UPDATE_QUORUM: 'update_quorum',
  EXTEND_EXPIRATION: 'extend_expiration',
  REVOKE_TREATY: 'revoke_treaty',
  EMERGENCY_CONSTRAINT: 'emergency_constraint',
} as const;

export type TreatyAmendmentType = typeof TREATY_AMENDMENT_TYPES[keyof typeof TREATY_AMENDMENT_TYPES];

export const TREATY_AMENDMENT_STATUSES = {
  PROPOSED: 'proposed',
  APPROVED: 'approved',
  DENIED: 'denied',
  APPLIED: 'applied',
} as const;

export type TreatyAmendmentStatus = typeof TREATY_AMENDMENT_STATUSES[keyof typeof TREATY_AMENDMENT_STATUSES];

export const TREATY_DISPUTE_TYPES = {
  AUTHORITY_OVERREACH: 'authority_overreach',
  EXECUTION_VIOLATION: 'execution_violation',
  ATTESTATION_GAP: 'attestation_gap',
  PARTICIPANT_BREACH: 'participant_breach',
  QUORUM_DISAGREEMENT: 'quorum_disagreement',
  REVOCATION_DISPUTE: 'revocation_dispute',
} as const;

export type TreatyDisputeType = typeof TREATY_DISPUTE_TYPES[keyof typeof TREATY_DISPUTE_TYPES];

export const TREATY_DISPUTE_STATUSES = {
  OPEN: 'open',
  RESOLVED: 'resolved',
} as const;

export type TreatyDisputeStatus = typeof TREATY_DISPUTE_STATUSES[keyof typeof TREATY_DISPUTE_STATUSES];

export const TREATY_ATTESTATION_PURPOSES = {
  TREATY_CREATION: 'treaty_creation',
  AMENDMENT: 'amendment',
  DISPUTE: 'dispute',
  QUORUM: 'quorum',
  AUTHORITY_DECISION: 'authority_decision',
} as const;

export type TreatyAttestationPurpose = typeof TREATY_ATTESTATION_PURPOSES[keyof typeof TREATY_ATTESTATION_PURPOSES];
