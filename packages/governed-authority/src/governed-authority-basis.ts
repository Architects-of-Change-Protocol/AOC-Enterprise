/**
 * Why AOC recognizes an authority position — the answer to "where did this
 * come from?", carried by the transition that created or changed it rather
 * than by the position itself.
 *
 * A merged position has more than one basis (a bootstrap plus every transfer
 * that credited it), so a single `basis` field on a position would have to
 * either lie or discard history. The append-only transition log carries one
 * exact basis per movement instead, and a position's provenance is the ordered
 * list of transitions that touched it.
 *
 * This is a **closed** union of three, and the closure is the security
 * property. There is no `{ kind: 'self-asserted' }` and there never may be: an
 * actor must not obtain authority by claiming it. Every variant here requires
 * something the claiming party cannot produce alone — a privileged
 * administrative context, evidence this deployment already accepted, or a
 * prior transition AOC itself committed.
 */
export type GovernedAuthorityBasis =
  /**
   * A privileged administrative assertion of initial authority. The only
   * issuance path in the model: it credits without debiting, so it is the one
   * operation that can change the recognized total for a right.
   *
   * Deliberately restricted to a system/administrative caller by the store
   * that writes it, and deliberately *not* reachable from any governed action,
   * request handler or HTTP route. It is how existing authority enters a
   * deployment during migration, and how tests establish a starting world — it
   * is not an ownership-claim API.
   */
  | { readonly kind: 'administrative-bootstrap'; readonly assertedBy: string; readonly evidenceRefs?: readonly string[] }
  /**
   * Authority recognized on the strength of external evidence this deployment
   * already accepted (a registry extract, an executed instrument, a custodian
   * statement). Also issuance, and also administrative: AOC does not verify
   * the evidence here, it records which evidence the deployment relied on.
   *
   * `evidenceRefs` is required, because an evidence basis with no evidence is
   * an unverifiable free-text provenance and worse than none.
   */
  | { readonly kind: 'recognized-external-evidence'; readonly assertedBy: string; readonly evidenceRefs: readonly string[]; readonly externalSystem?: string }
  /**
   * Authority that arose from a governed action AOC itself authorized and
   * whose external effect it then received evidence of. Conserving: it debits
   * one position and credits another by the same quantity.
   *
   * The references are what make the chain auditable end to end — a reviewer
   * can go from a credited position back to the execution evidence, the
   * mandate that authorized it, and the Kernel decision behind that.
   */
  | {
      readonly kind: 'governed-execution';
      readonly capability: string;
      readonly executionRef: string;
      readonly mandateRef: string;
      readonly decisionRef?: string;
      readonly evaluationRef?: string;
      readonly evidenceRefs?: readonly string[];
    };

export type GovernedAuthorityBasisKind = GovernedAuthorityBasis['kind'];

/**
 * True when a basis credits authority without debiting any — the two issuance
 * bases. Conservation is a property of `governed-execution` transitions only,
 * and this predicate is the single place that distinction is made, so no
 * caller can accidentally treat an issuance as conserving or a movement as
 * issuance.
 */
export function isGovernedAuthorityIssuanceBasis(basis: GovernedAuthorityBasis): boolean {
  return basis.kind === 'administrative-bootstrap' || basis.kind === 'recognized-external-evidence';
}
