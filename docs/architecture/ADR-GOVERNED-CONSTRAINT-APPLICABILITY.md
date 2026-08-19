# ADR: Governed constraint applicability and inter-action compatibility

- Status: accepted
- Supersedes: `ADR-GOVERNED-ENCUMBRANCE-RELEASE.md` §"Not an inter-action
  conflict policy" (**identified, not built**), and
  `ADR-GOVERNED-AUTHORITY-ENCUMBRANCE.md`'s statement that an encumbrance
  "does not by itself decide which future actions conflict"
- Related: `ADR-GOVERNED-AUTHORITY-ENCUMBRANCE.md`,
  `ADR-GOVERNED-ENCUMBRANCE-RELEASE.md`,
  `ADR-GOVERNED-AUTHORITY-RESERVATION.md`,
  `ADR-GOVERNED-AUTHORITY-TRANSITION.md`,
  `ADR-HOLDER-BOUND-REPRESENTATIVE-AUTHORITY.md`,
  `ADR-COLLATERALIZE-ACTION.md`, `ADR-TRANSFER-ACTION.md`
- Scope: `@aoc-enterprise/governed-authority`,
  `src/enterprise/authority-governance/`, `src/kernel/`
- **An applicability foundation.** Not a sixth governed action. Not a rules
  engine. Not a lien priority model. Not a legal interpretation. Not `DELEGATE`.
  No Protocol change.

## Context: the gap the release phase left open, deliberately

`ADR-GOVERNED-ENCUMBRANCE-RELEASE.md` scoped itself explicitly out of
inter-action policy, and the encumbrance contract had said the same thing from
the start:

> **Not an inter-action conflict policy.** The record says a portion of the
> holder's authority is constrained; it does not by itself decide which future
> actions conflict.

So Soberanía could answer "what does Alice hold?", "what is reserved?", "what is
persistently constrained?" and "may that constraint be released?" — and could not
answer, in any declared way, **what an active constraint means for a different
governed action.**

## Measurement: the pre-change action × constraint matrix

Measured before any source change, against the real Kernel, Recognition Runtime,
Authority Graph, Approval Runtime, Governance Store, Governed Authority Store and
the five mandate stores.

State: Alice holds 5 000 bp `economic-interest` and 10 000 bp `usage-right`; one
**active** 4 000 bp collateral constraint stands over the economic interest,
created by a fully governed `COLLATERALIZE` whose execution was confirmed.

```
                                         outcome    where it was decided
COLLATERALIZE  4 000  economic-interest  DENIED     acquireReservation capacity gate
                                                    GOVERNED_AUTHORITY_AVAILABILITY_INSUFFICIENT
COLLATERALIZE  1 000  economic-interest  allowed
TRANSFER         500  economic-interest  allowed
TRANSFER       1 000  economic-interest  allowed    (exact boundary)
TRANSFER       2 000  economic-interest  DENIED     acquireReservation capacity gate
                                                    GOVERNED_AUTHORITY_AVAILABILITY_INSUFFICIENT
TRANSFER       5 000  economic-interest  DENIED     same
TRANSFER       5 000  usage-right        allowed    different right
TOKENIZE       1 000  economic-interest  allowed    authority store never consulted
TOKENIZE       5 000  economic-interest  allowed    authority store never consulted
LICENSE          n/a  usage-right        allowed    authority store never consulted
LICENSE        5 000  economic-interest  allowed    authority store never consulted
RELEASE_ENCUMBRANCE  target constraint   allowed
```

Three findings drove the design.

**Finding 1 — the rules were emergent, not declared.** `computeCapacity` was
action-agnostic (`available = held − reservations − encumbrances`) and
`acquireReservation` called it for every action. So a constraint reduced whatever
asked next, and nothing anywhere stated that it should.

**Finding 2 — `TRANSFER` was bounded at the capacity gate, not by the Phase 5.5
structural guard.** `assertRemainingScopeCoversEncumbrances` runs in
`applyTransition` at execution time, and in practice never fires for a mandate
issued through the request path, because the request-time capacity gate already
bounded it. Both compute `held − encumbered` and therefore agree numerically —
but they are different facts, and only one of them was reachable.

**Finding 3 — `TOKENIZE` and `LICENSE` had no relationship to constraints at
all**, correctly, because they never call the authority store. `TOKENIZE 5 000`
was allowed with 4 000 constrained.

## Decision

### 1. A typed constraint class, derived rather than persisted

`GovernedAuthorityConstraintClass` — a closed union, one member today:
`'collateral-commitment-capacity'`. Derived from `sourceAction` by a total
function; nothing is stored.

**`sourceAction` determines applicability today: PARTIALLY.** It is the sole
*input* to the derivation, and it is a safe closed-world assumption right now
because `recordEncumbrance` already refuses any `sourceAction` not classified as
encumbering — `'collateralize'` is the only value the write path can produce, and
a store-contract test pins that for every other action. But the class is kept as
a separate concept because the two come apart the moment one action produces more
than one kind of constraint (exclusive versus non-exclusive `LICENSE` is the near
case), and keying applicability on the class means that variant adds a class and a
registry row instead of an `if` inside generic accounting.

Rejected: persisting the class. It would be a second source of truth an import or
restore could leave disagreeing with `sourceAction`, and it would require a schema
change, a digest change and a migration for no gain.

### 2. A per-action applicability profile registry

`GovernedActionConstraintProfile` — four independent facts per action, not a
boolean: `producesConstraintClass`, `consumesConstraintClasses`,
`constrainsHolderTransition`, `terminalizesTargetConstraint`.

The registry lives next to the three existing classification lists
(`GOVERNED_AUTHORITY_CONSERVING_ACTIONS`, `…_ENCUMBERING_ACTIONS`,
`…_RELEASING_ACTIONS`) in the generic authority accounting layer, and
`assertGovernedActionProfilesComplete` refuses a registry that has drifted from
them. `ActionDescriptor` was deliberately **not** extended: it is a request shape,
not a behaviour registry, and putting action semantics there would have made the
Kernel's request contract the home of authority accounting rules.

### 3. One pure evaluator, called from inside every commit boundary

`evaluateGovernedConstraintApplicability` is pure, total and order-independent.
`applicableGovernedConstraintsFor` wires the registry and classifier into it and
is the single entry point every enforcement site uses.

It is called **inside** each store's critical section, against the records read
there — `acquireReservation`, `recordEncumbrance` and (via the pre-existing
structural guard) `applyTransition`. No new read happens outside a transaction,
so the commit-time revalidation guarantee of Phases 5.4 and 5.5 is preserved
rather than re-introduced.

`computeCapacity` became `computeActionCapacity(position, reservations,
allEncumbrances, applicableEncumbrances, at)`, with `computeCapacity` retained as
the two-lists-equal case for `resolveAvailability`. The split matters: the full
set is used for the reservation-to-encumbrance netting, which is about one
mandate's own handoff and has nothing to do with which action is asking; the
applicable subset is what reduces the action's capacity. Filtering the netting
input would double-count an already-carved-out instalment.

### 4. Behaviour preserved exactly

Every measured outcome above is unchanged, because both actions that reach the
authority store subtract the same constraints — `COLLATERALIZE` by class match,
`TRANSFER` by class-agnostic structural coverage. What changed is that each is now
declared and explainable, and the two are recorded as different facts.

`TRANSFER` was deliberately **not** given `consumesConstraintClasses:
['collateral-commitment-capacity']` merely to reproduce the bound. That would
assert something untrue — that transferring commits collateral — and would give
the wrong answer for the first future constraint class that a transfer should not
consume. It is `constrainsHolderTransition: true` instead, which is what it
actually is, and which is class-agnostic because a holder's remaining authority
must cover *whatever* is attached to her.

The public reason code for a `TRANSFER` capacity refusal stays
`GOVERNED_AUTHORITY_AVAILABILITY_INSUFFICIENT` rather than becoming a structural
code. Changing it would have been a semantic regression for integrators for no
security gain; the distinction is carried in typed evidence
(`constraintApplicability`, `applicableConstraints`) instead, which keeps the
public taxonomy compact.

### 5. Unknown pairs fail closed, one way

An action that reaches the authority accounting layer with no declared profile is
refused (`GOVERNED_AUTHORITY_CONSTRAINT_APPLICABILITY_UNDECLARED`). An active
constraint that cannot be classified stops the question
(`GOVERNED_AUTHORITY_CONSTRAINT_STATE_INVALID`).

Both are bounded by the existing enrolment boundary and do not widen it: a
resource this deployment holds no governed authority for never reaches the layer,
and `TOKENIZE` and `LICENSE` — which never call the store — are unaffected. So
fail-closed here cannot break a deployment that has not adopted governed
authority, while a future sixth action cannot quietly commit authority a
constraint already accounts for.

Rejected: defaulting an unknown class to non-applicable (silent fail-open on
exactly the state that most needs attention), and defaulting an unknown action to
"constrained by everything" (would deny legitimate actions for a configuration
error, and still would not say what the action means).

### 6. Business compatibility goes to policy, through a third narrow Kernel port

`GovernedConstraintProvider` — optional, resolved before the wrapped engine runs
because the policy pack preflight is synchronous, and injected into
`policyEvaluationInput.metadata` under `aoc.governedConstraints`.

It produces **facts and no verdict**. Unlike its two sibling ports it cannot deny,
narrow or rescue anything; its whole effect is that a typed summary reaches the
deployment's policy. A failure reports `resolved: false` rather than an empty
constraint set, so a policy can tell "none stand" from "none were read", and a
failure does not deny — denying because an *explanation* could not be assembled
would refuse requests the authority layer would have allowed, while protecting
nothing it does not already protect.

The policy view carries constraints that stand over the authority the request
engages **including those that do not apply to the action**, with
`applicability: []`. Withholding them was tried and rejected: it made a
deployment's most obvious rule — "require approval to tokenize collateralized
authority" — inexpressible. Soberanía declines to invent that rule; it must not also
hide the fact the rule needs. Constraints bound to another tenant, holder,
resource or right are not disclosed at all, and no scope, mandate, execution,
holder or party crosses the boundary.

Zero action services were modified. All five actions get policy visibility from
one port.

### 7. No default business or legal rule

Soberanía ships no rule connecting collateral to transfer, tokenization or licensing.
The suite proves a deployment can add one (deny `TRANSFER`, require approval for
`TOKENIZE`) and that a policy allowing everything still cannot buy committed
capacity or make a structurally impossible transition possible.

## Hard invariants policy cannot override

1. Same-class capacity conservation.
2. Structural holder/constraint coverage.
3. Constraint state integrity — corrupt or unclassifiable fails closed.
4. Tenant, holder, resource and right binding.

Policy may narrow a viable action to denied or approval-required. It may never
widen, and it never mutates constraint state.

## Migration, integrity, restart

**None required.** No schema change (store schema stays
`aoc.governed-authority-store.schema.v4`), no digest change, no new persisted
field. A database written by the previous phase opens and behaves identically,
proved by a durability test that writes with one process and re-derives
applicability in a second.

## Consequences

**Gained.** One canonical, typed, explainable applicability model; the
capacity/structural/policy distinction made real; fail-closed unknown class and
unknown action; a mechanism for deployment inter-action policy that cannot
weaken conservation; explicit classification required before a future action can
participate.

**Not gained, and deliberately.** No constraint migration on transfer — a
transition that would strand a constraint is still refused rather than resolved by
moving it. No priority or ranking. No automatic resolution or automatic release.
No partial release. No `TOKENIZE` or `LICENSE` persistent constraints. No
exclusivity model. No portable cross-deployment constraint policy — proving to a
remote deployment not merely that constraint C exists but how its action A must
read it is a genuinely different problem, and the only thing that would eventually
justify a Protocol change here.

**Costs.** Two new reason codes. A third optional Kernel port. `computeCapacity`
gained an action-aware sibling. A registry that must be extended deliberately
when a sixth governed action arrives — which is the point, not the cost.

## Alternatives rejected

| alternative | why not |
| --- | --- |
| Hard-coded action × `sourceAction` matrix | scattered, untyped, and grows quadratically with actions |
| Policy-only evaluation | policy would have to maintain numeric conservation; a permissive policy could then overcommit authority |
| `ActionDescriptor` extension | turns a request contract into a behaviour registry, and puts authority accounting in the Kernel's public request shape |
| Boolean `conflicts` per constraint | cannot distinguish capacity from structural from unrelated; the first action with one property but not the other breaks silently |
| Generic rule DSL | explicitly out of scope; the deployment's existing policy machinery is sufficient |
| Persisted constraint class | second source of truth, schema change, digest change, migration, no gain |
