export type AuditEventType =
  | 'actor_registered'
  | 'actor_status_changed'
  | 'trust_domain_created'
  | 'passport_issued'
  | 'passport_suspended'
  | 'passport_revoked'
  | 'capability_token_issued'
  | 'capability_token_suspended'
  | 'capability_token_revoked'
  | 'recognition_decision';

export interface AuditEvent {
  readonly id: string;
  readonly eventType: AuditEventType;
  readonly actorId: string;
  readonly trustDomainId: string;
  readonly requestId?: string;
  readonly decisionId?: string;
  readonly passportId?: string;
  readonly capabilityTokenId?: string;
  readonly timestamp: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly previousHash?: string;
  readonly eventHash: string;
}
