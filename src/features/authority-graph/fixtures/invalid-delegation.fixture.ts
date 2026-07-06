import type { AuthorityGrant } from '../domain/authority-grant.js';
import type { DelegationGrant } from '../domain/delegation-grant.js';
import type { AuthorityGraphRuntime } from '../runtime/authority-graph-runtime.js';
import { OTHER_PROJECT_SCOPE, PROJECT_SCOPE, type DatasysAuthorityGraphWorld } from './datasys-authority-graph.fixture.js';
import type { PmfreakDelegationFixture } from './pmfreak-delegation.fixture.js';

export const FORGED_SUB_AGENT_ACTOR_ID = 'actor-pmfreak-sub-agent';

export interface InvalidDelegationFixture {
  /** A forged re-delegation from PMFreak, whose delegation forbids redelegation -- built by bypassing DelegationService. */
  readonly forgedRedelegation: DelegationGrant;
  /** A forged delegation that expands its resource scope beyond what PMFreak itself was granted. */
  readonly forgedScopeExpansion: DelegationGrant;
}

/**
 * Simulates attacks the DelegationService would normally reject at creation
 * time, by importing already-invalid DelegationGrant records directly into
 * the store. Used to exercise AuthorityChainVerifier's defense-in-depth
 * checks against data that did not pass through the service layer.
 */
export function buildInvalidDelegationFixture(
  runtime: AuthorityGraphRuntime,
  world: DatasysAuthorityGraphWorld,
  pmfreakDelegation: PmfreakDelegationFixture,
): InvalidDelegationFixture {
  const source = pmfreakDelegation.pmfreakDelegation;

  const forgedRedelegation: DelegationGrant = {
    id: 'delegation-grant-forged-sub-agent',
    delegatorActorId: world.pmfreakActorId,
    delegateActorId: FORGED_SUB_AGENT_ACTOR_ID,
    principalActorId: source.principalActorId,
    trustDomainId: world.trustDomainId,
    sourceAuthorityGrantId: source.id,
    capability: source.capability,
    actions: source.actions,
    resourceScopes: source.resourceScopes,
    delegationDepth: source.delegationDepth + 1,
    canRedelegate: false,
    status: 'active',
    issuedAt: source.issuedAt,
    ...(source.maxDelegationDepth !== undefined ? { maxDelegationDepth: source.maxDelegationDepth } : {}),
  };
  runtime.store.importDelegation(forgedRedelegation);

  const forgedScopeExpansion: DelegationGrant = {
    id: 'delegation-grant-forged-scope-expansion',
    delegatorActorId: world.victorActorId,
    delegateActorId: world.pmfreakActorId,
    principalActorId: world.victorActorId,
    trustDomainId: world.trustDomainId,
    sourceAuthorityGrantId: source.sourceAuthorityGrantId,
    capability: source.capability,
    actions: ['draft_meeting_notes'],
    resourceScopes: [PROJECT_SCOPE, OTHER_PROJECT_SCOPE],
    delegationDepth: 1,
    canRedelegate: false,
    maxDelegationDepth: 1,
    status: 'active',
    issuedAt: source.issuedAt,
  };
  runtime.store.importDelegation(forgedScopeExpansion);

  return { forgedRedelegation, forgedScopeExpansion };
}

/**
 * Simulates PMFreak attempting to self-issue authority for a prohibited
 * action (approve_payment), bypassing AuthorityGrantService's self-issuance
 * guard by importing the forged grant directly into the store.
 */
export function buildSelfIssuedGrantFixture(runtime: AuthorityGraphRuntime, world: DatasysAuthorityGraphWorld): AuthorityGrant {
  const forgedSelfGrant: AuthorityGrant = {
    id: 'authority-grant-forged-self-issued',
    issuerActorId: world.pmfreakActorId,
    subjectActorId: world.pmfreakActorId,
    trustDomainId: world.trustDomainId,
    capability: 'payments.approval',
    actions: ['approve_payment'],
    resourceScopes: [PROJECT_SCOPE],
    canDelegate: false,
    status: 'active',
    issuedAt: '2026-01-01T00:00:00.000Z',
  };
  return runtime.store.importGrant(forgedSelfGrant);
}
