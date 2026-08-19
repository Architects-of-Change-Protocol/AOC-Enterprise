import {
  governedAuthorityPositionState,
  isZeroGovernedRightsScope,
  type GovernedAuthorityCoverage,
  type GovernedAuthorityProviderPort,
  type GovernedAuthorityQuery,
} from '@aoc-enterprise/governed-authority';
import { governedRightsScopeWithin, serializeGovernedRightsScope } from '@aoc-enterprise/governed-authorization';

import type { AuthorityGovernanceContext } from './contracts.js';
import type { GovernedAuthorityStore } from './authority-store.js';

/**
 * What a deployment does about a resource it holds no governed authority state
 * for.
 *
 * ```
 * 'defer'  the resource is not enrolled; right-scoped enforcement does not
 *          apply and the existing capability/action/resource-scope authority
 *          chain decides alone, exactly as it did before this layer existed.
 *
 * 'deny'   nothing may engage a governed right of a resource this deployment
 *          has not enrolled.
 * ```
 *
 * `'defer'` is the default, and choosing it was the single most consequential
 * compatibility decision in this foundation. The alternative — enforce
 * right-scoped authority everywhere, immediately — would deny every request in
 * every existing deployment on the day it shipped, because no deployment has
 * any positions yet and `AuthorityGrant` has never carried a governed-right
 * field to migrate from.
 *
 * What makes `'defer'` safe rather than merely convenient is that it is
 * **per-resource and one-way**. Enrolment is not a flag an operator can forget
 * to turn on for a resource they have already started recording positions for:
 * the moment a resource has any position at all, every governed right of that
 * resource is enforced strictly, including the rights nobody was bootstrapped
 * into. An actor holding `usage-right` on an enrolled asset therefore cannot
 * reach its `ownership-interest` — the resource is enrolled, the actor has no
 * position for that right, and `no_right_authority` denies it. Partial
 * enrolment of a resource fails closed, which is the direction that matters.
 *
 * `'deny'` is offered for deployments that have finished migrating and want no
 * unenrolled resource to be reachable at all. It is a deliberate operational
 * choice, not a default, because turning it on in a half-migrated deployment
 * stops that deployment.
 */
export type UnenrolledResourcePolicy = 'defer' | 'deny';

export interface CreateGovernedAuthorityResolverOptions {
  /** Defaults to `'defer'`. See `UnenrolledResourcePolicy`. */
  readonly unenrolledResourcePolicy?: UnenrolledResourcePolicy;
  /**
   * The tenancy context reads are performed under. Defaults to a system
   * context, because the resolver is an internal enforcement component reading
   * on behalf of the Kernel rather than on behalf of a caller — and the query
   * already carries the tenant whose authority is being asked about, which is
   * the boundary that matters. A deployment may narrow it.
   */
  readonly context?: AuthorityGovernanceContext;
}

/**
 * Turns durable governed authority state into the single coverage verdict the
 * Kernel consumes.
 *
 * This is deliberately thin, and deliberately the *only* place the enforcement
 * question is answered. It is not a second authorization engine: it decides
 * nothing about actors, capabilities, delegation, approvals, obligations,
 * policy or evidence, and it cannot allow anything — `AocKernel` asks it one
 * question, gets one fact back, and remains the only component in Soberanía
 * Enterprise that produces a decision.
 *
 * Store details never cross this boundary. The port returns a
 * `GovernedAuthorityCoverage` from `@aoc-enterprise/governed-authority`, a
 * pure-data package, so the Kernel's contracts never learn that positions,
 * transitions, digests, tenancy guards or SQLite exist.
 */
export function createGovernedAuthorityResolver(
  store: GovernedAuthorityStore,
  options: CreateGovernedAuthorityResolverOptions = {},
): GovernedAuthorityProviderPort {
  const unenrolledResourcePolicy = options.unenrolledResourcePolicy ?? 'defer';
  const context: AuthorityGovernanceContext = options.context ?? { system: true };

  return {
    async resolveGovernedAuthority(query: GovernedAuthorityQuery): Promise<GovernedAuthorityCoverage> {
      const resource = { kind: query.resourceKind, id: query.resourceId };

      const position = await store.getPosition(context, query.tenantId, query.holderRef, resource, query.governedRight);

      if (position === null) {
        // Enrolment is only consulted when the holder has no position, so the
        // common enforced path costs one lookup. A resource with positions but
        // none for this holder-and-right is enrolled, and denies.
        const enrolled = await store.isResourceEnrolled(context, query.tenantId, resource);
        if (!enrolled) {
          return unenrolledResourcePolicy === 'deny'
            ? { outcome: 'no_right_authority', governedRight: query.governedRight }
            : { outcome: 'resource_not_enrolled' };
        }
        return { outcome: 'no_right_authority', governedRight: query.governedRight };
      }

      const state = governedAuthorityPositionState(position, query.at);
      if (state === 'expired' || state === 'pending') return { outcome: 'expired', positionId: position.id };
      // Nothing left is not authority, and it is not a scope shortfall either:
      // reporting it as `no_right_authority` says the true thing, which is that
      // this holder controls none of this right at this instant.
      if (state === 'exhausted') return { outcome: 'no_right_authority', governedRight: query.governedRight };

      if (query.requestedScope === undefined) {
        // The action does not fractionally express this right — `LICENSE`'s
        // optional `rightsScope` is the real case. A live, non-empty position
        // covers it. This asserts nothing about *how much*, and in particular
        // never reads the absent scope as the whole: a 1 bp position covers an
        // unquantified permission exactly as a 10 000 bp one does, because the
        // permission is not a quantity of the right.
        return { outcome: 'covered', positionId: position.id, available: serializeGovernedRightsScope(position.scope) };
      }

      const requested = serializeGovernedRightsScope(query.requestedScope);
      const available = serializeGovernedRightsScope(position.scope);

      if (requested.kind !== available.kind || (requested.kind === 'unitized' && available.kind === 'unitized' && requested.unitDenomination !== available.unitDenomination)) {
        // Never coerced. A proportional share and a unit count describe
        // different quantities, and two opaque denominations have no
        // conversion Soberanía could apply without inventing one.
        return { outcome: 'incompatible_scope', positionId: position.id, available, requested };
      }

      if (!governedRightsScopeWithin(requested, available)) {
        return { outcome: 'insufficient_scope', positionId: position.id, available, requested };
      }

      // A request for zero is refused rather than trivially covered: an action
      // engaging none of a right is not an action this layer should wave
      // through on the strength of a position it never actually draws on.
      if (isZeroGovernedRightsScope(requested)) {
        return { outcome: 'insufficient_scope', positionId: position.id, available, requested };
      }

      return { outcome: 'covered', positionId: position.id, available };
    },
  };
}
