import type { AuthorityChain, AuthorityChainRequest } from '../domain/authority-chain.js';
import type { AuthorityGrant } from '../domain/authority-grant.js';
import type { DelegationGrant } from '../domain/delegation-grant.js';
import type { AuthorityRuntimeContext } from '../runtime/authority-runtime-context.js';
import type { AuthorityGraphStore } from './authority-graph-store.js';

const MAX_ANCESTRY_HOPS = 50;

export class AuthorityResolver {
  constructor(
    private readonly ctx: AuthorityRuntimeContext,
    private readonly store: AuthorityGraphStore,
  ) {}

  resolveAuthorityChain(request: AuthorityChainRequest): AuthorityChain {
    const actorGrants = this.store
      .getGrantsBySubjectActor(request.actorId)
      .filter((grant) => grant.trustDomainId === request.trustDomainId);
    const actorDelegations = this.store
      .getDelegationsByDelegateActor(request.actorId)
      .filter((delegation) => delegation.trustDomainId === request.trustDomainId);

    const matchingGrant = actorGrants.find((grant) => grant.actions.includes(request.action));
    if (matchingGrant) {
      const grants = this.collectGrantAncestry(matchingGrant);
      return this.buildChain(request, grants, [], 'valid');
    }

    const matchingDelegation = actorDelegations.find((delegation) => delegation.actions.includes(request.action));
    if (matchingDelegation) {
      const { grants, delegations } = this.collectDelegationAncestry(matchingDelegation);
      return this.buildChain(request, grants, delegations, 'valid');
    }

    if (actorGrants.length > 0 || actorDelegations.length > 0) {
      return this.buildChain(request, actorGrants, actorDelegations, 'partial');
    }

    return this.buildChain(request, [], [], 'invalid');
  }

  private collectGrantAncestry(grant: AuthorityGrant): readonly AuthorityGrant[] {
    const chain: AuthorityGrant[] = [grant];
    let current = grant;
    let guard = 0;
    while (current.parentGrantId && guard < MAX_ANCESTRY_HOPS) {
      const parent = this.store.getGrant(current.parentGrantId);
      if (!parent) {
        break;
      }
      chain.push(parent);
      current = parent;
      guard += 1;
    }
    return chain;
  }

  private collectDelegationAncestry(delegation: DelegationGrant): {
    readonly grants: readonly AuthorityGrant[];
    readonly delegations: readonly DelegationGrant[];
  } {
    const delegations: DelegationGrant[] = [delegation];
    let grants: readonly AuthorityGrant[] = [];
    let sourceId = delegation.sourceAuthorityGrantId;
    let guard = 0;

    while (guard < MAX_ANCESTRY_HOPS) {
      const sourceGrant = this.store.getGrant(sourceId);
      if (sourceGrant) {
        grants = this.collectGrantAncestry(sourceGrant);
        break;
      }
      const sourceDelegation = this.store.getDelegation(sourceId);
      if (sourceDelegation) {
        delegations.push(sourceDelegation);
        sourceId = sourceDelegation.sourceAuthorityGrantId;
        guard += 1;
        continue;
      }
      break;
    }

    return { grants, delegations };
  }

  private buildChain(
    request: AuthorityChainRequest,
    grants: readonly AuthorityGrant[],
    delegations: readonly DelegationGrant[],
    status: AuthorityChain['status'],
  ): AuthorityChain {
    const rootIssuerActorId = grants.length > 0 ? grants[grants.length - 1]?.issuerActorId : undefined;
    const principalActorId = request.principalActorId ?? delegations[0]?.principalActorId;

    return {
      id: this.ctx.ids.nextId('authority-chain'),
      requestId: request.id,
      trustDomainId: request.trustDomainId,
      actorId: request.actorId,
      grants,
      delegations,
      terminalActorId: request.actorId,
      depth: delegations.length,
      status,
      createdAt: this.ctx.clock.now(),
      ...(principalActorId !== undefined ? { principalActorId } : {}),
      ...(rootIssuerActorId !== undefined ? { rootIssuerActorId } : {}),
    };
  }
}
