import type { GovernedRepresentativeAuthority, GovernedRepresentativeBasis, GovernedRepresentativeScopeLimit } from '@aoc-enterprise/governed-authority';
import type { GovernedRightType } from '@aoc-enterprise/governed-authorization';

import type { AuthorityGovernanceContext, GovernedAuthorityResourceRef } from './contracts.js';

/**
 * Creating a holder-bound representation.
 *
 * The privileged path, and the reason it is privileged is the whole point of
 * the layer: if a delegated administrator could call this about itself, the
 * hole it closes would reopen one function call lower down. Every issuing
 * basis requires `context.system`; `representative-redelegation` is the single
 * non-privileged path, and it can only ever narrow a representation that
 * already exists.
 *
 * Deliberately not reachable from any governed action, request handler or HTTP
 * route — the same boundary `bootstrapPosition` sits behind, for the same
 * reason.
 */
export interface GrantRepresentativeAuthorityInput {
  readonly id?: string;
  readonly tenantId: string;

  /**
   * Omitted for a redelegation, where it is copied from the parent rather than
   * supplied. Copying rather than accepting is what makes holder laundering
   * unrepresentable instead of merely refused — there is no field on a
   * redelegation into which a different holder could be written.
   */
  readonly holderRef?: string;
  readonly representativeRef: string;

  /** Omitted for a redelegation, and copied from the parent for the same reason `holderRef` is. */
  readonly resource?: GovernedAuthorityResourceRef;

  readonly governedRights: readonly GovernedRightType[];
  readonly scopeLimit: GovernedRepresentativeScopeLimit;
  readonly actions: readonly string[];

  readonly effectiveFrom: string;
  readonly expiresAt?: string;

  readonly canRedelegate?: boolean;

  readonly basis: GovernedRepresentativeBasis;

  readonly correlationId?: string;
  /**
   * Makes creation replay-safe. Two grants submitted under the same key return
   * the same binding rather than a second one, and a key reused with
   * materially different terms is refused rather than silently reinterpreted.
   */
  readonly idempotencyKey?: string;
}

/** What a grant produced, and whether it produced it now. `replayed` lets a caller distinguish "created" from "already created" without comparing fields. */
export interface GrantRepresentativeAuthorityOutcome {
  readonly representation: GovernedRepresentativeAuthority;
  readonly replayed: boolean;
}

/**
 * The narrow view of an Authority Graph `DelegationGrant` this module needs in
 * order to corroborate an `authority-graph-delegation` basis, and nothing
 * more.
 *
 * A structural port rather than an import, exactly as
 * `GovernedAuthorityProviderPort` is one for the Kernel: `src/enterprise/`
 * does not depend on `src/features/authority-graph/`, and a composition root
 * adapts the runtime to this shape. Four fields, because four are what the
 * corroboration actually reads.
 */
export interface GovernedRepresentationDelegationRecord {
  readonly delegateActorId: string;
  readonly principalActorId: string;
  readonly trustDomainId: string;
  /** Only `'active'` corroborates. Suspended, expired and revoked all withdraw the basis. */
  readonly status: string;
}

/**
 * How this module reads Authority Graph delegations, when a deployment grounds
 * representations in them.
 *
 * Optional by design. A deployment that never uses the
 * `authority-graph-delegation` basis needs no lookup, and one that uses the
 * basis without configuring a lookup is refused rather than trusted — a basis
 * nothing can corroborate is not evidence.
 *
 * Consulted twice, and the second time is the important one: at creation, to
 * refuse a basis that does not corroborate, and again at **every evaluation**,
 * so revoking the underlying delegation disables the representation without
 * any row in this store being rewritten. That is what keeps grant lifecycle in
 * one place instead of duplicated here.
 */
export interface GovernedRepresentationDelegationPort {
  getDelegationGrant(delegationGrantId: string): GovernedRepresentationDelegationRecord | undefined | Promise<GovernedRepresentationDelegationRecord | undefined>;
}

export interface GovernedRepresentationStoreHealth {
  readonly providerKind: 'memory' | 'sqlite';
  readonly available: boolean;
  readonly schemaVersion: string;
  readonly representationCount: number;
}

export type { AuthorityGovernanceContext, GovernedAuthorityResourceRef };
