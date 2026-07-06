import type { AuthorityConstraint } from './authority-grant.js';

export type DelegationGrantStatus = 'active' | 'expired' | 'suspended' | 'revoked';

/**
 * DelegationGrant represents delegated authority, e.g. Victor delegates
 * draft_closure_email authority to PMFreak Closure Agent.
 *
 * `sourceAuthorityGrantId` names the AuthorityGrant this delegation ultimately
 * derives from. For a re-delegation (delegationDepth > 1), it may instead
 * resolve to an ancestor DelegationGrant id -- callers should look it up in
 * both the grants and delegations stores.
 */
export interface DelegationGrant {
  readonly id: string;

  readonly delegatorActorId: string;
  readonly delegateActorId: string;
  readonly principalActorId: string;
  readonly trustDomainId: string;

  readonly sourceAuthorityGrantId: string;

  readonly capability: string;
  readonly actions: readonly string[];
  readonly resourceScopes: readonly string[];

  readonly delegationDepth: number;
  readonly canRedelegate: boolean;
  readonly maxDelegationDepth?: number;
  readonly nonDelegableActions?: readonly string[];

  readonly constraints?: readonly AuthorityConstraint[];

  readonly status: DelegationGrantStatus;
  readonly issuedAt: string;
  readonly expiresAt?: string;

  readonly metadata?: Readonly<Record<string, unknown>>;
}
