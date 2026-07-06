import type { AuthorityChain, AuthorityChainRequest } from '../domain/authority-chain.js';
import type { AuthorityDecision } from '../domain/authority-decision.js';
import type { AuthorityGrant } from '../domain/authority-grant.js';
import type { AuthorityProof } from '../domain/authority-proof.js';
import type { AuthorityEvent } from '../domain/authority-event.js';
import type { DelegationGrant } from '../domain/delegation-grant.js';
import type { RevocableAuthorityEntityType, RevocationLink } from '../domain/revocation-link.js';
import type { RoleAssignment } from '../domain/role-assignment.js';
import { AuthorityChainVerifier } from '../services/authority-chain-verifier.js';
import { AuthorityGraphStore } from '../services/authority-graph-store.js';
import { AuthorityGrantService, type IssueAuthorityGrantInput } from '../services/authority-grant-service.js';
import { AuthorityLineageLedger, type AuthorityEventTrailFilter } from '../services/authority-lineage-ledger.js';
import { AuthorityProofService } from '../services/authority-proof-service.js';
import { AuthorityResolver } from '../services/authority-resolver.js';
import { DelegationService, type CreateDelegationGrantInput } from '../services/delegation-service.js';
import { RoleAssignmentService, type AssignRoleInput } from '../services/role-assignment-service.js';
import type { AuthorityRuntimeContext } from './authority-runtime-context.js';
import { AuthorityGrantNotFoundError, DelegationGrantNotFoundError } from './authority-runtime-errors.js';

export type BuildAuthorityChainRequestInput = Omit<AuthorityChainRequest, 'id' | 'requestedAt'> & { readonly id?: string };

export class AuthorityGraphRuntime {
  readonly store: AuthorityGraphStore;
  readonly authorityGrantService: AuthorityGrantService;
  readonly roleAssignmentService: RoleAssignmentService;
  readonly delegationService: DelegationService;
  readonly resolver: AuthorityResolver;
  readonly proofService: AuthorityProofService;
  readonly ledger: AuthorityLineageLedger;
  readonly verifier: AuthorityChainVerifier;

  constructor(private readonly ctx: AuthorityRuntimeContext) {
    this.store = new AuthorityGraphStore();
    this.authorityGrantService = new AuthorityGrantService(ctx, this.store);
    this.roleAssignmentService = new RoleAssignmentService(ctx, this.store, this.authorityGrantService);
    this.delegationService = new DelegationService(ctx, this.store);
    this.resolver = new AuthorityResolver(ctx, this.store);
    this.proofService = new AuthorityProofService(ctx);
    this.ledger = new AuthorityLineageLedger(ctx);
    this.verifier = new AuthorityChainVerifier(ctx, this.store, this.resolver, this.proofService, this.ledger);
  }

  registerRootIssuer(trustDomainId: string, actorId: string): void {
    this.store.registerRootIssuer(trustDomainId, actorId);
  }

  acceptCrossDomainAuthority(trustDomainId: string): void {
    this.store.acceptCrossDomainAuthority(trustDomainId);
  }

  issueAuthorityGrant(input: IssueAuthorityGrantInput): AuthorityGrant {
    const grant = this.authorityGrantService.issueAuthorityGrant(input);
    this.ledger.recordEvent({
      type: 'authority_grant_issued',
      trustDomainId: grant.trustDomainId,
      issuerActorId: grant.issuerActorId,
      subjectActorId: grant.subjectActorId,
      authorityGrantId: grant.id,
      payload: { capability: grant.capability, actions: grant.actions, resourceScopes: grant.resourceScopes },
    });
    return grant;
  }

  assignRole(input: AssignRoleInput): RoleAssignment {
    return this.roleAssignmentService.assignRole(input);
  }

  createDelegationGrant(input: CreateDelegationGrantInput): DelegationGrant {
    const delegation = this.delegationService.createDelegationGrant(input);
    this.ledger.recordEvent({
      type: 'delegation_grant_issued',
      trustDomainId: delegation.trustDomainId,
      delegatorActorId: delegation.delegatorActorId,
      delegateActorId: delegation.delegateActorId,
      delegationGrantId: delegation.id,
      payload: { capability: delegation.capability, actions: delegation.actions, resourceScopes: delegation.resourceScopes },
    });
    return delegation;
  }

  buildAuthorityChainRequest(input: BuildAuthorityChainRequestInput): AuthorityChainRequest {
    return {
      ...input,
      id: input.id ?? this.ctx.ids.nextId('authority-chain-request'),
      requestedAt: this.ctx.clock.now(),
    };
  }

  resolveAuthorityChain(request: AuthorityChainRequest): AuthorityChain {
    return this.resolver.resolveAuthorityChain(request);
  }

  verifyAuthority(request: AuthorityChainRequest): AuthorityDecision {
    return this.verifier.verifyAuthority(request);
  }

  revokeAuthorityGrant(authorityGrantId: string, revokedByActorId: string, reason: string): AuthorityGrant {
    const grant = this.authorityGrantService.getAuthorityGrant(authorityGrantId);
    if (!grant) {
      throw new AuthorityGrantNotFoundError(authorityGrantId);
    }
    const revoked = this.authorityGrantService.revokeAuthorityGrant(authorityGrantId);
    this.recordRevocationLink('authority_grant', authorityGrantId, revoked.trustDomainId, revokedByActorId, reason);
    this.ledger.recordEvent({
      type: 'authority_grant_revoked',
      trustDomainId: revoked.trustDomainId,
      subjectActorId: revoked.subjectActorId,
      authorityGrantId,
      payload: { reason },
    });
    return revoked;
  }

  suspendAuthorityGrant(authorityGrantId: string): AuthorityGrant {
    const grant = this.authorityGrantService.suspendAuthorityGrant(authorityGrantId);
    this.ledger.recordEvent({
      type: 'authority_grant_suspended',
      trustDomainId: grant.trustDomainId,
      subjectActorId: grant.subjectActorId,
      authorityGrantId,
      payload: {},
    });
    return grant;
  }

  expireAuthorityGrant(authorityGrantId: string): AuthorityGrant {
    const grant = this.authorityGrantService.expireAuthorityGrant(authorityGrantId);
    this.ledger.recordEvent({
      type: 'authority_grant_expired',
      trustDomainId: grant.trustDomainId,
      subjectActorId: grant.subjectActorId,
      authorityGrantId,
      payload: {},
    });
    return grant;
  }

  revokeDelegationGrant(delegationGrantId: string, revokedByActorId: string, reason: string): DelegationGrant {
    const delegation = this.delegationService.getDelegationGrant(delegationGrantId);
    if (!delegation) {
      throw new DelegationGrantNotFoundError(delegationGrantId);
    }
    const revoked = this.delegationService.revokeDelegationGrant(delegationGrantId);
    this.recordRevocationLink('delegation_grant', delegationGrantId, revoked.trustDomainId, revokedByActorId, reason);
    this.ledger.recordEvent({
      type: 'delegation_grant_revoked',
      trustDomainId: revoked.trustDomainId,
      delegateActorId: revoked.delegateActorId,
      delegationGrantId,
      payload: { reason },
    });
    return revoked;
  }

  suspendDelegationGrant(delegationGrantId: string): DelegationGrant {
    const delegation = this.delegationService.suspendDelegationGrant(delegationGrantId);
    this.ledger.recordEvent({
      type: 'delegation_grant_suspended',
      trustDomainId: delegation.trustDomainId,
      delegateActorId: delegation.delegateActorId,
      delegationGrantId,
      payload: {},
    });
    return delegation;
  }

  expireDelegationGrant(delegationGrantId: string): DelegationGrant {
    const delegation = this.delegationService.expireDelegationGrant(delegationGrantId);
    this.ledger.recordEvent({
      type: 'delegation_grant_expired',
      trustDomainId: delegation.trustDomainId,
      delegateActorId: delegation.delegateActorId,
      delegationGrantId,
      payload: {},
    });
    return delegation;
  }

  getAuthorityProof(authorityDecisionId: string): AuthorityProof | undefined {
    return this.proofService.getProofByDecisionId(authorityDecisionId);
  }

  getAuthorityEvents(filter?: AuthorityEventTrailFilter): readonly AuthorityEvent[] {
    return this.ledger.getEventTrail(filter);
  }

  private recordRevocationLink(
    revokedEntityType: RevocableAuthorityEntityType,
    revokedEntityId: string,
    trustDomainId: string,
    revokedByActorId: string,
    reason: string,
  ): RevocationLink {
    const revocationLink: RevocationLink = {
      id: this.ctx.ids.nextId('revocation-link'),
      revokedEntityType,
      revokedEntityId,
      revokedByActorId,
      trustDomainId,
      reason,
      revokedAt: this.ctx.clock.now(),
    };
    return this.store.putRevocationLink(revocationLink);
  }
}

export function createAuthorityGraphRuntime(ctx: AuthorityRuntimeContext): AuthorityGraphRuntime {
  return new AuthorityGraphRuntime(ctx);
}
