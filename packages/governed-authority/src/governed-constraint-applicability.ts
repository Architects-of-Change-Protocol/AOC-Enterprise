import type { GovernedRightType, GovernedRightsScope } from '@aoc-enterprise/governed-authorization';

import { governedAuthorityEncumbranceConstrains, type GovernedAuthorityEncumbrance } from './governed-authority-encumbrance.js';

/**
 * What a persistent constraint means **for a different governed action**.
 *
 * ## The gap this closes
 *
 * `GovernedAuthorityEncumbrance` records that a portion of a holder's
 * authority stands constrained. It deliberately says nothing about which
 * future actions that matters to, and its own contract is explicit about the
 * omission: *"Not an inter-action conflict policy."* Until this module existed
 * the answer was emergent rather than declared — every commitment went through
 * one action-agnostic capacity computation, so an encumbrance reduced the
 * capacity of *whatever* action asked next, and an action that never consulted
 * the authority store was silently unaffected. Both answers happened to be
 * defensible; neither was *stated*, and nothing could be asked to explain them.
 *
 * ## The five statements this layer keeps apart
 *
 * ```
 * 1  a constraint exists
 * 2  the constraint applies to THIS action
 * 3  the constraint reduces finite capacity this action consumes
 * 4  the constraint makes this action's state transition structurally impossible
 * 5  the deployment's business policy disallows the combination
 * ```
 *
 * They are five different claims. 1 does not imply 2; 2 does not imply 3 or 4;
 * and 5 is not AOC's to assert at all — it is the deployment's, expressed
 * through ordinary policy, and this module's job is to hand policy the typed
 * facts rather than to invent the rule.
 *
 * ## What is emphatically not decided here
 *
 * No business or legal rule. Nothing in this module says collateralized
 * authority may not be transferred, that tokenization conflicts with
 * collateral, or that an exclusive licence blocks a sale. Those may be valid
 * *deployment* policies and this layer is what makes them expressible; they are
 * not AOC truths and none of them is a default.
 *
 * There is likewise no priority, seniority or ranking, and no automatic
 * resolution: a conflict is reported, never negotiated, and a constraint in the
 * way of an action is never released to clear it. Release is its own governed
 * lifecycle.
 */

/**
 * What kind of finite thing a persistent constraint commits, as a closed typed
 * vocabulary.
 *
 * Deliberately **not** `sourceAction` under another name, even though exactly
 * one action produces constraints today and the mapping between them is
 * currently one-to-one. The two would come apart the first time an action
 * produced more than one kind of constraint — a `LICENSE` that could be
 * exclusive or non-exclusive is the obvious near case, and an exclusivity
 * constraint and a capacity constraint do not interact with future actions the
 * same way. Deriving applicability from the *class* rather than from the action
 * that happened to create it means that future variant adds a class and a row
 * to the profile registry, instead of an `if` inside every capacity
 * computation.
 *
 * One member, and the narrowness is the point: a class is introduced when an
 * action's measured semantics require one, never in anticipation. See
 * `docs/enterprise/AOC_GOVERNED_CONSTRAINT_APPLICABILITY.md`.
 *
 * ```
 * collateral-commitment-capacity
 *     a finite quantity of the holder's authority is committed to an external
 *     collateral arrangement that already exists. Committing the same quantity
 *     again would promise one authority to two arrangements, so a further
 *     commitment of this same class must respect it.
 * ```
 */
export type GovernedAuthorityConstraintClass = 'collateral-commitment-capacity';

/**
 * How a governed action stands in relation to persistent constraints.
 *
 * A *typed profile per action* rather than a boolean, and rather than a matrix
 * of action-versus-source-action pairs, because the four questions below have
 * genuinely different answers for the five canonical actions and collapsing
 * them into one flag is how "an encumbrance exists" silently becomes "the
 * action is denied".
 *
 * Every canonical Governed Action must have one. An action that reaches the
 * authority accounting layer without a declared profile is refused rather than
 * treated as unrelated — see `governedActionConstraintProfile`'s call sites.
 * That is the enrolment rule: a resource this deployment holds no governed
 * authority for behaves exactly as it did before any of this existed, and an
 * action that *does* participate must have said how.
 */
export interface GovernedActionConstraintProfile {
  /** The capability vocabulary `GovernedAuthorityBasis`'s `governed-execution` variant already uses. */
  readonly action: string;

  /**
   * The class of persistent constraint a successful execution of this action
   * leaves behind, or `null` when it leaves none.
   *
   * Deliberately separate from what the action *consumes*: producing and
   * consuming the same class is what makes a capacity finite, but an action
   * could do either alone.
   */
  readonly producesConstraintClass: GovernedAuthorityConstraintClass | null;

  /**
   * The classes of persistent constraint that reduce the capacity available to
   * *this* action.
   *
   * Empty is a real and common answer, and it is not a gap: it means the
   * action draws on no capacity that a constraint of any current class has
   * already spoken for. It says nothing about whether the deployment's policy
   * allows the combination.
   */
  readonly consumesConstraintClasses: readonly GovernedAuthorityConstraintClass[];

  /**
   * Whether executing this action changes how much authority the holder still
   * possesses, and therefore whether every constraint standing over that
   * holder must still be covered afterwards.
   *
   * This is a **structural** property of the action, not a business rule about
   * any class, and it is class-agnostic on purpose: AOC may not end up holding
   * a constraint over authority its holder no longer has, whatever kind of
   * constraint it is. `TRANSFER` is the only current action with it, and it
   * arrives at the same arithmetic as a capacity constraint by an entirely
   * different route — which is exactly why the two are kept apart rather than
   * merged into one "conflicts" flag.
   */
  readonly constrainsHolderTransition: boolean;

  /**
   * Whether this action's governed effect is the terminalization of one
   * explicitly targeted constraint.
   *
   * The escape from circularity, and it is narrow by construction: a releasing
   * action is not *exempt* from applicability, it simply consumes no class and
   * changes no holder position, so nothing applies to it. An active constraint
   * therefore cannot prevent its own governed release. This is emphatically not
   * a general bypass — a releasing action gets no relief from action authority,
   * representation, delegation or policy, and it discharges only the one
   * constraint its mandate names.
   */
  readonly terminalizesTargetConstraint: boolean;
}

/** Why an applicable constraint bears on the requested action. A list rather than one discriminant: an action may be affected on both counts, and reporting only the stronger would lose the reason the weaker fired. */
export type GovernedConstraintApplicabilityKind =
  /** The constraint commits a class of finite capacity this action also consumes. */
  | 'capacity'
  /** The constraint must remain covered by whatever authority the holder keeps after this action's transition. */
  | 'structural';

/** Why a constraint that exists does **not** bear on the requested action. Reported rather than dropped, so an explanation can say which constraints were considered and dismissed, and on what grounds. */
export type GovernedConstraintNonApplicabilityReason =
  /** Released, or not yet effective at the instant asked about. */
  | 'not_constraining'
  /** Attached to a different tenant, holder, resource or governed right. Never crossed, and never bridged by an invented cross-right hierarchy. */
  | 'different_binding'
  /** Its class is not one this action consumes, and this action performs no authority transition for it to have to stay covered by. */
  | 'class_not_engaged';

/** One constraint that bears on the requested action, reduced to references and the quantity — never the stored row. */
export interface AppliedGovernedConstraint {
  readonly constraintId: string;
  readonly constraintClass: GovernedAuthorityConstraintClass;
  readonly sourceAction: string;
  readonly governedRight: GovernedRightType;
  readonly scope: GovernedRightsScope;
  /** Non-empty, stably ordered `capacity` before `structural`. */
  readonly applicability: readonly GovernedConstraintApplicabilityKind[];
}

/**
 * One constraint that was considered and does not bear on the requested action.
 *
 * The typed facts are carried for the `class_not_engaged` case and withheld for
 * the other two, and the asymmetry is deliberate. A constraint that stands over
 * exactly the authority this request engages but does not *apply* to this action
 * is the single most interesting case in the whole model — it is what a
 * deployment's cross-action policy turns on — so it is described. A constraint
 * bound to another tenant, holder, resource or right is nobody's business here
 * and is reported only as having been dismissed.
 */
export interface UnappliedGovernedConstraint {
  readonly constraintId: string;
  /** Absent exactly when the class could not be determined, or when the constraint was dismissed on binding before it was ever classified. */
  readonly constraintClass?: GovernedAuthorityConstraintClass;
  /** Present with `constraintClass`, for the same reason. */
  readonly sourceAction?: string;
  readonly governedRight?: GovernedRightType;
  readonly reason: GovernedConstraintNonApplicabilityReason;
}

/** One constraint whose applicability could not be decided. Never treated as non-applicable: a constraint AOC cannot classify is a constraint AOC cannot prove it is respecting. */
export interface InvalidGovernedConstraint {
  readonly constraintId: string;
  readonly sourceAction: string;
  readonly reason: 'unknown_constraint_class';
}

/**
 * The verdict for one action against the constraints standing over one
 * holder, resource and right.
 *
 * `status` is the strongest classification present, in the order below; the
 * per-constraint lists carry the whole truth, so a caller that needs to know
 * *which* constraint fired for *which* reason never has to infer it from the
 * summary.
 *
 * ```
 * constraint_state_invalid   at least one active constraint could not be classified
 * capacity_constrained       at least one constraint commits capacity this action consumes
 * structurally_constrained   at least one constraint must stay covered after this action's transition
 * unconstrained              nothing standing over this authority bears on this action
 * ```
 *
 * `unconstrained` is emphatically **not** "allowed". It is the narrow claim
 * that no persistent constraint reduces or structurally blocks this action —
 * action authority, representation, delegation, coverage, reservation and
 * deployment policy all still decide independently, and any of them may deny.
 */
export type GovernedConstraintApplicabilityStatus =
  | 'unconstrained'
  | 'capacity_constrained'
  | 'structurally_constrained'
  | 'constraint_state_invalid';

export interface GovernedConstraintApplicability {
  readonly action: string;
  readonly status: GovernedConstraintApplicabilityStatus;
  readonly applicable: readonly AppliedGovernedConstraint[];
  readonly nonApplicable: readonly UnappliedGovernedConstraint[];
  readonly invalid: readonly InvalidGovernedConstraint[];
}

/** Classifies a stored constraint by the action that produced it. Returns `null` for anything it cannot classify, and the caller must fail closed on that — never treat it as unrelated. */
export type GovernedConstraintClassifier = (sourceAction: string) => GovernedAuthorityConstraintClass | null;

export interface EvaluateGovernedConstraintApplicabilityInput {
  /** The profile of the action being requested. Supplied by the caller rather than looked up here, so this module names no action and a test can evaluate a synthetic profile. */
  readonly profile: GovernedActionConstraintProfile;
  readonly tenantId: string;
  readonly holderRef: string;
  readonly resource: { readonly kind: string; readonly id: string };
  readonly governedRight: GovernedRightType;
  readonly constraints: readonly GovernedAuthorityEncumbrance[];
  readonly classify: GovernedConstraintClassifier;
  readonly at: string;
}

/**
 * The one canonical answer to "does this constraint apply to this action?".
 *
 * Pure, total and deterministic: the same records in any order produce an
 * equivalent verdict, because every output list is sorted by constraint id
 * before it is returned. Nothing here reads a store, a clock or a policy.
 *
 * The order of the tests below is load-bearing:
 *
 * 1. **Binding first.** A constraint attached to another tenant, holder,
 *    resource or right is not this holder's problem, and asking anything
 *    further about it would invite a cross-binding inference. There is
 *    deliberately no cross-right hierarchy: an `economic-interest` constraint
 *    does not constrain a `usage-right` action, because AOC holds no evidence
 *    that those quantities are commensurable and inventing the relation would
 *    be inventing the policy.
 *
 * 2. **Then whether it still constrains at all.** Released and not-yet-effective
 *    constraints bear on nothing.
 *
 * 3. **Then classification, and it fails closed.** An active, correctly-bound
 *    constraint whose class cannot be determined is reported as `invalid`, never
 *    as non-applicable. Dismissing it would be the exact fail-open this layer
 *    exists to prevent: a constraint nobody can classify is a constraint nobody
 *    can prove is being respected.
 *
 * 4. **Then engagement**, which is where the action's declared profile finally
 *    matters, and where the two independent routes stay independent.
 */
export function evaluateGovernedConstraintApplicability(
  input: EvaluateGovernedConstraintApplicabilityInput,
): GovernedConstraintApplicability {
  const applicable: AppliedGovernedConstraint[] = [];
  const nonApplicable: UnappliedGovernedConstraint[] = [];
  const invalid: InvalidGovernedConstraint[] = [];

  for (const constraint of input.constraints) {
    if (
      constraint.tenantId !== input.tenantId ||
      constraint.holderRef !== input.holderRef ||
      constraint.resourceKind !== input.resource.kind ||
      constraint.resourceId !== input.resource.id ||
      constraint.governedRight !== input.governedRight
    ) {
      nonApplicable.push({ constraintId: constraint.id, reason: 'different_binding' });
      continue;
    }

    if (!governedAuthorityEncumbranceConstrains(constraint, input.at)) {
      nonApplicable.push({ constraintId: constraint.id, reason: 'not_constraining' });
      continue;
    }

    const constraintClass = input.classify(constraint.sourceAction);
    if (constraintClass === null) {
      invalid.push({ constraintId: constraint.id, sourceAction: constraint.sourceAction, reason: 'unknown_constraint_class' });
      continue;
    }

    const kinds: GovernedConstraintApplicabilityKind[] = [];
    // Capacity engagement is class-matched: this action draws on the same
    // finite thing the constraint already committed.
    if (input.profile.consumesConstraintClasses.includes(constraintClass)) kinds.push('capacity');
    // Structural engagement is class-agnostic, and deliberately so. What makes
    // a constraint structurally relevant is not what kind it is but that it is
    // holder-bound and this action moves the holder's authority out from under
    // it.
    if (input.profile.constrainsHolderTransition) kinds.push('structural');

    if (kinds.length === 0) {
      nonApplicable.push({
        constraintId: constraint.id,
        constraintClass,
        sourceAction: constraint.sourceAction,
        governedRight: constraint.governedRight,
        reason: 'class_not_engaged',
      });
      continue;
    }

    applicable.push({
      constraintId: constraint.id,
      constraintClass,
      sourceAction: constraint.sourceAction,
      governedRight: constraint.governedRight,
      scope: constraint.scope,
      applicability: kinds,
    });
  }

  return {
    action: input.profile.action,
    status: statusOf(applicable, invalid),
    applicable: [...applicable].sort(byConstraintId),
    nonApplicable: [...nonApplicable].sort(byConstraintId),
    invalid: [...invalid].sort(byConstraintId),
  };
}

function statusOf(
  applicable: readonly AppliedGovernedConstraint[],
  invalid: readonly InvalidGovernedConstraint[],
): GovernedConstraintApplicabilityStatus {
  if (invalid.length > 0) return 'constraint_state_invalid';
  if (applicable.some((entry) => entry.applicability.includes('capacity'))) return 'capacity_constrained';
  if (applicable.some((entry) => entry.applicability.includes('structural'))) return 'structurally_constrained';
  return 'unconstrained';
}

function byConstraintId(left: { readonly constraintId: string }, right: { readonly constraintId: string }): number {
  return left.constraintId < right.constraintId ? -1 : left.constraintId > right.constraintId ? 1 : 0;
}

// ---------------------------------------------------------------------------
// The policy view.
// ---------------------------------------------------------------------------

/** One constraint as deployment policy may see it: references and typed facts, never the stored row, and never a party. */
export interface GovernedConstraintPolicyFact {
  readonly constraintId: string;
  readonly constraintClass: GovernedAuthorityConstraintClass;
  readonly sourceAction: string;
  readonly governedRight: GovernedRightType;
  /**
   * How this constraint bears on the requested action, and **empty when it does
   * not**.
   *
   * Empty is the case the whole policy layer exists for, and dropping such a
   * constraint from the view would have made a deployment's most obvious rule
   * inexpressible: "require approval to tokenize an asset whose economic
   * interest is collateralized" is precisely a rule about a constraint that
   * consumes none of `TOKENIZE`'s capacity. AOC declines to invent that rule; it
   * must not also withhold the fact the rule needs.
   *
   * A policy reading this must not treat a non-empty list as permission to
   * proceed, nor an empty one as permission: applicability is enforced
   * afterwards, in the authority layer, whatever policy concludes.
   */
  readonly applicability: readonly GovernedConstraintApplicabilityKind[];
}

/**
 * The bounded, read-only summary of persistent constraints that reaches
 * deployment policy.
 *
 * Policy is where cross-action *business* compatibility belongs — "may this
 * deployment tokenize an asset whose economic interest is collateralized?" is
 * a question with different right answers in different deployments, and AOC
 * inventing one would be inventing the law. What this carries is the typed
 * facts that question needs and nothing more:
 *
 * - **References, not rows.** Constraint ids, classes and rights. No scope
 *   quantities, no mandate or execution references, no holder, and above all
 *   no party: an encumbrance names no beneficiary and this view cannot invent
 *   one.
 * - **Scoped to the request.** Only constraints over the tenant, holder,
 *   resource and rights this request engages. Unrelated constraints are not
 *   disclosed to a policy that has no business seeing them.
 * - **Read-only.** Policy decides compatibility. It cannot create, resize,
 *   move or release a constraint — those are governed lifecycles, and a policy
 *   that could reach them would be an authorization path wearing a policy's
 *   name.
 *
 * And it is strictly narrowing. A policy may turn an otherwise viable action
 * into a denial or an approval requirement. It can never turn a structurally
 * impossible one, or one that would overcommit finite capacity, into an
 * allowed one: those are decided in the authority consistency boundary, after
 * and independently of any policy result.
 */
export interface GovernedConstraintPolicyContext {
  /** Whether constraint state was actually resolved for this request. `false` means it was not consulted — an unenrolled resource, or no provider configured — and is never to be read as "there are none". */
  readonly resolved: boolean;
  /** The strongest applicability found across every governed right this request engages. */
  readonly status: GovernedConstraintApplicabilityStatus;
  readonly constraints: readonly GovernedConstraintPolicyFact[];
}

/** Reduces one or more per-right verdicts to the bounded policy view, stably ordered so a policy sees the same input for the same state. */
export function toGovernedConstraintPolicyContext(
  results: readonly GovernedConstraintApplicability[],
): GovernedConstraintPolicyContext {
  const constraints: GovernedConstraintPolicyFact[] = [];
  const seen = new Set<string>();
  let status: GovernedConstraintApplicabilityStatus = 'unconstrained';

  for (const result of results) {
    if (STATUS_RANK[result.status] > STATUS_RANK[status]) status = result.status;
    for (const entry of result.applicable) {
      if (seen.has(entry.constraintId)) continue;
      seen.add(entry.constraintId);
      constraints.push({
        constraintId: entry.constraintId,
        constraintClass: entry.constraintClass,
        sourceAction: entry.sourceAction,
        governedRight: entry.governedRight,
        applicability: entry.applicability,
      });
    }
    // The constraints that stand over exactly this authority and do *not* apply
    // to this action, reported with an empty applicability. Only this
    // non-applicability reason is disclosed: a constraint dismissed on binding
    // belongs to another holder, resource, right or tenant and is none of this
    // policy's business, and one that is released or not yet effective
    // constrains nothing at all.
    for (const entry of result.nonApplicable) {
      if (entry.reason !== 'class_not_engaged') continue;
      if (entry.constraintClass === undefined || entry.sourceAction === undefined || entry.governedRight === undefined) continue;
      if (seen.has(entry.constraintId)) continue;
      seen.add(entry.constraintId);
      constraints.push({
        constraintId: entry.constraintId,
        constraintClass: entry.constraintClass,
        sourceAction: entry.sourceAction,
        governedRight: entry.governedRight,
        applicability: [],
      });
    }
  }

  return { resolved: true, status, constraints: constraints.sort(byConstraintId) };
}

const STATUS_RANK: Readonly<Record<GovernedConstraintApplicabilityStatus, number>> = {
  unconstrained: 0,
  structurally_constrained: 1,
  capacity_constrained: 2,
  constraint_state_invalid: 3,
};

/** The context a request that never resolved constraint state carries. Distinct from an empty resolved context, because "not consulted" and "none found" are different facts and a policy must be able to tell them apart. */
export const UNRESOLVED_GOVERNED_CONSTRAINT_POLICY_CONTEXT: GovernedConstraintPolicyContext = {
  resolved: false,
  status: 'unconstrained',
  constraints: [],
};

/** The key the policy context travels under in the policy pack's deployment metadata bag. Namespaced so it cannot collide with a deployment's own keys. */
export const GOVERNED_CONSTRAINT_POLICY_METADATA_KEY = 'aoc.governedConstraints';

/** What a policy-context resolution is asked about: one tenant, one holder, one resource, and every governed right the request engages. */
export interface GovernedConstraintQuery {
  readonly tenantId: string;
  readonly holderRef: string;
  readonly resourceKind: string;
  readonly resourceId: string;
  readonly governedRights: readonly GovernedRightType[];
  /** The action being requested, in the capability vocabulary. What decides which constraints bear on it. */
  readonly action: string;
  readonly at: string;
}

/**
 * The optional port through which deployment policy is told what persistent
 * constraints stand over the authority a request engages.
 *
 * A *third* narrow port alongside `GovernedAuthorityProviderPort` and
 * `GovernedRepresentationProviderPort`, and separate from both for the same
 * reason they are separate from each other: it answers a different question,
 * fails for disjoint reasons, and is independently configurable. Folding it
 * into the authority provider would make one coverage union carry two verdicts
 * and would let a constraint fact deny a request on its own — which it must
 * never do. This port produces *facts for policy*; it decides nothing.
 *
 * It is deliberately not a gate. Nothing a deployment does with this context
 * can widen an outcome: the hard capacity and structural invariants are decided
 * afterwards, inside the authority store's own consistency boundary, against
 * the state committed there. A policy that saw no constraints and allowed
 * everything still cannot commit authority a constraint accounts for.
 */
export interface GovernedConstraintProviderPort {
  resolveGovernedConstraints(query: GovernedConstraintQuery): Promise<GovernedConstraintPolicyContext>;
}
