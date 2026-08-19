/**
 * How much of a governed right an authorization concerns, as an exact
 * quantity.
 *
 * `'proportional'` expresses a share as an integer count of basis points
 * (1/100th of a percent), so 25% is `2500` and the whole is `10000`.
 * `'unitized'` expresses a fixed count of named entitlement units for rights
 * that are not naturally proportional. Integers throughout, never
 * floating-point percentages: `0.1 + 0.2 !== 0.3` in IEEE-754, and a quantity
 * that is compared for containment — and, in two of four actions, *summed
 * across executions* — must compare and add exactly.
 *
 * A discriminated union rather than a bag of optional fields, so "a scope that
 * is somehow both 20% and 500 units" is unrepresentable.
 *
 * ## What is generic here, and what is emphatically not
 *
 * Four enforcements produced a byte-identical scope *type* and four different
 * answers about how to use it. The type is extracted; the policy is not, and
 * this split is the audit's most useful negative result:
 *
 * ```
 *                 required?   accumulates?
 * TOKENIZE        yes         no      (an issuance ceiling)
 * COLLATERALIZE   yes         yes     (encumbering a finite right exhausts it)
 * LICENSE         NO          no      ("display for 12 months" has no fraction)
 * TRANSFER        yes         yes     (what has left cannot leave again)
 * ```
 *
 * A generic scope that was mandatory would corrupt `LICENSE`; one that
 * accumulated would corrupt `TOKENIZE` and `LICENSE`; one that never
 * accumulated would corrupt `COLLATERALIZE` and `TRANSFER`. So this module
 * exports the value type and the three total functions over it, and each
 * action decides for itself whether a scope is required and whether it is
 * consumed. `governedRightsScopeSum` is offered to all four and used by two.
 *
 * Note also that presence is a *third* concern the actions disagree on:
 * `LICENSE` treats an absent scope as "not fractionally expressed" —
 * emphatically not 100% — and refuses to compare it against a present one.
 * That refusal is licence-specific and lives there, because it is a statement
 * about permissions rather than about quantities.
 */
export type GovernedRightsScope =
  | { readonly kind: 'proportional'; readonly basisPoints: number }
  | { readonly kind: 'unitized'; readonly units: number; readonly unitDenomination: string };

/** The whole of a right, expressed proportionally. Provided so "100%" never has to be spelled as a magic number at call sites. */
export const GOVERNED_RIGHTS_SCOPE_FULL_BASIS_POINTS = 10_000 as const;

export function governedRightsScopeEquals(a: GovernedRightsScope, b: GovernedRightsScope): boolean {
  if (a.kind === 'proportional') return b.kind === 'proportional' && a.basisPoints === b.basisPoints;
  return b.kind === 'unitized' && a.units === b.units && a.unitDenomination === b.unitDenomination;
}

/**
 * Whether `inner` is fully contained by `outer`. Scopes of different kinds are
 * never comparable: a proportional share and a unit count describe different
 * quantities, and silently coercing between them is exactly the escalation
 * this function exists to prevent. Unitized scopes must also agree on
 * `unitDenomination` — 500 of one unit is not 500 of another, and Soberanía holds no
 * conversion between two opaque labels.
 */
export function governedRightsScopeWithin(inner: GovernedRightsScope, outer: GovernedRightsScope): boolean {
  if (inner.kind === 'proportional') return outer.kind === 'proportional' && inner.basisPoints <= outer.basisPoints;
  return outer.kind === 'unitized' && inner.unitDenomination === outer.unitDenomination && inner.units <= outer.units;
}

/**
 * Adds two commensurable scopes, or returns `null` when they are not
 * commensurable (different kinds, or unitized scopes with different
 * denominations).
 *
 * Integer arithmetic only. A `null` return must be propagated by the caller as
 * a refusal, never as an assumed zero: it means two quantities that cannot be
 * added were about to be, and continuing would record a total nothing could
 * justify.
 *
 * Used by the two actions whose quantity is consumed rather than merely
 * bounded — `COLLATERALIZE`, where encumbering a finite right twice exhausts
 * it, and `TRANSFER`, where a portion that has left the holder cannot leave
 * again.
 */
export function governedRightsScopeSum(a: GovernedRightsScope, b: GovernedRightsScope): GovernedRightsScope | null {
  if (a.kind === 'proportional' && b.kind === 'proportional') {
    return { kind: 'proportional', basisPoints: a.basisPoints + b.basisPoints };
  }
  if (a.kind === 'unitized' && b.kind === 'unitized' && a.unitDenomination === b.unitDenomination) {
    return { kind: 'unitized', units: a.units + b.units, unitDenomination: a.unitDenomination };
  }
  return null;
}

/** Projects a scope to a plain, field-ordered object, so every action serializes the same quantity identically. */
export function serializeGovernedRightsScope(scope: GovernedRightsScope): GovernedRightsScope {
  return scope.kind === 'proportional'
    ? { kind: 'proportional', basisPoints: scope.basisPoints }
    : { kind: 'unitized', units: scope.units, unitDenomination: scope.unitDenomination };
}
