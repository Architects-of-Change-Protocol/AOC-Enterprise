/**
 * Why AOC recognizes a holder-bound representation — the answer to "who says
 * this representative may act for this holder?".
 *
 * A **closed** union of four, and the closure is the security property, in
 * exactly the sense `GovernedAuthorityBasis` is closed. There is no
 * `{ kind: 'self-asserted' }` and there never may be: an administrator must
 * not obtain the right to spend a holder's authority by claiming to represent
 * them. Every variant below requires something the claiming party cannot
 * produce alone — a privileged administrative context, evidence this
 * deployment already accepted, a delegation the Authority Graph itself issued,
 * or a parent representation somebody else created.
 */
export type GovernedRepresentativeBasis =
  /**
   * A privileged administrative assertion that the representation exists.
   *
   * Restricted to a system context by the store that writes it, and
   * deliberately not reachable from any governed action, request handler or
   * HTTP route. It is how an existing representation relationship enters a
   * deployment during migration, and how tests establish a starting world — it
   * is not a "declare yourself an agent" API.
   */
  | { readonly kind: 'administrative-bootstrap'; readonly assertedBy: string; readonly evidenceRefs?: readonly string[] }
  /**
   * A representation grounded in a `DelegationGrant` the Authority Graph
   * already issued.
   *
   * The variant that ties this layer to the delegation machinery that already
   * exists, rather than opening a second delegation universe beside it. It is
   * only accepted when a delegation lookup is configured and the named grant
   * actually corroborates the relationship: the grant must be live, in
   * `trustDomainId`, delegate to `representativeRef`, and name `holderRef` as
   * its principal. A grant that originated from some third party is refused as
   * evidence, which is the provenance property this variant exists to enforce.
   *
   * The grant's liveness is re-checked at every evaluation rather than copied
   * here, so revoking the parent delegation disables the representation
   * without any state in this store changing.
   */
  | { readonly kind: 'authority-graph-delegation'; readonly delegationGrantId: string; readonly trustDomainId: string; readonly assertedBy: string }
  /**
   * Representation recognized on the strength of external evidence this
   * deployment already accepted — an executed mandate instrument, a custodian
   * authorization, a corporate resolution.
   *
   * `evidenceRefs` is required and must be non-empty, for the same reason
   * `recognized-external-evidence` requires it on an authority basis: an
   * evidence basis with no evidence is unverifiable free-text provenance, and
   * worse than none. AOC does not verify the evidence here; it records which
   * evidence the deployment relied on.
   */
  | { readonly kind: 'recognized-external-representation'; readonly assertedBy: string; readonly evidenceRefs: readonly string[]; readonly externalSystem?: string }
  /**
   * Representation redelegated from another representation.
   *
   * The only basis that does not need a privileged context, because it cannot
   * create authority: every dimension of the child is checked for containment
   * within the parent, and the holder is copied from the parent rather than
   * supplied, so no redelegation can reach a holder its parent could not.
   */
  | { readonly kind: 'representative-redelegation'; readonly parentRepresentativeAuthorityId: string; readonly assertedBy: string };

export type GovernedRepresentativeBasisKind = GovernedRepresentativeBasis['kind'];

/**
 * True for the bases that assert a representation into existence rather than
 * deriving it from one that already exists.
 *
 * These are the ones a store must restrict to a privileged context. Kept as a
 * predicate so that "which bases require system" is decided in one place, and
 * so adding a variant is a compile-time question rather than a silent
 * widening of who may issue.
 */
export function isGovernedRepresentativeIssuanceBasis(basis: GovernedRepresentativeBasis): boolean {
  return basis.kind !== 'representative-redelegation';
}
