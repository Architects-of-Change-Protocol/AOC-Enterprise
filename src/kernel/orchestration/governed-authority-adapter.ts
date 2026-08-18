import { isGovernedAuthorityCovered, type GovernedAuthorityCoverage } from '@aoc-enterprise/governed-authority';

import type { GovernedAuthorityProvider } from '../contracts/ports.js';
import type { KernelEvaluationRequest } from '../contracts/kernel-request.js';
import type { GovernedAuthorityEvaluation, GovernedRightEvaluation, KernelEvaluationResult } from '../contracts/kernel-result.js';
import { AOC_KERNEL_REASON_CODES, type AocKernelReasonCode } from '../reason-codes/reason-codes.js';

/**
 * The right-scoped authority step, kept out of `AocKernel` itself so the class
 * stays a composition boundary rather than growing a second evaluation body.
 *
 * ## Why this narrows and never widens
 *
 * The step runs only against an outcome the existing chain already found
 * viable, and it can only ever turn that outcome into a denial. It cannot
 * rescue a denial, cannot upgrade an `approval_required` to `allowed`, and
 * cannot produce an `allowed` that the recognition/authority/policy/approval
 * chain did not already produce.
 *
 * That is exactly the discipline Recognition Runtime already applies when it
 * consults the Authority Graph (see `src/features/authority-graph/README.md`,
 * "How Recognition Runtime integrates with Authority Graph"): the check *only
 * ever overrides an already-viable outcome*. Following it here means a rogue,
 * unrecognized, revoked or out-of-scope actor is still stopped by the existing
 * chain long before governed authority is consulted, and adding this layer
 * cannot make any request succeed that would have failed without it.
 *
 * ## Why an `approval_required` outcome is checked too
 *
 * An outstanding approval is not authorization, but it is also not a denial,
 * and a request that would be denied for lack of governed authority should not
 * be left sitting in an approval queue that could never legitimately clear.
 * Checking it fails closed at the earliest honest point.
 */

/** Maps a coverage outcome onto the kernel's stable reason code, or `null` when the outcome is not a denial. */
function toReasonCode(coverage: GovernedAuthorityCoverage): AocKernelReasonCode | null {
  switch (coverage.outcome) {
    case 'covered':
    case 'resource_not_enrolled':
      return null;
    case 'no_right_authority':
      return AOC_KERNEL_REASON_CODES.AUTHORITY_GOVERNED_RIGHT_MISSING;
    case 'insufficient_scope':
    case 'incompatible_scope':
      return AOC_KERNEL_REASON_CODES.AUTHORITY_GOVERNED_SCOPE_EXCEEDED;
    case 'expired':
      return AOC_KERNEL_REASON_CODES.AUTHORITY_GOVERNED_AUTHORITY_EXPIRED;
  }
}

/** The outcomes this step may narrow: the ones the existing chain has not already stopped. Anything else is left exactly as it was. */
const VIABLE_STATUSES: ReadonlySet<KernelEvaluationResult['status']> = new Set(['allowed', 'approval_required']);

/**
 * What the coverage check found, before it has been folded into any decision.
 *
 * Separated from the folding so both kernel entry points can use it.
 * `evaluate()` folds it into an already-computed result; `enforce()` must
 * consult it *before* the executor runs, because a side effect that has
 * already happened cannot be denied afterwards — and re-running a full
 * evaluation there would consume the request's idempotency key, causing the
 * real enforcement to come back `duplicate_suppressed`.
 */
export interface GovernedAuthorityFacts {
  readonly governedAuthority: GovernedAuthorityEvaluation;
  /** Empty when governed authority does not stand in the way. Non-empty codes are the denial. */
  readonly reasonCodes: readonly AocKernelReasonCode[];
  readonly summary: string;
}

/** The no-op facts for a request that declares no governed right, or a kernel with no provider: performed nothing, found nothing, blocks nothing. */
const NOT_PERFORMED: GovernedAuthorityFacts = {
  governedAuthority: { performed: false, enforced: false, rights: [] },
  reasonCodes: [],
  summary: '',
};

/**
 * Resolves every governed right a request declares against the configured
 * provider.
 *
 * Fails closed on every axis. A request that declares a governed right but
 * carries no `organization.id` is denied rather than skipped: the tenant is
 * what scopes authority state, and a check that silently did not run would be
 * indistinguishable from one that passed. A provider that throws is denied for
 * the same reason — an authority store that cannot be read is emphatically not
 * a holder who turned out to control everything.
 */
export async function resolveGovernedAuthorityFacts(
  provider: GovernedAuthorityProvider,
  request: KernelEvaluationRequest,
  at: string,
): Promise<GovernedAuthorityFacts> {
  const governedRights = request.action.governedRights ?? [];
  if (governedRights.length === 0) return NOT_PERFORMED;

  const holderRef = request.action.governedAuthorityHolderRef ?? request.actor.id;
  const tenantId = request.organization?.id;

  if (tenantId === undefined || tenantId.length === 0) {
    return blocked(governedRights, holderRef, 'tenant_unknown', 'This request engages governed rights but names no organization, so no governed authority state can be scoped to it.');
  }

  const resourceKind = request.target?.type ?? request.action.type;
  const resourceId = request.target?.id;
  if (resourceId === undefined || resourceId.length === 0) {
    return blocked(governedRights, holderRef, 'resource_unknown', 'This request engages governed rights but identifies no target resource to hold authority over.');
  }

  const rights: GovernedRightEvaluation[] = [];
  const reasonCodes: AocKernelReasonCode[] = [];
  let enforced = false;

  for (const governedRight of governedRights) {
    let coverage: GovernedAuthorityCoverage;
    try {
      coverage = await provider.resolveGovernedAuthority({
        tenantId,
        holderRef,
        resourceKind,
        resourceId,
        governedRight,
        ...(request.action.governedRightsScope !== undefined ? { requestedScope: request.action.governedRightsScope } : {}),
        at,
      });
    } catch {
      // Deliberately not surfaced as `indeterminate`: an unreadable authority
      // store is a reason not to proceed, and reporting it as an inconclusive
      // evaluation would invite a retry loop against a store that may be
      // exactly as unreadable next time.
      coverage = { outcome: 'no_right_authority', governedRight };
    }

    if (coverage.outcome !== 'resource_not_enrolled') enforced = true;
    // `covered` reports whether authority was actually *verified*, not whether
    // the request was let through. A `resource_not_enrolled` outcome is
    // reported as `covered: false` with `enforced: false`, because claiming
    // coverage for a resource this deployment holds no authority state about
    // would be asserting a check that never happened. What let the request
    // through in that case is the compatibility policy, which `enforced` is
    // how a reader sees.
    rights.push({ governedRight, holderRef, outcome: coverage.outcome, covered: isGovernedAuthorityCovered(coverage) });

    const reasonCode = toReasonCode(coverage);
    if (reasonCode !== null && !reasonCodes.includes(reasonCode)) reasonCodes.push(reasonCode);
  }

  const failing = rights.filter((right) => !right.covered && right.outcome !== 'resource_not_enrolled').map((right) => `${right.governedRight} (${right.outcome})`);
  return {
    governedAuthority: { performed: true, enforced, rights },
    reasonCodes,
    summary:
      reasonCodes.length === 0
        ? ''
        : `'${holderRef}' does not hold the governed authority this action engages over '${resourceKind}:${resourceId}': ${failing.join(', ')}.`,
  };
}

/** A structural refusal: the request declares governed rights but does not carry enough identity for the question to even be asked. Reported per right so the shape of the result is the same either way. */
function blocked(
  governedRights: readonly GovernedRightEvaluation['governedRight'][],
  holderRef: string,
  outcome: string,
  summary: string,
): GovernedAuthorityFacts {
  return {
    governedAuthority: { performed: true, enforced: true, rights: governedRights.map((governedRight) => ({ governedRight, holderRef, outcome, covered: false })) },
    reasonCodes: [AOC_KERNEL_REASON_CODES.AUTHORITY_GOVERNED_RIGHT_MISSING],
    summary,
  };
}

/**
 * Folds resolved facts into an evaluated result, narrowing a viable outcome
 * into a denial when governed authority does not cover the action.
 *
 * An outcome that was already denied is left exactly as it was, facts and all:
 * a denial has one reason and re-labelling it with a second would misreport
 * why the request actually stopped.
 */
export async function applyGovernedAuthorityStep(
  provider: GovernedAuthorityProvider,
  request: KernelEvaluationRequest,
  result: KernelEvaluationResult,
): Promise<KernelEvaluationResult> {
  if ((request.action.governedRights ?? []).length === 0) return result;
  if (!VIABLE_STATUSES.has(result.status)) return result;

  const facts = await resolveGovernedAuthorityFacts(provider, request, result.evaluatedAt);
  if (facts.reasonCodes.length === 0) {
    // Viable and covered: the original outcome stands untouched, annotated
    // with what was checked. An allowed decision is not re-derived here.
    return { ...result, authority: { ...result.authority, governedAuthority: facts.governedAuthority } };
  }
  return denied(result, facts.reasonCodes, facts.governedAuthority, facts.summary);
}

/**
 * Rewrites a viable outcome as a denial, preserving everything the original
 * evaluation established.
 *
 * The trace, policy results, recognition verdict, approval state and evidence
 * are all kept exactly as the wrapped engine produced them, and the original
 * reason codes are kept after the new ones — a reviewer must still be able to
 * see that recognition passed and the capability chain resolved, because
 * "denied for lack of governed authority" and "denied because the actor was
 * never recognized" are different facts and one must not erase the other.
 */
function denied(
  result: KernelEvaluationResult,
  reasonCodes: readonly AocKernelReasonCode[],
  governedAuthority: GovernedAuthorityEvaluation,
  summary: string,
): KernelEvaluationResult {
  const merged = [...reasonCodes, ...result.reasonCodes.filter((code) => !reasonCodes.includes(code as AocKernelReasonCode))];
  return {
    ...result,
    status: 'denied',
    reasonCodes: merged,
    summary,
    authority: { ...result.authority, governedAuthority },
  };
}
