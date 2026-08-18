import {
  isGovernedAuthorityCovered,
  isGovernedRepresentationCovered,
  type GovernedAuthorityCoverage,
  type GovernedRepresentationCoverage,
} from '@aoc-enterprise/governed-authority';
import type { GovernedRightType } from '@aoc-enterprise/governed-authorization';

import type { GovernedAuthorityProvider, GovernedRepresentationProvider } from '../contracts/ports.js';
import type { KernelEvaluationRequest } from '../contracts/kernel-request.js';
import type {
  GovernedAuthorityEvaluation,
  GovernedRepresentationEvaluation,
  GovernedRightEvaluation,
  GovernedRightRepresentationEvaluation,
  KernelEvaluationResult,
} from '../contracts/kernel-result.js';
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
 *
 * ## The two proofs, and why one step performs both
 *
 * A request where the requester is not the holder needs *two* independent
 * facts to be true, and this step resolves both:
 *
 * ```
 * underlying governed authority   does holder H control the right, and enough of it?
 * holder-bound representation     may requester R exercise H's authority at all?
 * ```
 *
 * Before the second existed, a delegated administrator with a bare
 * asset-scoped grant could name whichever holder happened to have enough, and
 * nothing in the path objected -- the two checks that ran were satisfiable
 * independently by two different parties. Requiring both, of the same request,
 * is what retires the inference "I may perform this action on this asset,
 * therefore I may choose the holder".
 *
 * They are resolved together here rather than in two steps because they share
 * everything the resolution needs -- tenant, resource, right list, instant --
 * and because a caller must not be able to run one without the other. They
 * remain two *ports* and two *reason-code families*, so a denial always says
 * which proof was missing.
 *
 * ## When representation is required
 *
 * Only when all three of these hold: a representation provider is configured,
 * the requester differs from the holder, and the governed-authority check
 * found the resource **enrolled**. That last condition is not a separate
 * policy -- it reuses the enrolment signal the authority check already
 * produces, so representation enforcement is exactly co-extensive with
 * right-scoped authority enforcement. A resource this deployment holds no
 * authority state for behaves precisely as it did before either layer existed;
 * a resource it does hold state for fails closed on both.
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

/**
 * Maps a representation outcome onto the kernel's stable reason code, or
 * `null` when the outcome is not a denial.
 *
 * Six distinct outcomes collapse onto `AUTHORITY_REPRESENTATION_MISSING`, and
 * that is deliberate rather than lossy: "no binding at all", "a binding for
 * the wrong right" and "a binding for the wrong action" are the same
 * instruction to an integrator -- obtain a representation that covers this --
 * while the outcome itself is preserved verbatim in the evaluation facts for
 * whoever needs to know which. `basis_withdrawn` maps to `EXPIRED` rather than
 * `MISSING` because the representation is intact and what lapsed is the thing
 * under it, which is a different remedy.
 */
function toRepresentationReasonCode(coverage: GovernedRepresentationCoverage): AocKernelReasonCode | null {
  switch (coverage.outcome) {
    case 'not_required':
    case 'represented':
      return null;
    case 'no_representation':
    case 'right_not_represented':
    case 'action_not_represented':
      return AOC_KERNEL_REASON_CODES.AUTHORITY_REPRESENTATION_MISSING;
    case 'scope_exceeded':
    case 'incompatible_scope':
      return AOC_KERNEL_REASON_CODES.AUTHORITY_REPRESENTATION_SCOPE_EXCEEDED;
    case 'expired':
    case 'revoked':
    case 'basis_withdrawn':
      return AOC_KERNEL_REASON_CODES.AUTHORITY_REPRESENTATION_EXPIRED;
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
  /** Present whenever a representation provider is configured and the request declares a governed right. Absent means the representation question was never asked. */
  readonly representation?: GovernedRepresentationEvaluation;
  /** Empty when neither proof stands in the way. Non-empty codes are the denial, representation first: when both are missing, the holder binding is the more specific and more actionable cause. */
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
 * providers — the holder's underlying authority, and, where the requester is
 * not the holder, the requester's representation of that holder.
 *
 * Fails closed on every axis. A request that declares a governed right but
 * carries no `organization.id` is denied rather than skipped: the tenant is
 * what scopes authority state, and a check that silently did not run would be
 * indistinguishable from one that passed. A provider that throws is denied for
 * the same reason — an authority store that cannot be read is emphatically not
 * a holder who turned out to control everything, and a representation store
 * that cannot be read is emphatically not a proof that the requester may spend
 * that holder's authority.
 */
export async function resolveGovernedAuthorityFacts(
  provider: GovernedAuthorityProvider,
  representationProvider: GovernedRepresentationProvider | undefined,
  request: KernelEvaluationRequest,
  at: string,
): Promise<GovernedAuthorityFacts> {
  const governedRights = request.action.governedRights ?? [];
  if (governedRights.length === 0) return NOT_PERFORMED;

  const representativeRef = request.actor.id;
  const holderRef = request.action.governedAuthorityHolderRef ?? representativeRef;
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

  const governedAuthority: GovernedAuthorityEvaluation = { performed: true, enforced, rights };
  const failing = rights.filter((right) => !right.covered && right.outcome !== 'resource_not_enrolled').map((right) => `${right.governedRight} (${right.outcome})`);
  const authoritySummary =
    reasonCodes.length === 0 ? '' : `'${holderRef}' does not hold the governed authority this action engages over '${resourceKind}:${resourceId}': ${failing.join(', ')}.`;

  const representation = await resolveRepresentation(representationProvider, {
    tenantId,
    representativeRef,
    holderRef,
    resourceKind,
    resourceId,
    governedRights,
    action: request.action.capability ?? request.action.type,
    at,
    enforced,
    ...(request.action.governedRightsScope !== undefined ? { requestedScope: request.action.governedRightsScope } : {}),
  });

  if (representation === undefined) {
    return { governedAuthority, reasonCodes, summary: authoritySummary };
  }

  const representationCodes = representation.reasonCodes;

  // Representation codes come first when both proofs failed. Both are true and
  // both are reported, but "you may not act for this holder at all" is what an
  // operator must fix first — and, unlike the authority shortfall, it is not
  // something the *holder* could resolve by acquiring more of the right.
  const merged = [...representationCodes, ...reasonCodes.filter((code) => !representationCodes.includes(code))];
  const representationFailing = representation.evaluation.rights.filter((right) => !right.covered).map((right) => `${right.governedRight} (${right.outcome})`);
  const representationSummary =
    representationCodes.length === 0
      ? ''
      : `'${representativeRef}' is not authorized to exercise '${holderRef}'\u2019s governed authority over '${resourceKind}:${resourceId}': ${representationFailing.join(', ')}.`;

  return {
    governedAuthority,
    representation: representation.evaluation,
    reasonCodes: merged,
    summary: [representationSummary, authoritySummary].filter((part) => part.length > 0).join(' '),
  };
}

/** A representation evaluation together with the reason codes it produced. Paired so the codes are derived once, where the typed coverage is still in hand, rather than re-derived from the stringly-typed outcome afterwards. */
interface ResolvedRepresentation {
  readonly evaluation: GovernedRepresentationEvaluation;
  readonly reasonCodes: readonly AocKernelReasonCode[];
}

/**
 * Asks the representation question, or explains why it was not asked.
 *
 * Returns `undefined` — meaning "not asked" — in exactly three situations, and
 * each of them is a deliberate compatibility boundary rather than an omission:
 * no provider is configured (this deployment has not adopted the layer, and
 * behaves as it did before it existed); the resource is not enrolled in
 * right-scoped authority (legacy behaviour is preserved per-resource, exactly
 * as the authority layer preserves it); or the requester *is* the holder, in
 * which case a `required: false` evaluation is reported rather than
 * `undefined`, because that question was genuinely considered and genuinely
 * needed no answer.
 */
async function resolveRepresentation(
  provider: GovernedRepresentationProvider | undefined,
  input: {
    readonly tenantId: string;
    readonly representativeRef: string;
    readonly holderRef: string;
    readonly resourceKind: string;
    readonly resourceId: string;
    readonly governedRights: readonly GovernedRightType[];
    readonly action: string;
    readonly at: string;
    readonly enforced: boolean;
    readonly requestedScope?: KernelEvaluationRequest['action']['governedRightsScope'];
  },
): Promise<ResolvedRepresentation | undefined> {
  if (provider === undefined) return undefined;

  const base = { performed: true, holderRef: input.holderRef, representativeRef: input.representativeRef } as const;

  if (input.representativeRef === input.holderRef) {
    // The direct-holder path. Reported rather than skipped, so a reviewer can
    // see that the question was asked and correctly needed no representation —
    // "not required" and "never checked" must not look the same.
    return {
      evaluation: {
        ...base,
        required: false,
        rights: input.governedRights.map((governedRight) => ({ governedRight, outcome: 'not_required', covered: true })),
      },
      reasonCodes: [],
    };
  }

  // Enrolment gates this exactly as it gates right-scoped authority. A
  // deployment that holds no authority state for the resource keeps its prior
  // behaviour; the moment it holds any, the holder identity becomes
  // security-sensitive and this fails closed.
  if (!input.enforced) return undefined;

  const rights: GovernedRightRepresentationEvaluation[] = [];
  const reasonCodes: AocKernelReasonCode[] = [];
  for (const governedRight of input.governedRights) {
    let coverage: GovernedRepresentationCoverage;
    try {
      coverage = await provider.resolveGovernedRepresentation({
        tenantId: input.tenantId,
        representativeRef: input.representativeRef,
        holderRef: input.holderRef,
        resourceKind: input.resourceKind,
        resourceId: input.resourceId,
        governedRight,
        action: input.action,
        ...(input.requestedScope !== undefined ? { requestedScope: input.requestedScope } : {}),
        at: input.at,
      });
    } catch {
      // A representation store that cannot be read is not a proof of
      // representation. Fails closed, for the same reason and in the same
      // shape as its authority sibling.
      coverage = { outcome: 'no_representation' };
    }
    rights.push({
      governedRight,
      outcome: coverage.outcome,
      covered: isGovernedRepresentationCovered(coverage),
      // Reported whenever a binding was actually implicated — on a pass, and
      // on the near-miss denials too, because "which binding fell short" is
      // the first thing an operator needs and the compact reason code cannot
      // carry it.
      ...('representativeAuthorityId' in coverage ? { representativeAuthorityId: coverage.representativeAuthorityId } : {}),
      ...(coverage.outcome === 'represented' ? { chain: coverage.chain } : {}),
    });

    const reasonCode = toRepresentationReasonCode(coverage);
    if (reasonCode !== null && !reasonCodes.includes(reasonCode)) reasonCodes.push(reasonCode);
  }

  return { evaluation: { ...base, required: true, rights }, reasonCodes };
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
 * into a denial when either proof does not cover the action.
 *
 * An outcome that was already denied is left exactly as it was, facts and all:
 * a denial has one reason and re-labelling it with a second would misreport
 * why the request actually stopped. This is also what makes representation
 * incapable of rescuing anything — a denied result never reaches the fold.
 */
export async function applyGovernedAuthorityStep(
  provider: GovernedAuthorityProvider,
  representationProvider: GovernedRepresentationProvider | undefined,
  request: KernelEvaluationRequest,
  result: KernelEvaluationResult,
): Promise<KernelEvaluationResult> {
  if ((request.action.governedRights ?? []).length === 0) return result;
  if (!VIABLE_STATUSES.has(result.status)) return result;

  const facts = await resolveGovernedAuthorityFacts(provider, representationProvider, request, result.evaluatedAt);
  if (facts.reasonCodes.length === 0) {
    // Viable and covered: the original outcome stands untouched, annotated
    // with what was checked. An allowed decision is not re-derived here.
    return { ...result, authority: { ...result.authority, ...toAuthorityFields(facts) } };
  }
  return denied(result, facts);
}

/** The authority fields a result carries away from this step. Kept in one place so the pass and denial paths cannot report different shapes. */
function toAuthorityFields(facts: GovernedAuthorityFacts): {
  governedAuthority: GovernedAuthorityEvaluation;
  representation?: GovernedRepresentationEvaluation;
} {
  return {
    governedAuthority: facts.governedAuthority,
    ...(facts.representation !== undefined ? { representation: facts.representation } : {}),
  };
}

/**
 * Rewrites a viable outcome as a denial, preserving everything the original
 * evaluation established.
 *
 * The trace, policy results, recognition verdict, approval state and evidence
 * are all kept exactly as the wrapped engine produced them, and the original
 * reason codes are kept after the new ones — a reviewer must still be able to
 * see that recognition passed and the capability chain resolved, because
 * "denied for lack of representation", "denied for lack of governed authority"
 * and "denied because the actor was never recognized" are three different
 * facts and none of them must erase the others.
 */
function denied(result: KernelEvaluationResult, facts: GovernedAuthorityFacts): KernelEvaluationResult {
  const merged = [...facts.reasonCodes, ...result.reasonCodes.filter((code) => !facts.reasonCodes.includes(code as AocKernelReasonCode))];
  return {
    ...result,
    status: 'denied',
    reasonCodes: merged,
    summary: facts.summary,
    authority: { ...result.authority, ...toAuthorityFields(facts) },
  };
}
