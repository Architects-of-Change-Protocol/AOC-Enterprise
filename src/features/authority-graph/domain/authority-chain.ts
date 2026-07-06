import type { AuthorityDecisionType } from './authority-decision.js';
import type { AuthorityGrant } from './authority-grant.js';
import type { DelegationGrant } from './delegation-grant.js';

export interface AuthorityChainRequest {
  readonly id: string;

  readonly actorId: string;
  readonly principalActorId?: string;

  readonly trustDomainId: string;

  readonly action: string;
  readonly resourceScope: string;
  readonly capability?: string;

  readonly requestedAt: string;

  readonly capabilityTokenId?: string;
}

export type AuthorityChainStatus = 'valid' | 'invalid' | 'partial';

export interface AuthorityChain {
  readonly id: string;
  readonly requestId: string;

  readonly trustDomainId: string;

  readonly actorId: string;
  readonly principalActorId?: string;

  readonly grants: readonly AuthorityGrant[];
  readonly delegations: readonly DelegationGrant[];

  readonly rootIssuerActorId?: string;
  readonly terminalActorId: string;

  readonly depth: number;

  readonly status: AuthorityChainStatus;

  readonly createdAt: string;
}

/**
 * The evaluation context an AuthorityPolicy runs against: a resolved
 * AuthorityChain plus the deterministic "now" it should be judged at.
 */
export interface AuthorityPolicyContext {
  readonly now: string;
  readonly chain: AuthorityChain;
  /** Whether the root-most grant in the chain was issued by a registered root issuer for its trust domain. */
  readonly rootIssuerAccepted: boolean;
  /** Whether the target trust domain explicitly accepts authority that crosses in from another trust domain. */
  readonly crossDomainAccepted: boolean;
}

export interface AuthorityPolicyOutcome {
  readonly policyId: string;
  readonly passed: boolean;
  readonly reasonCode: string;
  readonly reason: string;
  readonly decisionType?: AuthorityDecisionType;
}

export interface AuthorityPolicy {
  readonly id: string;
  evaluate(request: AuthorityChainRequest, context: AuthorityPolicyContext): AuthorityPolicyOutcome;
}
