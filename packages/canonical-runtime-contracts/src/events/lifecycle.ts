export const LIFECYCLE_EVENT_TYPES = {
  GRANT_ISSUED: 'grant_issued',
  GRANT_VALIDATED: 'grant_validated',
  GRANT_CONSUMED: 'grant_consumed',
  GRANT_REPLAYED: 'grant_replayed',
  GRANT_REVOKED: 'grant_revoked',
  DELEGATION_ISSUED: 'delegation_issued',
  DELEGATION_VALIDATED: 'delegation_validated',
  DELEGATION_REVOKED: 'delegation_revoked',
  DELEGATION_DENIED: 'delegation_denied',
  CLAIM_ISSUED: 'claim_issued',
  CLAIM_VERIFIED: 'claim_verified',
  CLAIM_DENIED: 'claim_denied',
  LIFECYCLE_ERROR: 'lifecycle_error',
} as const;

export type LifecycleEventType = typeof LIFECYCLE_EVENT_TYPES[keyof typeof LIFECYCLE_EVENT_TYPES];

export interface LifecycleEventEnvelope {
  readonly eventId: string;
  readonly eventType: LifecycleEventType;
  readonly occurredAt: string;
  readonly correlationId?: string;
  readonly actorId: string;
  readonly tenantId: string;
  readonly orgId: string;
  readonly subjectId?: string;
  readonly reasonCodes: ReadonlyArray<string>;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
