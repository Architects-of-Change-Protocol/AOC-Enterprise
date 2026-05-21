export const GOVERNANCE_EVENT_TYPES = {
  POLICY_EVALUATED: 'policy_evaluated',
  POLICY_BOUND: 'policy_bound',
  GOVERNANCE_DECISION_RECORDED: 'governance_decision_recorded',
  TREATY_PROPOSED: 'treaty_proposed',
  TREATY_ACTIVATED: 'treaty_activated',
  TREATY_SUSPENDED: 'treaty_suspended',
  TREATY_EXPIRED: 'treaty_expired',
  TREATY_DISPUTED: 'treaty_disputed',
  NEGOTIATION_INITIATED: 'negotiation_initiated',
  NEGOTIATION_RESOLVED: 'negotiation_resolved',
  AUDIT_ROUTED: 'audit_routed',
  AUDIT_DROPPED: 'audit_dropped',
} as const;

export type GovernanceEventType = typeof GOVERNANCE_EVENT_TYPES[keyof typeof GOVERNANCE_EVENT_TYPES];

export interface GovernanceEventEnvelope {
  readonly eventId: string;
  readonly eventType: GovernanceEventType;
  readonly occurredAt: string;
  readonly correlationId?: string;
  readonly tenantId: string;
  readonly orgId?: string;
  readonly actorId?: string;
  readonly decisionId?: string;
  readonly policyRevisionId?: string;
  readonly reasonCodes?: ReadonlyArray<string>;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
