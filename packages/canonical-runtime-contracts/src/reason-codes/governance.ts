export const GOVERNANCE_REASON_CODES = {
  GOVERNANCE_DENIED: 'governance_denied',
  GOVERNANCE_POLICY_VIOLATED: 'governance_policy_violated',
  GOVERNANCE_OBLIGATION_REQUIRED: 'governance_obligation_required',
  GOVERNANCE_QUORUM_NOT_MET: 'governance_quorum_not_met',
  GOVERNANCE_TREATY_SUSPENDED: 'governance_treaty_suspended',
  GOVERNANCE_TREATY_EXPIRED: 'governance_treaty_expired',
  GOVERNANCE_TREATY_DISPUTED: 'governance_treaty_disputed',
  GOVERNANCE_SCOPE_INSUFFICIENT: 'governance_scope_insufficient',
  GOVERNANCE_TRUST_DOMAIN_INCOMPATIBLE: 'governance_trust_domain_incompatible',
  GOVERNANCE_ESCALATION_REQUIRED: 'governance_escalation_required',
  GOVERNANCE_RISK_THRESHOLD_EXCEEDED: 'governance_risk_threshold_exceeded',
  GOVERNANCE_EMERGENCY_CONSTRAINT_ACTIVE: 'governance_emergency_constraint_active',
} as const;

export type GovernanceReasonCode = typeof GOVERNANCE_REASON_CODES[keyof typeof GOVERNANCE_REASON_CODES];
