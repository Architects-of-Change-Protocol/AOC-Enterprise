import type { AuthorityChain } from './authority-chain.js';

export type AuthorityDecisionType =
  | 'authority_valid'
  | 'authority_missing'
  | 'issuer_not_authorized'
  | 'delegation_not_allowed'
  | 'delegation_depth_exceeded'
  | 'scope_expansion_detected'
  | 'non_delegable_action'
  | 'ancestor_revoked'
  | 'ancestor_expired'
  | 'self_issuance_detected'
  | 'delegation_lineage_broken'
  | 'cross_domain_authority_denied';

export interface AuthorityDecision {
  readonly id: string;
  readonly requestId: string;

  readonly type: AuthorityDecisionType;
  readonly valid: boolean;

  readonly reasonCode: string;
  readonly reason: string;

  readonly actorId: string;
  readonly principalActorId?: string;
  readonly trustDomainId: string;

  readonly chain?: AuthorityChain;
  readonly proofId?: string;

  readonly evaluatedAt: string;
}
