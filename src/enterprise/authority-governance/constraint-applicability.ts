import {
  evaluateGovernedConstraintApplicability,
  type GovernedActionConstraintProfile,
  type GovernedAuthorityConstraintClass,
  type GovernedAuthorityEncumbrance,
  type GovernedConstraintApplicability,
} from '@aoc-enterprise/governed-authority';
import type { GovernedRightType } from '@aoc-enterprise/governed-authorization';

import { GOVERNED_AUTHORITY_ENCUMBERING_ACTIONS, governedActionEncumbersAuthority, governedActionReleasesEncumbrance } from './encumbrance-lifecycle.js';
import { AuthorityGovernanceError } from './errors.js';
import { governedActionConservesAuthority } from './reservation-lifecycle.js';

/**
 * Which persistent constraint each governed action produces, which ones bear
 * on it, and on what grounds — declared once, for all five canonical actions.
 *
 * ## Why this file exists rather than five `if`s
 *
 * The behaviour it replaces was real and mostly correct, but it was *emergent*.
 * Every commitment went through one action-agnostic capacity computation, so an
 * active encumbrance reduced the capacity of whichever action asked next, and
 * the two actions that never call the authority store were untouched by
 * construction. The measured result (recorded in the ADR) was:
 *
 * ```
 * COLLATERALIZE 4 000   denied   AVAILABILITY_INSUFFICIENT
 * COLLATERALIZE 1 000   allowed
 * TRANSFER        500   allowed
 * TRANSFER      2 000   denied   AVAILABILITY_INSUFFICIENT
 * TOKENIZE      5 000   allowed  (the store was never consulted)
 * LICENSE       5 000   allowed  (the store was never consulted)
 * RELEASE               allowed
 * ```
 *
 * Every one of those is preserved. What changes is that each is now *declared*
 * and *explainable* instead of falling out of which helper an action happened
 * to share, and that the two denials — which produce the same arithmetic — are
 * recorded as the two different facts they are.
 *
 * ## The two independent routes to the same number
 *
 * With Alice holding 5 000 bp and a 4 000 bp collateral constraint standing,
 * both `COLLATERALIZE` and `TRANSFER` are bounded at 1 000. That coincidence is
 * why one action-agnostic computation looked right, and why keeping the routes
 * apart matters:
 *
 * ```
 * COLLATERALIZE   capacity     a further commitment of the same class plus the
 *                              standing one must not exceed what is held:
 *                              new + 4 000 <= 5 000
 *
 * TRANSFER        structural   whatever the holder keeps must still cover the
 *                              constraints attached to her, which do not follow
 *                              the authority to a recipient:
 *                              5 000 - moved >= 4 000
 * ```
 *
 * The same bound, for entirely different reasons. Merge them into one
 * `conflicts` flag and the first action that has one property without the other
 * gets the wrong answer silently.
 *
 * ## What is deliberately absent
 *
 * No business rule. `TRANSFER` is not bounded here because collateralized
 * authority "may not be sold" — a holder with a 4 000 bp constraint transfers
 * 1 000 freely, right through this table. `TOKENIZE` and `LICENSE` consume no
 * class, so nothing here denies them, and inventing a default that did would be
 * inventing one deployment's law for every deployment. Where a deployment does
 * want such a rule, it expresses it as policy, which sees these facts through
 * `GovernedConstraintPolicyContext` and may narrow — never widen.
 */

/** The capability vocabulary `GovernedAuthorityBasis`'s `governed-execution` variant already uses, shared with the three classification lists in `encumbrance-lifecycle.ts` and `reservation-lifecycle.ts`. */
const TRANSFER = 'transfer';
const COLLATERALIZE = 'collateralize';
const TOKENIZE = 'tokenize';
const LICENSE = 'license';
const RELEASE_ENCUMBRANCE = 'release-encumbrance';

/** The one class in the current vocabulary. Named for what it commits rather than for the action that commits it, so a second kind of constraint from the same action does not have to pretend to be this one. */
export const COLLATERAL_COMMITMENT_CAPACITY: GovernedAuthorityConstraintClass = 'collateral-commitment-capacity';

/**
 * The class a stored constraint belongs to, or `null` when it cannot be
 * determined.
 *
 * **Derived, never persisted**, and that is the whole of the migration answer:
 * no column is added, no digest changes, and every Phase 5.5/5.6 row projects
 * byte-identically to how it always did. A stored class would be a second
 * source of truth that a restore or an import could leave disagreeing with the
 * record's own `sourceAction`, and the derivation is total over the only values
 * the write path can produce — `recordEncumbrance` already refuses any
 * `sourceAction` not classified as encumbering, so `'collateralize'` is the
 * only value reachable through it.
 *
 * `null` is returned rather than a default for anything else, and every caller
 * must fail closed on it. A row that arrived by some other route — a migration,
 * a restore, a future version's writer — is a constraint this deployment cannot
 * prove it is respecting, and treating it as unrelated would be the exact
 * fail-open the whole layer exists to prevent.
 */
export function governedConstraintClassOf(sourceAction: string): GovernedAuthorityConstraintClass | null {
  return sourceAction === COLLATERALIZE ? COLLATERAL_COMMITMENT_CAPACITY : null;
}

/**
 * Every canonical Governed Action's declared relationship to persistent
 * constraints.
 *
 * Each entry is measured from what the action actually does, and the evidence
 * is the pre-change matrix above plus the executable one in
 * `governed-constraint-applicability-scenario.test.ts`. Adding a sixth action
 * means adding a row here deliberately; `assertGovernedActionProfilesComplete`
 * refuses a registry that has drifted from the classification lists.
 */
export const GOVERNED_ACTION_CONSTRAINT_PROFILES: readonly GovernedActionConstraintProfile[] = [
  {
    // Debits the transferor. Its authority moves; the constraints standing over
    // it do not, so what she keeps must still cover them. Consumes no class:
    // moving authority is not committing collateral, and forcing it into the
    // collateral class merely to reproduce the bound would say something untrue
    // about what a transfer is.
    action: TRANSFER,
    producesConstraintClass: null,
    consumesConstraintClasses: [],
    constrainsHolderTransition: true,
    terminalizesTargetConstraint: false,
  },
  {
    // Produces and consumes the same class, which is what makes that capacity
    // finite. Debits no position — Alice keeps every basis point — so there is
    // no transition for a structural constraint to bear on.
    action: COLLATERALIZE,
    producesConstraintClass: COLLATERAL_COMMITMENT_CAPACITY,
    consumesConstraintClasses: [COLLATERAL_COMMITMENT_CAPACITY],
    constrainsHolderTransition: false,
    terminalizesTargetConstraint: false,
  },
  {
    // Never calls the authority store: its scope bounds an issuance ceiling
    // inside one mandate, and executing it debits nothing and constrains
    // nothing. Whether independent issuances should compete for one pool is a
    // tokenization-domain question, and whether tokenizing collateralized
    // authority is acceptable is a deployment's policy question. Neither is
    // answered here, and the empty class list is that refusal stated rather
    // than implied.
    action: TOKENIZE,
    producesConstraintClass: null,
    consumesConstraintClasses: [],
    constrainsHolderTransition: false,
    terminalizesTargetConstraint: false,
  },
  {
    // Never calls the authority store either, and frequently carries no scope
    // at all — an absent `rightsScope` is emphatically not 100%, so there is no
    // quantity for a constraint to reduce. An `economic-interest` constraint
    // does not reach a `usage-right` licence, and there is deliberately no
    // cross-right relation that would let it: Soberanía holds no evidence those
    // quantities are commensurable. Licence scarcity — exclusivity, seat
    // ceilings, duration — remains action-local policy.
    action: LICENSE,
    producesConstraintClass: null,
    consumesConstraintClasses: [],
    constrainsHolderTransition: false,
    terminalizesTargetConstraint: false,
  },
  {
    // Terminalizes the one constraint its mandate names. Consumes no class and
    // moves no authority, so nothing applies to it — which is how an active
    // constraint cannot block its own governed release without any general
    // exemption being carved out. It gets no relief from action authority,
    // representation, delegation or policy, and it discharges nothing it did
    // not name.
    action: RELEASE_ENCUMBRANCE,
    producesConstraintClass: null,
    consumesConstraintClasses: [],
    constrainsHolderTransition: false,
    terminalizesTargetConstraint: true,
  },
];

const PROFILES_BY_ACTION: ReadonlyMap<string, GovernedActionConstraintProfile> = new Map(
  GOVERNED_ACTION_CONSTRAINT_PROFILES.map((profile) => [profile.action, profile]),
);

/** The declared profile for an action, or `null` when it has none. */
export function governedActionConstraintProfile(action: string): GovernedActionConstraintProfile | null {
  return PROFILES_BY_ACTION.get(action) ?? null;
}

/**
 * The profile for an action that is about to draw on governed authority, or a
 * refusal.
 *
 * The enrolment rule, and it is one-way. A resource this deployment holds no
 * governed authority for never reaches here at all, and behaves exactly as it
 * did before any of this existed. An action that *does* reach here has claimed
 * to participate in governed-right capacity, and an undeclared participant is
 * refused rather than assumed unrelated: assuming would let a future action
 * quietly commit authority that a constraint already accounts for, with nothing
 * to notice it.
 */
export function requireGovernedActionConstraintProfile(
  action: string,
  context: Readonly<Record<string, unknown>>,
): GovernedActionConstraintProfile {
  const profile = governedActionConstraintProfile(action);
  if (profile === null) {
    throw new AuthorityGovernanceError(
      'GOVERNED_AUTHORITY_CONSTRAINT_APPLICABILITY_UNDECLARED',
      `'${action}' has no declared governed constraint applicability profile; refusing to commit governed authority for an action whose relationship to persistent constraints has not been stated.`,
      { ...context, action },
    );
  }
  return profile;
}

/**
 * Resolves which of the constraints standing over one holder, resource and
 * right bear on one requested action.
 *
 * A thin wiring of the registry and the classifier into the pure evaluator, so
 * every call site in this runtime asks the same question the same way and there
 * is exactly one place where an action, a class and a constraint meet.
 */
export function resolveGovernedConstraintApplicability(args: {
  readonly action: string;
  readonly tenantId: string;
  readonly holderRef: string;
  readonly resource: { readonly kind: string; readonly id: string };
  readonly governedRight: GovernedRightType;
  readonly constraints: readonly GovernedAuthorityEncumbrance[];
  readonly at: string;
}): GovernedConstraintApplicability {
  const profile = requireGovernedActionConstraintProfile(args.action, {
    tenantId: args.tenantId,
    holderRef: args.holderRef,
    governedRight: args.governedRight,
  });
  return evaluateGovernedConstraintApplicability({
    profile,
    tenantId: args.tenantId,
    holderRef: args.holderRef,
    resource: args.resource,
    governedRight: args.governedRight,
    constraints: args.constraints,
    classify: governedConstraintClassOf,
    at: args.at,
  });
}

/**
 * Refuses a registry that disagrees with the classification lists it must stay
 * consistent with.
 *
 * Three drifts are possible and all three are silent failures rather than loud
 * ones, which is why they are asserted rather than trusted:
 *
 * - an **encumbering** action that produces no class — its constraints would be
 *   unclassifiable the moment they were written, and every capacity question
 *   afterwards would fail closed on records this deployment created itself;
 * - a **releasing** action not declared as terminalizing — a release could then
 *   be structurally or capacity-constrained by the very constraint it exists to
 *   discharge;
 * - a **conserving** action not declared as constraining the holder transition
 *   — authority could move out from under a constraint that stays behind.
 *
 * Called from the module's own tests rather than at import time: a construction
 * that fails on load would take a deployment down for a defect a test names
 * precisely.
 */
export function assertGovernedActionProfilesComplete(actions: readonly string[]): void {
  for (const action of actions) {
    const profile = requireGovernedActionConstraintProfile(action, {});

    if (governedActionEncumbersAuthority(action) && profile.producesConstraintClass === null) {
      throw new AuthorityGovernanceError(
        'GOVERNED_AUTHORITY_CONSTRAINT_APPLICABILITY_UNDECLARED',
        `'${action}' is classified as leaving a persistent constraint (${GOVERNED_AUTHORITY_ENCUMBERING_ACTIONS.join(', ')}) but declares no constraint class for it; the constraints it creates could not be classified.`,
        { action },
      );
    }
    if (!governedActionEncumbersAuthority(action) && profile.producesConstraintClass !== null) {
      throw new AuthorityGovernanceError(
        'GOVERNED_AUTHORITY_CONSTRAINT_APPLICABILITY_UNDECLARED',
        `'${action}' declares that it produces a persistent constraint class but is not classified as encumbering; the two classifications must agree.`,
        { action },
      );
    }
    if (governedActionReleasesEncumbrance(action) !== profile.terminalizesTargetConstraint) {
      throw new AuthorityGovernanceError(
        'GOVERNED_AUTHORITY_CONSTRAINT_APPLICABILITY_UNDECLARED',
        `'${action}' disagrees with its releasing classification about whether it terminalizes a targeted constraint.`,
        { action },
      );
    }
    if (governedActionConservesAuthority(action) !== profile.constrainsHolderTransition) {
      throw new AuthorityGovernanceError(
        'GOVERNED_AUTHORITY_CONSTRAINT_APPLICABILITY_UNDECLARED',
        `'${action}' disagrees with its conserving classification about whether the holder's remaining authority must still cover its constraints.`,
        { action },
      );
    }
  }
}

/**
 * The constraints that bear on one requested action, together with the verdict
 * that explains the selection — and a refusal when any of them cannot be
 * classified.
 *
 * The single entry point every enforcement site uses, so there is one place
 * where "which constraints does this action have to respect?" is answered and
 * no store can drift into a laxer reading. Called from *inside* each store's
 * own critical section, against the records read there, so the answer is never
 * a snapshot a caller measured earlier: the whole point of the atomic
 * acquisition is that the constraints it respects are the ones committed at the
 * instant it commits.
 *
 * Fails closed on `constraint_state_invalid` rather than proceeding without the
 * constraints it could not classify. That is the same discipline
 * `assertEncumbranceIntegrity` applies to a tampered row: an unreadable
 * constraint is not an absent one, and silently freeing the authority it holds
 * is how a corrupted record becomes a double commitment.
 */
export function applicableGovernedConstraintsFor(args: {
  readonly action: string;
  readonly tenantId: string;
  readonly holderRef: string;
  readonly resource: { readonly kind: string; readonly id: string };
  readonly governedRight: GovernedRightType;
  readonly constraints: readonly GovernedAuthorityEncumbrance[];
  readonly at: string;
}): {
  readonly applicability: GovernedConstraintApplicability;
  readonly applicable: readonly GovernedAuthorityEncumbrance[];
} {
  const applicability = resolveGovernedConstraintApplicability(args);

  if (applicability.status === 'constraint_state_invalid') {
    throw new AuthorityGovernanceError(
      'GOVERNED_AUTHORITY_CONSTRAINT_STATE_INVALID',
      `A persistent constraint standing over '${args.holderRef}' cannot be classified, so Soberanía cannot prove this action respects it; refusing rather than treating it as unrelated.`,
      {
        tenantId: args.tenantId,
        holderRef: args.holderRef,
        governedRight: args.governedRight,
        action: args.action,
        constraints: applicability.invalid.map((entry) => entry.constraintId),
      },
    );
  }

  const applicableIds = new Set(applicability.applicable.map((entry) => entry.constraintId));
  return { applicability, applicable: args.constraints.filter((constraint) => applicableIds.has(constraint.id)) };
}

/** The applicable constraints reduced to audit references — constraint ids, classes and why each bears on the action. What a denial carries so it can be explained without any stored row reaching a caller. */
export function governedConstraintEvidence(applicability: GovernedConstraintApplicability): readonly Readonly<Record<string, unknown>>[] {
  return applicability.applicable.map((entry) => ({
    constraintId: entry.constraintId,
    constraintClass: entry.constraintClass,
    sourceAction: entry.sourceAction,
    applicability: entry.applicability,
  }));
}
