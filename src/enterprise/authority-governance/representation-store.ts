import type { GovernedRepresentativeAuthority } from '@aoc-enterprise/governed-authority';

import type { AuthorityGovernanceContext, GovernedAuthorityResourceRef } from './contracts.js';
import type {
  GovernedRepresentationStoreHealth,
  GrantRepresentativeAuthorityInput,
  GrantRepresentativeAuthorityOutcome,
} from './representation-contracts.js';

/**
 * The durable Governed Representation Store: which parties this deployment
 * recognizes as authorized to exercise which *other* parties' governed
 * authority.
 *
 * An independent store beside the Governed Authority Store rather than more
 * columns inside it, and the separation is load-bearing rather than tidy. A
 * holder's authority state must not be rewritten — and its digest re-sealed —
 * every time an administrator is appointed or removed; a representation's
 * lifecycle (revocation, redelegation, validity windows) has nothing in common
 * with a position's (conservation, exhaustion); and the two are queried at
 * different points by different ports. One table would have coupled a
 * governance-personnel change to an authority-ledger write.
 *
 * Deliberately entity-specific, in the same way `GovernedAuthorityStore` is.
 * There are exactly two ways state changes here — grant a representation, and
 * withdraw one — so there is no generic `update`, no `setScope`, no `delete`,
 * and no path by which a caller could widen a binding after the fact. Widening
 * is a new grant, which goes through the same validation the first one did.
 *
 * Note what this deliberately does **not** offer:
 *
 * - **No amendment.** Editing a live binding's holder, right, action or
 *   ceiling would change what was authorized without changing what any audit
 *   record says was authorized.
 * - **No un-revoke.** Withdrawal is an event that happened; reinstatement is a
 *   new grant with its own basis.
 * - **No cross-tenant read.** A representation proves nothing outside the
 *   tenant it was granted in.
 */
export interface GovernedRepresentationStore {
  readonly providerKind: 'memory' | 'sqlite';

  /**
   * Records a holder-bound representation.
   *
   * Throws `GOVERNED_REPRESENTATION_GRANT_NOT_PERMITTED` unless the basis is
   * `representative-redelegation` or `context.system`; and, for a
   * redelegation, unless the caller is the parent's representative or a system
   * context. Validates every dimension of a redelegation for containment
   * within its parent before persisting, and refuses a self-representation, an
   * empty right list, an empty action list and a basis that does not
   * corroborate.
   *
   * Idempotent on `idempotencyKey` when one is supplied.
   */
  grantRepresentativeAuthority(
    context: AuthorityGovernanceContext,
    input: GrantRepresentativeAuthorityInput,
  ): Promise<GrantRepresentativeAuthorityOutcome>;

  /**
   * Withdraws a representation. Idempotent: revoking an already-revoked
   * binding returns it unchanged rather than moving its `revokedAt`, so a
   * retried withdrawal cannot rewrite when the withdrawal happened.
   *
   * Withdraws nothing else. The holder's `GovernedAuthorityPosition` is
   * untouched, other representatives of the same holder are untouched,
   * mandates already issued are untouched, and transitions already committed
   * are untouched — see `docs/enterprise/AOC_GOVERNED_REPRESENTATIVE_AUTHORITY.md`,
   * "What revocation does and does not reach".
   */
  revokeRepresentativeAuthority(
    context: AuthorityGovernanceContext,
    tenantId: string,
    representativeAuthorityId: string,
  ): Promise<GovernedRepresentativeAuthority>;

  /** Tenant-scoped lookup by id, or `null`. Reads fail closed on a digest mismatch rather than reconstructing a binding from bytes that changed after commit. */
  getRepresentativeAuthority(
    context: AuthorityGovernanceContext,
    tenantId: string,
    representativeAuthorityId: string,
  ): Promise<GovernedRepresentativeAuthority | null>;

  /**
   * Every binding from one representative to one holder over one resource, in
   * a stable order.
   *
   * The enforcement path's only query, and its shape is why the holder binding
   * cannot be bypassed: the holder is part of the lookup key rather than a
   * field checked afterwards, so a binding for a different holder is never
   * even a candidate. Several may exist — a representative may hold one
   * binding for a right and a separate, differently-scoped one for another —
   * and the resolver takes the best-covering rather than the first.
   */
  listRepresentativeAuthorities(
    context: AuthorityGovernanceContext,
    tenantId: string,
    representativeRef: string,
    holderRef: string,
    resource: GovernedAuthorityResourceRef,
  ): Promise<readonly GovernedRepresentativeAuthority[]>;

  health(): Promise<GovernedRepresentationStoreHealth>;

  close(): Promise<void>;
}
