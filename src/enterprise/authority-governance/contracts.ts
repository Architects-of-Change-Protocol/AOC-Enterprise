import type { GovernedAuthorityBasis, GovernedAuthorityPosition, GovernedAuthorityTransition } from '@aoc-enterprise/governed-authority';
import type { GovernedRightType, GovernedRightsScope } from '@aoc-enterprise/governed-authorization';

/**
 * Tenant scope for every Governed Authority Store call. Identical in shape to
 * `TransferGovernanceContext`, `LicenseGovernanceContext` and
 * `GovernanceStoreAccessContext`, on purpose: a caller that already holds one
 * of those holds this one, and the tenancy rule a reviewer has already learned
 * once applies here unchanged.
 *
 * `system: true` is the privileged administrative context. It is the only
 * context that may create authority (`bootstrapPosition`), and it is never
 * reachable from a governed action, a request handler or an HTTP route.
 */
export interface AuthorityGovernanceContext {
  readonly system: boolean;
  readonly organizationId?: string;
  readonly actorId?: string;
}

/** A governed resource, flattened to the same `kind`/`id` pair every action module already persists as `assetKind`/`assetId`. */
export interface GovernedAuthorityResourceRef {
  readonly kind: string;
  readonly id: string;
}

/**
 * Creating initial authority. The privileged path, and the only issuance in
 * the model: it credits a position without debiting one, so it is what makes a
 * deployment's opening balances exist and what a migration uses.
 *
 * Requires `context.system`. This is deliberately not a user-facing surface,
 * and deliberately not something a party can call about itself — "I hold 100%"
 * must never be a request that grants authority. See `../../..` documentation
 * `docs/enterprise/AOC_GOVERNED_AUTHORITY.md`, "No self-issued authority".
 */
export interface BootstrapGovernedAuthorityInput {
  readonly transitionId?: string;
  readonly positionId?: string;
  readonly tenantId: string;
  readonly holderRef: string;
  readonly resource: GovernedAuthorityResourceRef;
  readonly governedRight: GovernedRightType;
  readonly scope: GovernedRightsScope;
  /** Must be `administrative-bootstrap` or `recognized-external-evidence`; a `governed-execution` basis is rejected, because a movement is not an issuance. */
  readonly basis: GovernedAuthorityBasis;
  readonly effectiveFrom: string;
  readonly expiresAt?: string;
  readonly occurredAt?: string;
  readonly correlationId?: string;
}

/**
 * Moving authority that already exists, on the strength of accepted evidence
 * that a governed external effect happened.
 *
 * One call, one commit section, however many rights it names: an execution
 * that moved the economic interest and the ownership interest together either
 * moves both or moves neither. The scope applies to each named right
 * independently — that is what the action terms mean by
 * `rights: [...]` alongside a single `scope`.
 *
 * `basis.executionRef` is the idempotency key. Replaying an execution AOC has
 * already applied returns the original transitions and performs no second
 * debit and no second credit.
 */
export interface ApplyGovernedAuthorityTransitionInput {
  readonly transitionIdPrefix?: string;
  readonly tenantId: string;
  readonly resource: GovernedAuthorityResourceRef;
  readonly governedRights: readonly GovernedRightType[];
  readonly scope: GovernedRightsScope;
  readonly fromHolderRef: string;
  readonly toHolderRef: string;
  readonly basis: Extract<GovernedAuthorityBasis, { kind: 'governed-execution' }>;
  readonly occurredAt: string;
  readonly correlationId?: string;
}

/** What an apply produced, and whether it produced it now or had already produced it. `replayed` is the signal a caller uses to distinguish "moved" from "already moved" without comparing balances. */
export interface ApplyGovernedAuthorityTransitionOutcome {
  readonly transitions: readonly GovernedAuthorityTransition[];
  readonly replayed: boolean;
}

/** A position plus the ordered transitions that produced it — the answer to "why does this actor have this authority?" without a second audit log. */
export interface GovernedAuthorityProvenance {
  readonly position: GovernedAuthorityPosition;
  readonly transitions: readonly GovernedAuthorityTransition[];
}

export interface GovernedAuthorityStoreHealth {
  readonly providerKind: 'memory' | 'sqlite';
  readonly available: boolean;
  readonly schemaVersion: string;
  readonly positionCount: number;
  readonly transitionCount: number;
}
