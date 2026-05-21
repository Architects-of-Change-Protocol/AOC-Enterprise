export const POLICY_DECISIONS = {
  ALLOW: 'allow',
  DENY: 'deny',
  ALLOW_WITH_OBLIGATIONS: 'allow-with-obligations',
} as const;

export type PolicyDecisionType = typeof POLICY_DECISIONS[keyof typeof POLICY_DECISIONS];

export const NEGOTIATION_STATUSES = {
  PROPOSED: 'proposed',
  UNDER_REVIEW: 'under_review',
  CONDITIONALLY_APPROVED: 'conditionally_approved',
  APPROVED: 'approved',
  DENIED: 'denied',
  EXPIRED: 'expired',
  REVOKED: 'revoked',
} as const;

export type NegotiationStatus = typeof NEGOTIATION_STATUSES[keyof typeof NEGOTIATION_STATUSES];

export const RISK_TIERS = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
} as const;

export type RiskTier = typeof RISK_TIERS[keyof typeof RISK_TIERS];

export const AUDIT_DELIVERY_POLICIES = {
  FAIL_OPEN: 'fail-open',
  FAIL_CLOSED: 'fail-closed',
  WARN_ONLY: 'warn-only',
} as const;

export type AuditDeliveryPolicy = typeof AUDIT_DELIVERY_POLICIES[keyof typeof AUDIT_DELIVERY_POLICIES];
