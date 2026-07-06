import type { AuthorityActorType, AuthorityConstraint } from '../domain/authority-grant.js';
import type { DelegationGrant } from '../domain/delegation-grant.js';
import type { AuthorityRuntimeContext } from '../runtime/authority-runtime-context.js';
import {
  DelegationDepthExceededError,
  DelegationNotPermittedError,
  DelegationScopeExpansionError,
  NonDelegableActionError,
  SelfIssuanceNotPermittedError,
  SourceAuthorityNotFoundError,
} from '../runtime/authority-runtime-errors.js';
import type { AuthorityGraphStore } from './authority-graph-store.js';

export interface CreateDelegationGrantInput {
  readonly id?: string;
  readonly delegatorActorId: string;
  readonly delegateActorId: string;
  readonly delegateActorType: AuthorityActorType;
  readonly principalActorId?: string;
  readonly trustDomainId: string;
  readonly sourceAuthorityGrantId: string;
  readonly capability: string;
  readonly actions: readonly string[];
  readonly resourceScopes: readonly string[];
  readonly canRedelegate?: boolean;
  readonly nonDelegableActions?: readonly string[];
  readonly constraints?: readonly AuthorityConstraint[];
  readonly expiresAt?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

interface ResolvedSourceAuthority {
  readonly holderActorId: string;
  readonly trustDomainId: string;
  readonly actions: readonly string[];
  readonly resourceScopes: readonly string[];
  readonly status: string;
  readonly canDelegateFurther: boolean;
  readonly allowedDelegateActorTypes?: readonly AuthorityActorType[];
  readonly maxDelegationDepth?: number;
  readonly nonDelegableActions?: readonly string[];
  readonly delegationDepth: number;
  readonly principalActorId?: string;
}

export class DelegationService {
  constructor(
    private readonly ctx: AuthorityRuntimeContext,
    private readonly store: AuthorityGraphStore,
  ) {}

  createDelegationGrant(input: CreateDelegationGrantInput): DelegationGrant {
    if (input.delegatorActorId === input.delegateActorId) {
      throw new SelfIssuanceNotPermittedError(`actor ${input.delegatorActorId} cannot delegate authority to itself`);
    }

    const source = this.resolveSourceAuthority(input.sourceAuthorityGrantId);
    if (!source) {
      throw new SourceAuthorityNotFoundError(input.sourceAuthorityGrantId);
    }
    if (source.holderActorId !== input.delegatorActorId) {
      throw new DelegationNotPermittedError(
        `delegator ${input.delegatorActorId} does not hold source authority ${input.sourceAuthorityGrantId}`,
      );
    }
    if (source.trustDomainId !== input.trustDomainId) {
      throw new DelegationNotPermittedError(
        `source authority ${input.sourceAuthorityGrantId} belongs to a different trust domain`,
      );
    }
    if (source.status !== 'active') {
      throw new DelegationNotPermittedError(`source authority ${input.sourceAuthorityGrantId} is not active`);
    }
    if (!source.canDelegateFurther) {
      throw new DelegationNotPermittedError(`source authority ${input.sourceAuthorityGrantId} cannot be delegated further`);
    }
    if (source.allowedDelegateActorTypes && !source.allowedDelegateActorTypes.includes(input.delegateActorType)) {
      throw new DelegationNotPermittedError(`delegate actor type ${input.delegateActorType} is not permitted`);
    }

    const nonDelegable = new Set([...(source.nonDelegableActions ?? []), ...(input.nonDelegableActions ?? [])]);
    const prohibited = input.actions.find((action) => nonDelegable.has(action));
    if (prohibited) {
      throw new NonDelegableActionError(prohibited);
    }
    if (!input.actions.every((action) => source.actions.includes(action))) {
      throw new DelegationNotPermittedError('delegated actions exceed the scope of the source authority');
    }
    if (!input.resourceScopes.every((scope) => source.resourceScopes.includes(scope))) {
      throw new DelegationScopeExpansionError('delegated resource scopes exceed the scope of the source authority');
    }

    const delegationDepth = source.delegationDepth + 1;
    const maxDelegationDepth = source.maxDelegationDepth ?? 0;
    if (delegationDepth > maxDelegationDepth) {
      throw new DelegationDepthExceededError(
        `delegation depth ${delegationDepth} exceeds source authority's limit of ${maxDelegationDepth}`,
      );
    }

    const principalActorId = input.principalActorId ?? source.principalActorId ?? input.delegatorActorId;
    const canRedelegate = (input.canRedelegate ?? false) && delegationDepth < maxDelegationDepth;

    const id = input.id ?? this.ctx.ids.nextId('delegation-grant');
    const delegation: DelegationGrant = {
      id,
      delegatorActorId: input.delegatorActorId,
      delegateActorId: input.delegateActorId,
      principalActorId,
      trustDomainId: input.trustDomainId,
      sourceAuthorityGrantId: input.sourceAuthorityGrantId,
      capability: input.capability,
      actions: input.actions,
      resourceScopes: input.resourceScopes,
      delegationDepth,
      canRedelegate,
      maxDelegationDepth,
      status: 'active',
      issuedAt: this.ctx.clock.now(),
      ...(nonDelegable.size > 0 ? { nonDelegableActions: [...nonDelegable] } : {}),
      ...(input.constraints !== undefined ? { constraints: input.constraints } : {}),
      ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    };
    this.store.putDelegation(delegation);
    return delegation;
  }

  getDelegationGrant(delegationGrantId: string): DelegationGrant | undefined {
    return this.store.getDelegation(delegationGrantId);
  }

  revokeDelegationGrant(delegationGrantId: string): DelegationGrant {
    return this.store.updateDelegationStatus(delegationGrantId, 'revoked');
  }

  suspendDelegationGrant(delegationGrantId: string): DelegationGrant {
    return this.store.updateDelegationStatus(delegationGrantId, 'suspended');
  }

  expireDelegationGrant(delegationGrantId: string): DelegationGrant {
    return this.store.updateDelegationStatus(delegationGrantId, 'expired');
  }

  private resolveSourceAuthority(sourceAuthorityGrantId: string): ResolvedSourceAuthority | undefined {
    const grant = this.store.getGrant(sourceAuthorityGrantId);
    if (grant) {
      return {
        holderActorId: grant.subjectActorId,
        trustDomainId: grant.trustDomainId,
        actions: grant.actions,
        resourceScopes: grant.resourceScopes,
        status: grant.status,
        canDelegateFurther: grant.canDelegate,
        delegationDepth: 0,
        ...(grant.allowedDelegateActorTypes !== undefined ? { allowedDelegateActorTypes: grant.allowedDelegateActorTypes } : {}),
        ...(grant.maxDelegationDepth !== undefined ? { maxDelegationDepth: grant.maxDelegationDepth } : {}),
        ...(grant.nonDelegableActions !== undefined ? { nonDelegableActions: grant.nonDelegableActions } : {}),
      };
    }

    const delegation = this.store.getDelegation(sourceAuthorityGrantId);
    if (delegation) {
      return {
        holderActorId: delegation.delegateActorId,
        trustDomainId: delegation.trustDomainId,
        actions: delegation.actions,
        resourceScopes: delegation.resourceScopes,
        status: delegation.status,
        canDelegateFurther: delegation.canRedelegate,
        delegationDepth: delegation.delegationDepth,
        principalActorId: delegation.principalActorId,
        ...(delegation.maxDelegationDepth !== undefined ? { maxDelegationDepth: delegation.maxDelegationDepth } : {}),
        ...(delegation.nonDelegableActions !== undefined ? { nonDelegableActions: delegation.nonDelegableActions } : {}),
      };
    }

    return undefined;
  }
}
