export type AuthorityEventType =
  | 'authority_grant_issued'
  | 'authority_grant_revoked'
  | 'authority_grant_suspended'
  | 'authority_grant_expired'
  | 'delegation_grant_issued'
  | 'delegation_grant_revoked'
  | 'delegation_grant_suspended'
  | 'delegation_grant_expired'
  | 'authority_chain_resolved'
  | 'authority_chain_valid'
  | 'authority_chain_invalid'
  | 'authority_proof_created';

export interface AuthorityEvent {
  readonly id: string;
  readonly type: AuthorityEventType;

  readonly trustDomainId: string;

  readonly actorId?: string;
  readonly issuerActorId?: string;
  readonly subjectActorId?: string;
  readonly delegatorActorId?: string;
  readonly delegateActorId?: string;

  readonly authorityGrantId?: string;
  readonly delegationGrantId?: string;
  readonly authorityDecisionId?: string;
  readonly authorityProofId?: string;

  readonly timestamp: string;

  readonly payload: Readonly<Record<string, unknown>>;

  readonly previousHash?: string;
  readonly eventHash: string;
}
