import type { RecognitionDecisionType } from '../domain/recognition-decision.js';

/**
 * Structural adapter for the Authority Graph runtime. Recognition Runtime
 * does not import Authority Graph's domain types directly -- it only needs
 * something shaped like AuthorityGraphRuntime.verifyAuthority, so the two
 * features stay loosely coupled and either can evolve independently.
 */
export interface AuthorityChainRequestLike {
  readonly id: string;
  readonly actorId: string;
  readonly principalActorId?: string;
  readonly trustDomainId: string;
  readonly action: string;
  readonly resourceScope: string;
  readonly capabilityTokenId?: string;
  readonly requestedAt: string;
}

export interface AuthorityDecisionLike {
  readonly id: string;
  readonly type: string;
  readonly valid: boolean;
  readonly reasonCode: string;
  readonly reason: string;
  readonly proofId?: string;
}

export interface AuthorityGraphIntegration {
  verifyAuthority(request: AuthorityChainRequestLike): AuthorityDecisionLike;
}

/**
 * An action needs its authority lineage proven whenever the actor performing
 * it is an agent, or whenever it claims to act on behalf of a different
 * principal. Direct human self-action does not require Authority Graph
 * involvement -- a capability token is sufficient for that case.
 */
export function requiresAuthorityChain(actorType: string | undefined, actorId: string, principalActorId: string | undefined): boolean {
  if (actorType === 'agent') {
    return true;
  }
  return principalActorId !== undefined && principalActorId !== actorId;
}

const AUTHORITY_DECISION_TYPE_MAP: Readonly<Record<string, RecognitionDecisionType>> = {
  scope_expansion_detected: 'out_of_scope',
  ancestor_revoked: 'revoked',
  ancestor_expired: 'expired',
};

/** Maps a non-passing AuthorityDecisionType onto the RecognitionDecisionType it should surface as. */
export function mapAuthorityDecisionType(authorityDecisionType: string): RecognitionDecisionType {
  return AUTHORITY_DECISION_TYPE_MAP[authorityDecisionType] ?? 'policy_violation';
}
