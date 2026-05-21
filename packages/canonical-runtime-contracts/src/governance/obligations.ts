export const OBLIGATION_TYPES = {
  AUDIT_ENHANCED: 'audit_enhanced',
  HUMAN_REVIEW_REQUIRED: 'human_review_required',
  RATE_LIMITED: 'rate_limited',
  TIME_BOUNDED: 'time_bounded',
  SCOPE_RESTRICTED: 'scope_restricted',
  NOTIFY_STAKEHOLDER: 'notify_stakeholder',
  DUAL_APPROVAL: 'dual_approval',
  SOVEREIGN_ROUTING: 'sovereign_routing',
} as const;

export type ObligationType = typeof OBLIGATION_TYPES[keyof typeof OBLIGATION_TYPES];

export interface CanonicalObligation {
  readonly type: ObligationType;
  readonly params?: Readonly<Record<string, unknown>>;
}
