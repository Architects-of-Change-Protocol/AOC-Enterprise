import type { GovernedConstraintPolicyContext } from '@aoc-enterprise/governed-authority';

import type { GovernedConstraintProvider } from '../contracts/ports.js';
import type { KernelEvaluationRequest } from '../contracts/kernel-request.js';

/**
 * Resolves the persistent-constraint facts a request's policy evaluation may
 * consult, or `undefined` when there are none to resolve.
 *
 * Kept out of `AocKernel` itself so the class stays a composition boundary, and
 * kept separate from `governed-authority-adapter.ts` because the two do
 * opposite things. That adapter produces a *verdict* and can turn an outcome
 * into a denial. This one produces *facts* and can turn nothing into anything:
 * its entire effect is that a typed summary reaches the optional Domain Policy
 * Pack preflight, where the deployment's own rules — never Soberanía's — decide what
 * to do with it.
 *
 * ## What `undefined` means, and why it is not `resolved: false`
 *
 * `undefined` means no constraint context belongs in this request's policy
 * input at all: no provider is configured, or the request engages no governed
 * right and no holder, so there is nothing a constraint could stand over. The
 * policy input is then built exactly as it was before this layer existed, and a
 * deployment that never adopted constraints sees no change whatsoever.
 *
 * `resolved: false` is the *different* fact that a provider was consulted and
 * could not answer. That reaches policy, because "the store could not be read"
 * and "the holder has no constraints" must never be the same input to a rule.
 *
 * ## Why a failure here does not deny
 *
 * Nothing that depends on this is a gate. The hard invariants — capacity
 * conservation for a class an action consumes, and the structural rule that a
 * holder's remaining authority must still cover the constraints attached to her
 * — are enforced afterwards, inside the Governed Authority Store's own
 * transaction, against the state committed there. Denying because an
 * *explanation* could not be assembled would refuse requests the authority layer
 * would have allowed, while protecting nothing it does not already protect.
 */
export async function resolveGovernedConstraintContext(
  provider: GovernedConstraintProvider | undefined,
  request: KernelEvaluationRequest,
  at: string,
): Promise<GovernedConstraintPolicyContext | undefined> {
  if (provider === undefined) return undefined;

  const governedRights = request.action.governedRights ?? [];
  if (governedRights.length === 0) return undefined;

  const tenantId = request.organization?.id;
  const resourceId = request.target?.id;
  if (tenantId === undefined || tenantId.length === 0) return undefined;
  if (resourceId === undefined || resourceId.length === 0) return undefined;

  // The holder whose authority the action draws on — never the requester,
  // unless they happen to be the same party. Constraints are holder-bound, and
  // resolving them against a representative or a delegated agent would show a
  // policy the wrong pool entirely.
  const holderRef = request.action.governedAuthorityHolderRef ?? request.actor.id;

  return provider.resolveGovernedConstraints({
    tenantId,
    holderRef,
    resourceKind: request.target?.type ?? request.action.type,
    resourceId,
    governedRights,
    action: request.action.capability ?? request.action.type,
    at,
  });
}
