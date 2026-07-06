import type { AuthorityActorType, AuthorityConstraint, AuthorityGrant } from '../domain/authority-grant.js';
import type { AuthorityRuntimeContext } from '../runtime/authority-runtime-context.js';
import {
  AuthorityGrantNotFoundError,
  IssuerNotAuthorizedError,
  SelfIssuanceNotPermittedError,
} from '../runtime/authority-runtime-errors.js';
import type { AuthorityGraphStore } from './authority-graph-store.js';

export interface IssueAuthorityGrantInput {
  readonly id?: string;
  readonly issuerActorId: string;
  readonly subjectActorId: string;
  readonly trustDomainId: string;
  readonly roleId?: string;
  readonly capability: string;
  readonly actions: readonly string[];
  readonly resourceScopes: readonly string[];
  readonly canDelegate?: boolean;
  readonly allowedDelegateActorTypes?: readonly AuthorityActorType[];
  readonly maxDelegationDepth?: number;
  readonly nonDelegableActions?: readonly string[];
  readonly constraints?: readonly AuthorityConstraint[];
  readonly expiresAt?: string;
  readonly parentGrantId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  /** Explicit escape hatch for a root organization bootstrapping its own trust domain. */
  readonly allowRootBootstrap?: boolean;
}

export interface FindAuthorityForActorActionInput {
  readonly actorId: string;
  readonly action: string;
  readonly trustDomainId: string;
}

export class AuthorityGrantService {
  constructor(
    private readonly ctx: AuthorityRuntimeContext,
    private readonly store: AuthorityGraphStore,
  ) {}

  issueAuthorityGrant(input: IssueAuthorityGrantInput): AuthorityGrant {
    if (input.issuerActorId === input.subjectActorId && !input.allowRootBootstrap) {
      throw new SelfIssuanceNotPermittedError(
        `actor ${input.issuerActorId} cannot issue an authority grant to itself`,
      );
    }

    const isRootIssuer = this.store.isRootIssuer(input.trustDomainId, input.issuerActorId);

    if (!isRootIssuer) {
      if (!input.parentGrantId) {
        throw new IssuerNotAuthorizedError(
          `issuer ${input.issuerActorId} is not the root issuer of trust domain ${input.trustDomainId} and provided no parent grant`,
        );
      }
      const parent = this.store.getGrant(input.parentGrantId);
      if (!parent) {
        throw new AuthorityGrantNotFoundError(input.parentGrantId);
      }
      if (parent.subjectActorId !== input.issuerActorId) {
        throw new IssuerNotAuthorizedError(`parent grant ${parent.id} is not held by issuer ${input.issuerActorId}`);
      }
      if (parent.status !== 'active') {
        throw new IssuerNotAuthorizedError(`parent grant ${parent.id} is not active`);
      }
      if (!parent.canDelegate) {
        throw new IssuerNotAuthorizedError(`parent grant ${parent.id} does not permit further issuance`);
      }
      if (!input.actions.every((action) => parent.actions.includes(action))) {
        throw new IssuerNotAuthorizedError(`requested actions exceed the scope of parent grant ${parent.id}`);
      }
      if (!input.resourceScopes.every((scope) => parent.resourceScopes.includes(scope))) {
        throw new IssuerNotAuthorizedError(`requested resource scopes exceed the scope of parent grant ${parent.id}`);
      }
    }

    const id = input.id ?? this.ctx.ids.nextId('authority-grant');
    const issuedAt = this.ctx.clock.now();
    const grant: AuthorityGrant = {
      id,
      issuerActorId: input.issuerActorId,
      subjectActorId: input.subjectActorId,
      trustDomainId: input.trustDomainId,
      capability: input.capability,
      actions: input.actions,
      resourceScopes: input.resourceScopes,
      canDelegate: input.canDelegate ?? false,
      status: 'active',
      issuedAt,
      ...(input.roleId !== undefined ? { roleId: input.roleId } : {}),
      ...(input.allowedDelegateActorTypes !== undefined ? { allowedDelegateActorTypes: input.allowedDelegateActorTypes } : {}),
      ...(input.maxDelegationDepth !== undefined ? { maxDelegationDepth: input.maxDelegationDepth } : {}),
      ...(input.nonDelegableActions !== undefined ? { nonDelegableActions: input.nonDelegableActions } : {}),
      ...(input.constraints !== undefined ? { constraints: input.constraints } : {}),
      ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
      ...(input.parentGrantId !== undefined ? { parentGrantId: input.parentGrantId } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    };
    this.store.putGrant(grant);
    return grant;
  }

  getAuthorityGrant(authorityGrantId: string): AuthorityGrant | undefined {
    return this.store.getGrant(authorityGrantId);
  }

  revokeAuthorityGrant(authorityGrantId: string): AuthorityGrant {
    return this.store.updateGrantStatus(authorityGrantId, 'revoked');
  }

  suspendAuthorityGrant(authorityGrantId: string): AuthorityGrant {
    return this.store.updateGrantStatus(authorityGrantId, 'suspended');
  }

  expireAuthorityGrant(authorityGrantId: string): AuthorityGrant {
    return this.store.updateGrantStatus(authorityGrantId, 'expired');
  }

  findAuthorityForActorAction(input: FindAuthorityForActorActionInput): readonly AuthorityGrant[] {
    return this.store
      .getGrantsBySubjectActor(input.actorId)
      .filter((grant) => grant.trustDomainId === input.trustDomainId && grant.actions.includes(input.action));
  }

  registerRootIssuer(trustDomainId: string, actorId: string): void {
    this.store.registerRootIssuer(trustDomainId, actorId);
  }
}
