import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  evaluateGovernedConstraintApplicability,
  toGovernedConstraintPolicyContext,
  UNRESOLVED_GOVERNED_CONSTRAINT_POLICY_CONTEXT,
  type GovernedActionConstraintProfile,
  type GovernedAuthorityEncumbrance,
} from '@aoc-enterprise/governed-authority';
import { GOVERNED_RIGHT_TYPES, type GovernedRightType, type GovernedRightsScope } from '@aoc-enterprise/governed-authorization';

import type { GovernedAuthorityPosition } from '@aoc-enterprise/governed-authority';

import {
  assertGovernedActionProfilesComplete,
  governedActionConstraintProfile,
  governedConstraintClassOf,
  requireGovernedActionConstraintProfile,
  resolveGovernedConstraintApplicability,
  COLLATERAL_COMMITMENT_CAPACITY,
  GOVERNED_ACTION_CONSTRAINT_PROFILES,
} from '../authority-governance/constraint-applicability.js';
import {
  computeActionCapacity,
  GOVERNED_AUTHORITY_ENCUMBERING_ACTIONS,
  GOVERNED_AUTHORITY_RELEASING_ACTIONS,
} from '../authority-governance/encumbrance-lifecycle.js';
import { isAuthorityGovernanceError } from '../authority-governance/errors.js';
import { GOVERNED_AUTHORITY_CONSERVING_ACTIONS } from '../authority-governance/reservation-lifecycle.js';

/**
 * The applicability layer as a pure function, with no store, clock or runtime
 * anywhere near it.
 *
 * What is being pinned here is the thing the whole phase turns on: that "a
 * constraint exists" and "the constraint applies to this action" are two
 * different statements, and that the second is decided by a declared profile
 * rather than by which helper an action happened to share. Every binding
 * dimension is tested for *non*-applicability as well as applicability,
 * because the failure that matters is not a constraint wrongly applied — that
 * denies something and somebody notices — but a constraint wrongly dismissed.
 */

const ECONOMIC = GOVERNED_RIGHT_TYPES.ECONOMIC_INTEREST;
const USAGE = GOVERNED_RIGHT_TYPES.USAGE_RIGHT;

const AT = '2026-01-01T00:00:00.000Z';
const TENANT = 'org-a';
const HOLDER = 'party-alice';
const RESOURCE = { kind: 'asset', id: 'asset-a' } as const;

function bp(basisPoints: number): GovernedRightsScope {
  return { kind: 'proportional', basisPoints };
}

/**
 * A constraint record shaped exactly as the store writes them.
 *
 * `digest` is a placeholder and deliberately never consulted: the evaluator is
 * a pure function over already-verified records, and integrity is asserted by
 * the store on read (`assertEncumbranceIntegrity`) before anything reaches
 * here. Two separate defences, and folding them together would mean either the
 * evaluator re-deriving digests it has no business computing, or the store
 * trusting a row it never checked.
 */
function constraint(overrides: Partial<GovernedAuthorityEncumbrance> = {}): GovernedAuthorityEncumbrance {
  return {
    id: 'constraint-1',
    tenantId: TENANT,
    holderRef: HOLDER,
    resourceKind: RESOURCE.kind,
    resourceId: RESOURCE.id,
    governedRight: ECONOMIC,
    scope: bp(4_000),
    sourceAction: 'collateralize',
    sourceMandateRef: 'mandate-1',
    sourceExecutionRef: 'execution-1',
    effectiveFrom: AT,
    status: 'active',
    idempotencyKey: 'execution-1:economic-interest',
    createdAt: AT,
    updatedAt: AT,
    digest: 'sha256:placeholder',
    ...overrides,
  };
}

function evaluate(action: string, constraints: readonly GovernedAuthorityEncumbrance[], governedRight: GovernedRightType = ECONOMIC) {
  return resolveGovernedConstraintApplicability({ action, tenantId: TENANT, holderRef: HOLDER, resource: RESOURCE, governedRight, constraints, at: AT });
}

// ---------------------------------------------------------------------------
// 1. The registry. Every canonical action classified, deliberately.
// ---------------------------------------------------------------------------

describe('Constraint applicability — the action profile registry', () => {
  it('1. classifies all five canonical governed actions and nothing else', () => {
    assert.deepEqual(
      GOVERNED_ACTION_CONSTRAINT_PROFILES.map((profile) => profile.action).sort(),
      ['collateralize', 'license', 'release-encumbrance', 'tokenize', 'transfer'],
    );
  });

  it('2. TRANSFER is structural and consumes no class — it is not "collateral blocks transfer"', () => {
    const profile = requireGovernedActionConstraintProfile('transfer', {});
    assert.equal(profile.constrainsHolderTransition, true);
    assert.deepEqual(profile.consumesConstraintClasses, []);
    assert.equal(profile.producesConstraintClass, null);
    assert.equal(profile.terminalizesTargetConstraint, false);
  });

  it('3. COLLATERALIZE produces and consumes one class, and performs no authority transition', () => {
    const profile = requireGovernedActionConstraintProfile('collateralize', {});
    assert.equal(profile.producesConstraintClass, COLLATERAL_COMMITMENT_CAPACITY);
    assert.deepEqual(profile.consumesConstraintClasses, [COLLATERAL_COMMITMENT_CAPACITY]);
    assert.equal(profile.constrainsHolderTransition, false);
    assert.equal(profile.terminalizesTargetConstraint, false);
  });

  it('4. TOKENIZE and LICENSE carry no generic rule in either direction', () => {
    for (const action of ['tokenize', 'license']) {
      const profile = requireGovernedActionConstraintProfile(action, {});
      assert.deepEqual(profile.consumesConstraintClasses, [], `${action} consumes no constraint class`);
      assert.equal(profile.producesConstraintClass, null, `${action} produces no constraint class`);
      assert.equal(profile.constrainsHolderTransition, false, `${action} performs no authority transition`);
      assert.equal(profile.terminalizesTargetConstraint, false);
    }
  });

  it('5. RELEASE_ENCUMBRANCE terminalizes its target and is engaged by nothing', () => {
    const profile = requireGovernedActionConstraintProfile('release-encumbrance', {});
    assert.equal(profile.terminalizesTargetConstraint, true);
    assert.deepEqual(profile.consumesConstraintClasses, []);
    assert.equal(profile.constrainsHolderTransition, false);
  });

  it('6. the registry agrees with the three classification lists it must not drift from', () => {
    assert.doesNotThrow(() =>
      assertGovernedActionProfilesComplete(GOVERNED_ACTION_CONSTRAINT_PROFILES.map((profile) => profile.action)),
    );
    // And the lists themselves are still what the profiles were measured
    // against, so a change to either side fails here rather than silently.
    assert.deepEqual([...GOVERNED_AUTHORITY_CONSERVING_ACTIONS], ['transfer']);
    assert.deepEqual([...GOVERNED_AUTHORITY_ENCUMBERING_ACTIONS], ['collateralize']);
    assert.deepEqual([...GOVERNED_AUTHORITY_RELEASING_ACTIONS], ['release-encumbrance']);
  });

  it('7. a future action with no declared profile is refused, never assumed unrelated', () => {
    assert.equal(governedActionConstraintProfile('delegate'), null);
    assert.throws(
      () => requireGovernedActionConstraintProfile('delegate', {}),
      (error: unknown) => isAuthorityGovernanceError(error) && error.code === 'GOVERNED_AUTHORITY_CONSTRAINT_APPLICABILITY_UNDECLARED',
    );
  });
});

// ---------------------------------------------------------------------------
// 2. Classification. Derived, total, and null for anything else.
// ---------------------------------------------------------------------------

describe('Constraint applicability — the constraint class', () => {
  it('8. is derived from the only source action the write path can produce', () => {
    assert.equal(governedConstraintClassOf('collateralize'), COLLATERAL_COMMITMENT_CAPACITY);
  });

  it('9. is null — never a default — for anything else', () => {
    for (const action of ['transfer', 'tokenize', 'license', 'release-encumbrance', 'delegate', '']) {
      assert.equal(governedConstraintClassOf(action), null, `'${action}' has no constraint class`);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Applicability per action, against one active collateral constraint.
// ---------------------------------------------------------------------------

describe('Constraint applicability — the five actions against a collateral constraint', () => {
  it('10. COLLATERALIZE is capacity-constrained', () => {
    const result = evaluate('collateralize', [constraint()]);
    assert.equal(result.status, 'capacity_constrained');
    assert.equal(result.applicable.length, 1);
    assert.deepEqual(result.applicable[0]?.applicability, ['capacity']);
    assert.equal(result.applicable[0]?.constraintClass, COLLATERAL_COMMITMENT_CAPACITY);
  });

  it('11. TRANSFER is structurally constrained — a different fact producing the same bound', () => {
    const result = evaluate('transfer', [constraint()]);
    assert.equal(result.status, 'structurally_constrained');
    assert.deepEqual(result.applicable[0]?.applicability, ['structural']);
  });

  it('12. TOKENIZE and LICENSE are unconstrained, and the constraint is reported as considered', () => {
    for (const action of ['tokenize', 'license']) {
      const result = evaluate(action, [constraint()]);
      assert.equal(result.status, 'unconstrained', `${action} has no generic rule against a collateral constraint`);
      assert.equal(result.applicable.length, 0);
      // Dismissed explicitly, with the class named, rather than silently
      // dropped: an explanation must be able to say which constraints were
      // looked at and why each was set aside.
      assert.deepEqual(result.nonApplicable, [
        { constraintId: 'constraint-1', constraintClass: COLLATERAL_COMMITMENT_CAPACITY, sourceAction: 'collateralize', governedRight: ECONOMIC, reason: 'class_not_engaged' },
      ]);
    }
  });

  it('13. RELEASE_ENCUMBRANCE is unconstrained by the very constraint it targets — no circularity, and no general exemption', () => {
    const result = evaluate('release-encumbrance', [constraint()]);
    assert.equal(result.status, 'unconstrained');
    assert.equal(result.applicable.length, 0);
    // Not because releasing is exempt, but because it consumes no class and
    // moves no authority. The reason is recorded, so the difference is visible.
    assert.equal(result.nonApplicable[0]?.reason, 'class_not_engaged');
  });
});

// ---------------------------------------------------------------------------
// 4. Binding. Four dimensions, none of them ever crossed.
// ---------------------------------------------------------------------------

describe('Constraint applicability — binding', () => {
  it('14. a constraint over another holder does not reach this one', () => {
    const result = evaluate('collateralize', [constraint({ holderRef: 'party-bob' })]);
    assert.equal(result.status, 'unconstrained');
    assert.deepEqual(result.nonApplicable, [{ constraintId: 'constraint-1', reason: 'different_binding' }]);
  });

  it('15. a constraint over another resource does not reach this one', () => {
    const result = evaluate('collateralize', [constraint({ resourceId: 'asset-b' })]);
    assert.equal(result.status, 'unconstrained');
    assert.equal(result.nonApplicable[0]?.reason, 'different_binding');
  });

  it('16. a constraint in another tenant does not reach this one', () => {
    const result = evaluate('collateralize', [constraint({ tenantId: 'org-b' })]);
    assert.equal(result.status, 'unconstrained');
    assert.equal(result.nonApplicable[0]?.reason, 'different_binding');
  });

  it('17. an economic-interest constraint does not reach a usage-right request — there is no cross-right hierarchy', () => {
    const result = evaluate('collateralize', [constraint()], USAGE);
    assert.equal(result.status, 'unconstrained');
    assert.equal(result.nonApplicable[0]?.reason, 'different_binding');
  });
});

// ---------------------------------------------------------------------------
// 5. Lifecycle. Released and pending constraints bear on nothing.
// ---------------------------------------------------------------------------

describe('Constraint applicability — lifecycle', () => {
  it('18. a released constraint constrains nothing', () => {
    const released = constraint({ status: 'released', releasedAt: AT, releaseBasis: 'administrative', releasedBy: 'actor-admin', releaseReasonCode: 'withdrawal' });
    const result = evaluate('collateralize', [released]);
    assert.equal(result.status, 'unconstrained');
    assert.deepEqual(result.nonApplicable, [{ constraintId: 'constraint-1', reason: 'not_constraining' }]);
  });

  it('19. a constraint that has not begun constrains nothing yet', () => {
    const result = evaluate('collateralize', [constraint({ effectiveFrom: '2026-06-01T00:00:00.000Z' })]);
    assert.equal(result.status, 'unconstrained');
    assert.equal(result.nonApplicable[0]?.reason, 'not_constraining');
  });
});

// ---------------------------------------------------------------------------
// 6. Fail-closed. The one outcome that must never be silently dropped.
// ---------------------------------------------------------------------------

describe('Constraint applicability — unclassifiable constraints fail closed', () => {
  it('20. an active constraint whose class cannot be determined is invalid, not non-applicable', () => {
    const result = evaluate('collateralize', [constraint({ sourceAction: 'some-future-action' })]);
    assert.equal(result.status, 'constraint_state_invalid');
    assert.equal(result.applicable.length, 0);
    assert.equal(result.nonApplicable.length, 0, 'it must not be dismissed');
    assert.deepEqual(result.invalid, [{ constraintId: 'constraint-1', sourceAction: 'some-future-action', reason: 'unknown_constraint_class' }]);
  });

  it('21. it fails closed for every action, including the ones nothing else applies to', () => {
    for (const action of ['transfer', 'tokenize', 'license', 'release-encumbrance']) {
      const result = evaluate(action, [constraint({ sourceAction: 'some-future-action' })]);
      assert.equal(result.status, 'constraint_state_invalid', `${action} must not proceed past an unclassifiable constraint`);
    }
  });

  it('22. an unclassifiable constraint bound to somebody else is still not this holder’s problem', () => {
    // Binding is decided before classification, deliberately. A constraint over
    // another party is dismissed on that ground rather than escalated into an
    // integrity failure that would take down an unrelated holder's requests.
    const result = evaluate('collateralize', [constraint({ holderRef: 'party-bob', sourceAction: 'some-future-action' })]);
    assert.equal(result.status, 'unconstrained');
    assert.equal(result.invalid.length, 0);
  });

  it('23. one unclassifiable constraint invalidates the verdict even beside valid ones', () => {
    const result = evaluate('collateralize', [constraint(), constraint({ id: 'constraint-2', sourceAction: 'unknown' })]);
    assert.equal(result.status, 'constraint_state_invalid');
  });
});

// ---------------------------------------------------------------------------
// 7. Aggregation and determinism.
// ---------------------------------------------------------------------------

describe('Constraint applicability — several constraints', () => {
  it('24. every applicable constraint is reported, and applicability is decided independently per constraint', () => {
    const result = evaluate('collateralize', [
      constraint({ id: 'c-1', scope: bp(3_000) }),
      constraint({ id: 'c-2', scope: bp(2_000) }),
      constraint({ id: 'c-3', holderRef: 'party-bob' }),
      constraint({ id: 'c-4', status: 'released', releasedAt: AT, releaseBasis: 'administrative', releasedBy: 'a', releaseReasonCode: 'r' }),
    ]);
    assert.deepEqual(result.applicable.map((entry) => entry.constraintId), ['c-1', 'c-2']);
    assert.deepEqual(
      result.nonApplicable.map((entry) => [entry.constraintId, entry.reason]),
      [['c-3', 'different_binding'], ['c-4', 'not_constraining']],
    );
  });

  it('25. the verdict does not depend on the order the constraints arrive in', () => {
    const constraints = [
      constraint({ id: 'c-1', scope: bp(3_000) }),
      constraint({ id: 'c-2', scope: bp(2_000) }),
      constraint({ id: 'c-3', governedRight: USAGE }),
      constraint({ id: 'c-4', status: 'released', releasedAt: AT, releaseBasis: 'administrative', releasedBy: 'a', releaseReasonCode: 'r' }),
    ];
    const forward = evaluate('collateralize', constraints);
    const reversed = evaluate('collateralize', [...constraints].reverse());
    const shuffled = evaluate('collateralize', [constraints[2]!, constraints[0]!, constraints[3]!, constraints[1]!]);
    assert.deepEqual(reversed, forward);
    assert.deepEqual(shuffled, forward);
  });
});

// ---------------------------------------------------------------------------
// 8. Synthetic profiles. The shapes no current action has, proved reachable.
// ---------------------------------------------------------------------------

describe('Constraint applicability — profiles no current action has', () => {
  const synthetic = (overrides: Partial<GovernedActionConstraintProfile>): GovernedActionConstraintProfile => ({
    action: 'future-action',
    producesConstraintClass: null,
    consumesConstraintClasses: [],
    constrainsHolderTransition: false,
    terminalizesTargetConstraint: false,
    ...overrides,
  });

  function evaluateWith(profile: GovernedActionConstraintProfile, constraints: readonly GovernedAuthorityEncumbrance[]) {
    return evaluateGovernedConstraintApplicability({
      profile,
      tenantId: TENANT,
      holderRef: HOLDER,
      resource: RESOURCE,
      governedRight: ECONOMIC,
      constraints,
      classify: governedConstraintClassOf,
      at: AT,
    });
  }

  it('26. an action that is both capacity-consuming and structural reports both grounds, not the stronger one alone', () => {
    const result = evaluateWith(
      synthetic({ consumesConstraintClasses: [COLLATERAL_COMMITMENT_CAPACITY], constrainsHolderTransition: true }),
      [constraint()],
    );
    assert.deepEqual(result.applicable[0]?.applicability, ['capacity', 'structural']);
    assert.equal(result.status, 'capacity_constrained', 'the summary names the strongest; the detail keeps both');
  });

  it('27. a structural action is engaged by a constraint of every class, because coverage is class-agnostic', () => {
    // The claim: structural applicability does not ask what kind of constraint
    // it is. A holder's remaining authority must cover whatever is attached to
    // her, and a class this action does not consume is no exception.
    const result = evaluateWith(synthetic({ constrainsHolderTransition: true }), [constraint()]);
    assert.deepEqual(result.applicable[0]?.applicability, ['structural']);
  });

  it('28. an action that consumes a class it does not produce is still capacity-constrained by it', () => {
    const result = evaluateWith(synthetic({ consumesConstraintClasses: [COLLATERAL_COMMITMENT_CAPACITY] }), [constraint()]);
    assert.equal(result.status, 'capacity_constrained');
  });
});

// ---------------------------------------------------------------------------
// 9. The policy view. Bounded, typed, and never a stored row.
// ---------------------------------------------------------------------------

describe('Constraint applicability — the policy context', () => {
  it('29. carries references and classes, and no scope, mandate, execution, holder or party', () => {
    const context = toGovernedConstraintPolicyContext([evaluate('collateralize', [constraint()])]);
    assert.equal(context.resolved, true);
    assert.equal(context.status, 'capacity_constrained');
    assert.deepEqual(context.constraints, [
      { constraintId: 'constraint-1', constraintClass: COLLATERAL_COMMITMENT_CAPACITY, sourceAction: 'collateralize', governedRight: ECONOMIC, applicability: ['capacity'] },
    ]);

    const serialized = JSON.stringify(context);
    for (const leak of ['mandate-1', 'execution-1', 'party-alice', 'basisPoints', 'digest', 'idempotencyKey']) {
      assert.equal(serialized.includes(leak), false, `the policy view must not carry '${leak}'`);
    }
  });

  it('30. reports a standing but unengaged constraint with an empty applicability, rather than withholding it', () => {
    const context = toGovernedConstraintPolicyContext([evaluate('tokenize', [constraint()])]);
    assert.equal(context.resolved, true);
    // Withholding it would make a deployment's most obvious rule — "require
    // approval to tokenize collateralized authority" — inexpressible. Soberanía
    // declines to invent that rule; it must not also hide the fact.
    assert.deepEqual(context.constraints, [
      { constraintId: 'constraint-1', constraintClass: COLLATERAL_COMMITMENT_CAPACITY, sourceAction: 'collateralize', governedRight: ECONOMIC, applicability: [] },
    ]);
    assert.equal(context.status, 'unconstrained', 'and the status still says nothing constrains this action');
  });

  it('30b. a constraint dismissed on binding is not disclosed at all', () => {
    const context = toGovernedConstraintPolicyContext([evaluate('tokenize', [constraint({ holderRef: 'party-bob' })])]);
    assert.deepEqual(context.constraints, [], 'another holder’s constraint is none of this policy’s business');
  });

  it('30c. a released constraint is not disclosed either', () => {
    const released = constraint({ status: 'released', releasedAt: AT, releaseBasis: 'administrative', releasedBy: 'a', releaseReasonCode: 'r' });
    const context = toGovernedConstraintPolicyContext([evaluate('collateralize', [released])]);
    assert.deepEqual(context.constraints, []);
  });

  it('31. distinguishes "none stand" from "none were read"', () => {
    const none = toGovernedConstraintPolicyContext([evaluate('collateralize', [])]);
    assert.equal(none.resolved, true);
    assert.deepEqual(none.constraints, []);
    assert.equal(UNRESOLVED_GOVERNED_CONSTRAINT_POLICY_CONTEXT.resolved, false);
    assert.deepEqual(UNRESOLVED_GOVERNED_CONSTRAINT_POLICY_CONTEXT.constraints, []);
  });

  it('32. takes the strongest status across the rights a multi-right request engages, and does not duplicate a constraint', () => {
    const context = toGovernedConstraintPolicyContext([
      evaluate('collateralize', [constraint()]),
      evaluate('collateralize', [constraint()]),
      evaluate('collateralize', []),
    ]);
    assert.equal(context.status, 'capacity_constrained');
    assert.equal(context.constraints.length, 1);
  });

  it('33. an unclassifiable constraint reaches policy as an invalid state rather than as silence', () => {
    const context = toGovernedConstraintPolicyContext([evaluate('tokenize', [constraint({ sourceAction: 'unknown' })])]);
    assert.equal(context.status, 'constraint_state_invalid');
  });
});

// ---------------------------------------------------------------------------
// 10. Capacity, given an applicability verdict. The fail-open that must not
//     exist, proved against state the write path cannot produce.
// ---------------------------------------------------------------------------

describe('Constraint applicability — capacity never drops a constraint it cannot total', () => {
  const position: GovernedAuthorityPosition = {
    id: 'position-1',
    tenantId: TENANT,
    actorRef: HOLDER,
    resourceKind: RESOURCE.kind,
    resourceId: RESOURCE.id,
    governedRight: ECONOMIC,
    scope: { kind: 'unitized', units: 1_000, unitDenomination: 'share' },
    effectiveFrom: AT,
    lastTransitionRef: 'transition-1',
    createdAt: AT,
    updatedAt: AT,
    digest: 'sha256:placeholder',
  };

  it('34. two applicable constraints that cannot be added report `incompatible`, never a total with one silently missing', () => {
    // The store refuses to *create* such a pair, so this is the imported,
    // restored or migrated state — the one route by which it could exist. The
    // fail-open would be to skip the constraint that does not compare and report
    // 600 units free, silently releasing exactly what a constraint holds.
    const answer = computeActionCapacity(
      position,
      [],
      [],
      [
        constraint({ id: 'c-share', scope: { kind: 'unitized', units: 400, unitDenomination: 'share' } }),
        constraint({ id: 'c-token', scope: { kind: 'unitized', units: 300, unitDenomination: 'token' } }),
      ],
      AT,
    );
    assert.equal(answer.outcome, 'incompatible');
  });

  it('35. constraints that outrun the position report `overencumbered` rather than clamping to zero', () => {
    const answer = computeActionCapacity(
      position,
      [],
      [],
      [constraint({ id: 'c-1', scope: { kind: 'unitized', units: 1_200, unitDenomination: 'share' } })],
      AT,
    );
    assert.equal(answer.outcome, 'overencumbered');
  });

  it('36. a constraint the action is not engaged by reduces nothing, and is not summed into anything', () => {
    // The same two constraints, with an empty applicable list — the shape
    // `TOKENIZE` and `LICENSE` produce. The incommensurability above cannot
    // reach the arithmetic, because the arithmetic never sees them.
    const answer = computeActionCapacity(
      position,
      [],
      [
        constraint({ id: 'c-share', scope: { kind: 'unitized', units: 400, unitDenomination: 'share' } }),
        constraint({ id: 'c-token', scope: { kind: 'unitized', units: 300, unitDenomination: 'token' } }),
      ],
      [],
      AT,
    );
    assert.ok(answer.outcome === 'available');
    assert.deepEqual(answer.available, { kind: 'unitized', units: 1_000, unitDenomination: 'share' });
    assert.equal(answer.encumbered, undefined);
  });
});
