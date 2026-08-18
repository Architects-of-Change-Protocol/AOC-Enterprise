import {
  governedRepresentativeAuthorityState,
  type GovernedRepresentationCoverage,
  type GovernedRepresentationProviderPort,
  type GovernedRepresentationQuery,
  type GovernedRepresentativeAuthority,
} from '@aoc-enterprise/governed-authority';
import { governedRightsScopeWithin, serializeGovernedRightsScope } from '@aoc-enterprise/governed-authorization';

import type { AuthorityGovernanceContext } from './contracts.js';
import { delegationCorroborates } from './representation-lifecycle.js';
import type { GovernedRepresentationDelegationPort } from './representation-contracts.js';
import type { GovernedRepresentationStore } from './representation-store.js';

/** How deep a redelegation chain may be walked before the resolver refuses it. Mirrors `AuthorityResolver`'s own ancestry guard: a cycle that survived creation validation must not become an unbounded loop in the enforcement path. */
const MAX_REPRESENTATION_CHAIN_HOPS = 16;

export interface CreateGovernedRepresentationResolverOptions {
  /** Required only when representations grounded in `authority-graph-delegation` are in use. Absent, such a representation resolves to `basis_withdrawn` rather than being trusted — fail closed, not fail quiet. */
  readonly delegations?: GovernedRepresentationDelegationPort;
  /** The tenancy context reads run under. Defaults to a system context for the same reason the authority resolver's does: it reads on the Kernel's behalf, and the query already carries the tenant, which is the boundary that matters. */
  readonly context?: AuthorityGovernanceContext;
}

/**
 * Turns durable representation state into the single coverage verdict the
 * Kernel consumes for the question "may this requester exercise that holder's
 * authority?".
 *
 * Deliberately thin, and deliberately the *only* place that question is
 * answered. It decides nothing about capabilities, policy, approvals,
 * obligations or evidence, and it cannot allow anything — `AocKernel` asks it
 * one question, gets one fact back, and remains the only component in AOC
 * Enterprise that produces a decision.
 *
 * ## Ordering of the checks, and why it is what it is
 *
 * The resolver looks for a binding keyed on *(representative, holder,
 * resource)* first, and only then asks about rights, actions, ceiling and
 * time. That order is the security property rather than an optimization: the
 * holder is part of the lookup key, so a binding naming a different holder is
 * never a candidate to be narrowed down from. There is no code path in which a
 * binding for Alice is retrieved and then checked against Bob — the query for
 * Bob simply finds nothing.
 *
 * ## Several bindings, and which one wins
 *
 * A representative may legitimately hold more than one binding for the same
 * holder and resource — one for a right, another differently-scoped one for a
 * different right. The resolver returns the *best* outcome across them rather
 * than the first: a request is covered if any live binding covers it, and when
 * none does, the reported outcome is the nearest miss, ranked so the most
 * specific and most actionable cause survives. Reporting "no representation"
 * when a scope ceiling was actually one basis point short would send an
 * operator looking for the wrong thing.
 */
export function createGovernedRepresentationResolver(
  store: GovernedRepresentationStore,
  options: CreateGovernedRepresentationResolverOptions = {},
): GovernedRepresentationProviderPort {
  const context: AuthorityGovernanceContext = options.context ?? { system: true };
  const delegations = options.delegations;

  /**
   * Whether every link from this binding up to its root is live at `at`.
   *
   * Walked at evaluation rather than copied into the child at creation, which
   * is what makes revoking an ancestor immediately disable its whole subtree
   * without rewriting a single descendant row — and what keeps `DelegationGrant`
   * lifecycle owned by the Authority Graph instead of duplicated here.
   */
  async function basisStillHolds(
    representation: GovernedRepresentativeAuthority,
    tenantId: string,
    at: string,
  ): Promise<{ readonly ok: true; readonly chain: readonly string[] } | { readonly ok: false; readonly reason: 'parent_revoked' | 'delegation_not_live' }> {
    const chain: string[] = [representation.id];
    let current = representation;

    for (let hop = 0; hop < MAX_REPRESENTATION_CHAIN_HOPS; hop += 1) {
      if (current.basis.kind === 'authority-graph-delegation') {
        if (delegations === undefined) return { ok: false, reason: 'delegation_not_live' };
        const record = await delegations.getDelegationGrant(current.basis.delegationGrantId);
        if (!delegationCorroborates(record, {
          representativeRef: current.representativeRef,
          holderRef: current.holderRef,
          trustDomainId: current.basis.trustDomainId,
        })) {
          return { ok: false, reason: 'delegation_not_live' };
        }
      }

      if (current.parentRepresentativeAuthorityId === undefined) return { ok: true, chain };

      const parent = await store.getRepresentativeAuthority(context, tenantId, current.parentRepresentativeAuthorityId);
      // A missing parent is treated exactly as a revoked one. A dangling
      // ancestor is not a reason to trust a descendant.
      if (parent === null || governedRepresentativeAuthorityState(parent, at) !== 'active' || !parent.canRedelegate) {
        return { ok: false, reason: 'parent_revoked' };
      }
      chain.push(parent.id);
      current = parent;
    }
    return { ok: false, reason: 'parent_revoked' };
  }

  /** How near a miss is to being a pass. Higher survives, so a denial reports the most specific cause rather than whichever binding happened to be listed first. */
  function rank(coverage: GovernedRepresentationCoverage): number {
    switch (coverage.outcome) {
      case 'not_required':
      case 'represented':
        return 100;
      case 'scope_exceeded':
      case 'incompatible_scope':
        return 60;
      case 'basis_withdrawn':
        return 50;
      case 'revoked':
        return 45;
      case 'expired':
        return 40;
      case 'action_not_represented':
        return 30;
      case 'right_not_represented':
        return 20;
      case 'no_representation':
        return 0;
    }
  }

  return {
    async resolveGovernedRepresentation(query: GovernedRepresentationQuery): Promise<GovernedRepresentationCoverage> {
      // The direct-holder path. A party exercising its own authority is not
      // representing anyone, and requiring it to hold a binding to itself would
      // make the ordinary case harder than the delegated one — and would mean
      // every deployment had to issue every holder a self-delegation before
      // anything worked.
      if (query.representativeRef === query.holderRef) return { outcome: 'not_required' };

      const resource = { kind: query.resourceKind, id: query.resourceId };
      const candidates = await store.listRepresentativeAuthorities(context, query.tenantId, query.representativeRef, query.holderRef, resource);
      if (candidates.length === 0) return { outcome: 'no_representation' };

      let best: GovernedRepresentationCoverage = { outcome: 'no_representation' };
      const keep = (coverage: GovernedRepresentationCoverage): void => {
        if (rank(coverage) > rank(best)) best = coverage;
      };

      for (const candidate of candidates) {
        const id = candidate.id;

        if (!candidate.governedRights.includes(query.governedRight)) {
          keep({ outcome: 'right_not_represented', representativeAuthorityId: id, governedRight: query.governedRight });
          continue;
        }
        if (!candidate.actions.includes(query.action)) {
          keep({ outcome: 'action_not_represented', representativeAuthorityId: id, action: query.action });
          continue;
        }

        const state = governedRepresentativeAuthorityState(candidate, query.at);
        if (state === 'revoked') {
          keep({ outcome: 'revoked', representativeAuthorityId: id });
          continue;
        }
        if (state !== 'active') {
          keep({ outcome: 'expired', representativeAuthorityId: id });
          continue;
        }

        if (query.requestedScope !== undefined && candidate.scopeLimit.kind === 'bounded') {
          const requested = serializeGovernedRightsScope(query.requestedScope);
          const permitted = serializeGovernedRightsScope(candidate.scopeLimit.maximum);
          if (
            requested.kind !== permitted.kind ||
            (requested.kind === 'unitized' && permitted.kind === 'unitized' && requested.unitDenomination !== permitted.unitDenomination)
          ) {
            // Never coerced, exactly as the authority resolver never coerces:
            // a proportional ceiling and a unit count describe different
            // quantities and AOC holds no conversion between them.
            keep({ outcome: 'incompatible_scope', representativeAuthorityId: id, permitted, requested });
            continue;
          }
          if (!governedRightsScopeWithin(requested, permitted)) {
            keep({ outcome: 'scope_exceeded', representativeAuthorityId: id, permitted, requested });
            continue;
          }
        }
        // An absent `requestedScope` is *not* read as the whole here either.
        // `LICENSE`'s unquantified permission is not a quantity, so a bounded
        // ceiling neither covers it by arithmetic nor blocks it: a live
        // representation over the right covers it, and the holder's own
        // position remains the thing that must exist. Manufacturing a
        // fractional scope to compare against would invent a claim the action
        // never made.

        const basis = await basisStillHolds(candidate, query.tenantId, query.at);
        if (!basis.ok) {
          keep({ outcome: 'basis_withdrawn', representativeAuthorityId: id, reason: basis.reason });
          continue;
        }

        keep({ outcome: 'represented', representativeAuthorityId: id, chain: basis.chain });
      }

      return best;
    },
  };
}
