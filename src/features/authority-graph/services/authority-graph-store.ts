import type { AuthorityEdge } from '../domain/authority-edge.js';
import type { AuthorityGrant, AuthorityGrantStatus } from '../domain/authority-grant.js';
import type { AuthorityNode } from '../domain/authority-node.js';
import type { DelegationGrant, DelegationGrantStatus } from '../domain/delegation-grant.js';
import type { RevocationLink } from '../domain/revocation-link.js';
import type { RoleAssignment, RoleAssignmentStatus } from '../domain/role-assignment.js';
import {
  AuthorityGrantNotFoundError,
  DelegationGrantNotFoundError,
  RoleAssignmentNotFoundError,
} from '../runtime/authority-runtime-errors.js';

/**
 * In-memory store for the authority graph's nodes, edges and the grant /
 * delegation / role-assignment / revocation records they describe. Pure
 * storage and lookup -- issuance rules live in the services layer.
 */
export class AuthorityGraphStore {
  private readonly nodes = new Map<string, AuthorityNode>();
  private readonly edges = new Map<string, AuthorityEdge>();
  private readonly grants = new Map<string, AuthorityGrant>();
  private readonly delegations = new Map<string, DelegationGrant>();
  private readonly roleAssignments = new Map<string, RoleAssignment>();
  private readonly revocationLinks = new Map<string, RevocationLink>();
  private readonly rootIssuersByTrustDomain = new Map<string, Set<string>>();
  private readonly crossDomainAcceptance = new Set<string>();

  putNode(node: AuthorityNode): AuthorityNode {
    this.nodes.set(node.id, node);
    return node;
  }

  getNode(nodeId: string): AuthorityNode | undefined {
    return this.nodes.get(nodeId);
  }

  putEdge(edge: AuthorityEdge): AuthorityEdge {
    this.edges.set(edge.id, edge);
    return edge;
  }

  getEdge(edgeId: string): AuthorityEdge | undefined {
    return this.edges.get(edgeId);
  }

  putGrant(grant: AuthorityGrant): AuthorityGrant {
    this.grants.set(grant.id, grant);
    return grant;
  }

  getGrant(authorityGrantId: string): AuthorityGrant | undefined {
    return this.grants.get(authorityGrantId);
  }

  putDelegation(delegation: DelegationGrant): DelegationGrant {
    this.delegations.set(delegation.id, delegation);
    return delegation;
  }

  getDelegation(delegationGrantId: string): DelegationGrant | undefined {
    return this.delegations.get(delegationGrantId);
  }

  putRoleAssignment(roleAssignment: RoleAssignment): RoleAssignment {
    this.roleAssignments.set(roleAssignment.id, roleAssignment);
    return roleAssignment;
  }

  getRoleAssignment(roleAssignmentId: string): RoleAssignment | undefined {
    return this.roleAssignments.get(roleAssignmentId);
  }

  putRevocationLink(revocationLink: RevocationLink): RevocationLink {
    this.revocationLinks.set(revocationLink.id, revocationLink);
    return revocationLink;
  }

  getRevocationLink(revocationLinkId: string): RevocationLink | undefined {
    return this.revocationLinks.get(revocationLinkId);
  }

  getRevocationLinksForEntity(entityId: string): readonly RevocationLink[] {
    return [...this.revocationLinks.values()].filter((link) => link.revokedEntityId === entityId);
  }

  getGrantsBySubjectActor(actorId: string): readonly AuthorityGrant[] {
    return [...this.grants.values()].filter((grant) => grant.subjectActorId === actorId);
  }

  getGrantsByIssuerActor(actorId: string): readonly AuthorityGrant[] {
    return [...this.grants.values()].filter((grant) => grant.issuerActorId === actorId);
  }

  getGrantsByTrustDomain(trustDomainId: string): readonly AuthorityGrant[] {
    return [...this.grants.values()].filter((grant) => grant.trustDomainId === trustDomainId);
  }

  getDelegationsByDelegateActor(actorId: string): readonly DelegationGrant[] {
    return [...this.delegations.values()].filter((delegation) => delegation.delegateActorId === actorId);
  }

  getDelegationsByDelegatorActor(actorId: string): readonly DelegationGrant[] {
    return [...this.delegations.values()].filter((delegation) => delegation.delegatorActorId === actorId);
  }

  getDelegationsByTrustDomain(trustDomainId: string): readonly DelegationGrant[] {
    return [...this.delegations.values()].filter((delegation) => delegation.trustDomainId === trustDomainId);
  }

  getRoleAssignmentsForActor(actorId: string): readonly RoleAssignment[] {
    return [...this.roleAssignments.values()].filter((assignment) => assignment.actorId === actorId);
  }

  updateGrantStatus(authorityGrantId: string, status: AuthorityGrantStatus): AuthorityGrant {
    const existing = this.grants.get(authorityGrantId);
    if (!existing) {
      throw new AuthorityGrantNotFoundError(authorityGrantId);
    }
    const updated: AuthorityGrant = { ...existing, status };
    this.grants.set(authorityGrantId, updated);
    return updated;
  }

  updateDelegationStatus(delegationGrantId: string, status: DelegationGrantStatus): DelegationGrant {
    const existing = this.delegations.get(delegationGrantId);
    if (!existing) {
      throw new DelegationGrantNotFoundError(delegationGrantId);
    }
    const updated: DelegationGrant = { ...existing, status };
    this.delegations.set(delegationGrantId, updated);
    return updated;
  }

  updateRoleAssignmentStatus(roleAssignmentId: string, status: RoleAssignmentStatus): RoleAssignment {
    const existing = this.roleAssignments.get(roleAssignmentId);
    if (!existing) {
      throw new RoleAssignmentNotFoundError(roleAssignmentId);
    }
    const updated: RoleAssignment = { ...existing, status };
    this.roleAssignments.set(roleAssignmentId, updated);
    return updated;
  }

  registerRootIssuer(trustDomainId: string, actorId: string): void {
    const existing = this.rootIssuersByTrustDomain.get(trustDomainId);
    if (existing) {
      existing.add(actorId);
      return;
    }
    this.rootIssuersByTrustDomain.set(trustDomainId, new Set([actorId]));
  }

  isRootIssuer(trustDomainId: string, actorId: string): boolean {
    return this.rootIssuersByTrustDomain.get(trustDomainId)?.has(actorId) ?? false;
  }

  /** MVP default is closed: a trust domain must explicitly opt in to accepting cross-domain authority. */
  acceptCrossDomainAuthority(trustDomainId: string): void {
    this.crossDomainAcceptance.add(trustDomainId);
  }

  isCrossDomainAuthorityAccepted(trustDomainId: string): boolean {
    return this.crossDomainAcceptance.has(trustDomainId);
  }

  /**
   * Registers a grant built out-of-band (e.g. a forged/self-issued grant in
   * tests), skipping issuance validation. Mirrors CapabilityTokenService's
   * importCapabilityToken escape hatch in recognition-runtime.
   */
  importGrant(grant: AuthorityGrant): AuthorityGrant {
    return this.putGrant(grant);
  }

  /**
   * Registers a delegation built out-of-band (e.g. a forged over-delegation
   * in tests), skipping issuance validation.
   */
  importDelegation(delegation: DelegationGrant): DelegationGrant {
    return this.putDelegation(delegation);
  }
}
