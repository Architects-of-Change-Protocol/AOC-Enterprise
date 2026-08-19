import {
  toGovernedConstraintPolicyContext,
  UNRESOLVED_GOVERNED_CONSTRAINT_POLICY_CONTEXT,
  type GovernedConstraintApplicability,
  type GovernedConstraintPolicyContext,
  type GovernedConstraintProviderPort,
  type GovernedConstraintQuery,
} from '@aoc-enterprise/governed-authority';

import type { GovernedAuthorityStore } from './authority-store.js';
import { resolveGovernedConstraintApplicability } from './constraint-applicability.js';
import type { AuthorityGovernanceContext } from './contracts.js';

export interface CreateGovernedConstraintResolverOptions {
  /** The context the resolver reads under. Defaults to a system context, exactly as the coverage and representation resolvers do: this is Enterprise reading its own governance state to explain a decision, never a caller reaching across a tenant. */
  readonly context?: AuthorityGovernanceContext;
}

/**
 * Adapts the Governed Authority Store onto the Kernel's optional constraint
 * policy-context port.
 *
 * The counterpart of `createGovernedAuthorityResolver` and
 * `createGovernedRepresentationResolver`, and it does one thing: turn the
 * constraints standing over the authority a request engages into the bounded,
 * typed summary deployment policy may consult. It returns *facts*. It produces
 * no verdict, cannot deny anything, and is never the gate — the hard capacity
 * and structural invariants are decided afterwards, inside the store's own
 * consistency boundary, against the state committed there.
 *
 * ## Why a store that cannot be read reports `resolved: false`
 *
 * An unreadable store is emphatically not a holder with no constraints, and the
 * distinction has to survive into the policy input or a deployment's rule would
 * silently pass whenever the store was down. `resolved` is what a policy tests
 * before drawing any conclusion from an empty `constraints` list, and it is
 * false for both of the honest reasons: nothing was consulted, and consulting
 * failed.
 *
 * This is deliberately **not** fail-closed in the way the coverage resolver is.
 * The coverage resolver's answer decides whether a request proceeds, so an
 * unreadable store must deny. This one's answer decides only what policy is
 * told, and denying a request because an *explanation* could not be assembled
 * would deny requests that the authority layer — which is read separately, in
 * its own transaction, and which does fail closed — would have allowed. The
 * conservation guarantees do not depend on this port being reachable, and a
 * deployment whose policy needs constraint facts to be trustworthy tests
 * `resolved` rather than trusting an empty list.
 */
export function createGovernedConstraintResolver(
  store: GovernedAuthorityStore,
  options: CreateGovernedConstraintResolverOptions = {},
): GovernedConstraintProviderPort {
  const context: AuthorityGovernanceContext = options.context ?? { system: true };

  return {
    async resolveGovernedConstraints(query: GovernedConstraintQuery): Promise<GovernedConstraintPolicyContext> {
      if (query.governedRights.length === 0) return UNRESOLVED_GOVERNED_CONSTRAINT_POLICY_CONTEXT;

      const resource = { kind: query.resourceKind, id: query.resourceId };
      const results: GovernedConstraintApplicability[] = [];

      try {
        for (const governedRight of query.governedRights) {
          const constraints = await store.listActiveEncumbrances(context, {
            tenantId: query.tenantId,
            holderRef: query.holderRef,
            resource,
            governedRight,
            at: query.at,
          });
          results.push(
            resolveGovernedConstraintApplicability({
              action: query.action,
              tenantId: query.tenantId,
              holderRef: query.holderRef,
              resource,
              governedRight,
              constraints,
              at: query.at,
            }),
          );
        }
      } catch {
        // Includes the action with no declared profile: an action this
        // deployment has not classified gets no constraint facts rather than a
        // fabricated empty set, and `resolved: false` is how a policy sees that.
        return UNRESOLVED_GOVERNED_CONSTRAINT_POLICY_CONTEXT;
      }

      return toGovernedConstraintPolicyContext(results);
    },
  };
}
