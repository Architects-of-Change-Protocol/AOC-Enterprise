# ADR: Governed authority encumbrance and persistent post-execution constraints

- Status: accepted
- Supersedes: `ADR-GOVERNED-AUTHORITY-RESERVATION.md` §"Explicitly not done" →
  *Governed encumbrance* (**identified, not built**), and its per-action
  classification of `COLLATERALIZE` as
  *`INSUFFICIENT DOMAIN LIFECYCLE TO RESERVE SAFELY`*
- Related: `ADR-GOVERNED-AUTHORITY-RESERVATION.md`,
  `ADR-GOVERNED-AUTHORITY-TRANSITION.md`,
  `ADR-HOLDER-BOUND-REPRESENTATIVE-AUTHORITY.md`,
  `ADR-NATIVE-DELEGATED-CAPABILITIES.md`, `ADR-COLLATERALIZE-ACTION.md`
- Scope: `@aoc-enterprise/governed-authority`,
  `src/enterprise/authority-governance/`,
  `src/enterprise/collateralization-governance/`
- Not a fifth governed action. Not a lien registry. Not an inter-action conflict
  policy. Not a lending lifecycle. No Protocol change.

## Context: the hole reservation could not close

`ADR-GOVERNED-AUTHORITY-RESERVATION.md` withheld reservation from
`COLLATERALIZE` deliberately, and for a reason that was correct at the time:

> Forcing generic reservation onto it would have produced a commitment that
> correctly blocks competing authorizations before execution and then wrongly
> *releases* at execution, at exactly the moment the encumbrance becomes real.

It named the missing piece and did not build it:

> **Governed encumbrance** — identified, not built. `COLLATERALIZE` needs
> committed authority to remain unavailable *after* execution.

That gap was measured before any change in this phase, against the real Kernel,
the real Recognition Runtime, the real Authority Graph, the real Governance
Store and the real mandate store:

```
Alice holds 5 000 bp of the economic interest.

SEQUENTIAL, ACROSS INDEPENDENT MANDATES
  Mandate A   COLLATERALIZE 4 000     allowed, collateralization-mandate-1
  execute A                           committedScope(A) = 4 000
  position                            5 000 bp
  reservations                        none — COLLATERALIZE reserved nothing
  resolveAvailability                 5 000 bp available
  Mandate B   COLLATERALIZE 4 000     ALLOWED, collateralization-mandate-6
  execute B                           committedScope(B) = 4 000
  result                              8 000 bp of live collateral against 5 000 bp

CONCURRENT  Promise.all([4 000, 4 000])
  both allowed, 0 reservations
```

Neither mandate did anything wrong on its own terms. `committedScope` is
mandate-local by construction and documents itself as such; mandate B's
cumulative rule cannot see mandate A's row. The failure is that no state
anywhere answers "how much of this holder's authority is already spoken for by
an arrangement that already exists?"

Unlike the reservation case, this one is **not** bounded by execution-time
conservation. `COLLATERALIZE` never calls `applyTransition`, so nothing
downstream refuses the second arrangement. Both commitments simply stand.

## Decision

Introduce `GovernedAuthorityEncumbrance`: a durable record that a finite
quantity of one holder's underlying authority stands persistently constrained by
one successfully executed governed action, held in the **same store** as
positions and reservations so the pre-execution commitment can be handed over to
it in one commit section.

Reclassify `COLLATERALIZE` as **committing** authority, so it acquires a
reservation before its mandate exists, and as **encumbering** it, so a confirmed
execution converts that reservation into a constraint rather than releasing it.

## Naming

`GovernedAuthorityEncumbrance`, from repository terminology rather than
aesthetics. "Encumbrance" is already the word the collateralization module and
the reservation ADR use for exactly this concept, and the
`GovernedAuthority{Position,Transition,Reservation}` family fixes the prefix.
`PersistentAuthorityConstraint` and `GovernedAuthorityConstraint` were both
accurate and both novel vocabulary for a concept the repository had already
named.

## What is encumbered

Answered precisely, because every loose answer is a legal claim:

> A bounded portion of the **holder's governed authority capacity** — not the
> asset, not ownership, not the governed right itself, and not the
> `GovernedAuthorityPosition`, which is untouched.

Alice with 5 000 bp and a 4 000 bp encumbrance still holds 5 000 bp. What
changed is that only 1 000 bp remains committable.

## Encumbrance versus the five things it is easily confused with

| | What it decides | What an encumbrance says about it |
| --- | --- | --- |
| `GovernedAuthorityPosition` | how much the holder possesses | nothing — it is not reduced |
| `GovernedAuthorityReservation` | how much is promised to a live authorization | it is the *next phase* of one, never a second one |
| `GovernedRepresentativeAuthority` | who may exercise the holder's authority | nothing |
| `AuthorityGrant` / delegation | through what lineage a requester holds the action | nothing |
| ownership / legal title | who owns what, in law | nothing — see "The legal boundary" |

A valid delegation constrains nothing; a valid representation constrains
nothing; a constraint authorizes nobody.

## Where encumbrances live, and why the choice was forced

In `GovernedAuthorityStore`, alongside positions and reservations. Four
alternatives were considered:

| Option | Rejected because |
| --- | --- |
| **A. `GovernedAuthorityStore`** | **chosen** |
| B. adjacent `GovernedAuthorityEncumbranceStore` | capacity is a function of positions, reservations *and* constraints together; splitting the read from the write across stores moves the double commitment one layer up, exactly as it would have for reservations |
| C. inside the CollateralizationMandate store | the whole defect is that mandate-local state cannot see across mandates. Keeping it there would reproduce it |
| D. reuse `committedScope` as the canonical cross-mandate source | it is per-mandate by definition, and widening it to a cross-mandate pool would make one action's bookkeeping the authority ledger for all of them |

Two properties forced A. Capacity must be read and written under one consistency
boundary. And the **handoff** must be one durable step: terminalize the
commitment and record the constraint together, or neither. Split across stores
there would be a window in which the reservation had ended and the constraint
did not yet exist, and a competitor arriving in that window would be told the
authority is free — the exact vulnerability the layer exists to close.

What the store still does not know is which future actions a constraint
conflicts with. It records a quantity against a holder, resource and right;
deciding what actions mean to each other stays out.

## The accounting rule, and why netting rather than either extreme

Capacity is:

```
available = held − Σ(active constraints) − Σ(active commitments, net of the
                                             constraints already carved out of
                                             each under the same mandate)
```

The netting clause is the whole of "one commitment, counted once". A
`COLLATERALIZE` mandate reserves what it authorizes and then executes, possibly
in instalments where its terms permit them:

```
reserved 4 000, encumbered 0       commitment contributes 4 000
reserved 4 000, encumbered 1 000   commitment contributes 3 000, constraint 1 000
reserved 4 000, encumbered 4 000   commitment contributes nothing; terminal
```

Summing the commitment gross would charge the executed instalment twice.
Dropping it entirely on the first instalment would free the 3 000 the mandate may
still legitimately execute — a competitor could take it, and the second
execution would arrive with nowhere to be recorded, leaving an arrangement that
exists externally with no governed state behind it. Netting is the only reading
correct at every point of the lifecycle.

A commitment is terminalized only once the constraints under its mandate cover
the whole of what it reserved.

## Why a fourth reservation status

`'encumbered'` was added rather than reusing `'consumed'`.

`consumed` documents a specific fact: *the position has already been debited*,
so continuing to subtract the commitment would count the same quantity twice.
For `COLLATERALIZE` the position is **not** debited. The invariant that makes
both safe to stop subtracting is the same — something else now accounts for the
quantity — but the facts differ, and the reservation contract's own rationale
for keeping `consumed` and `released` apart ("a reader, and an auditor, must be
able to tell which") applies with equal force here.

Both are terminal and neither may be reopened: releasing either would fabricate
capacity something else already accounts for.

## Lifecycle: two states

`ACTIVE → RELEASED`. No `EXPIRED`, because the record carries no expiry.

This is the point on which the whole model turns. A reservation's `expiresAt` is
required and taken from its mandate, so a commitment never outlives the
authorization justifying it. Setting `encumbrance.expiresAt = mandate.expiresAt`
would have been the obvious symmetry and would have been wrong: mandate expiry
bounds how long an *executor may act*, and says nothing about how long the
arrangement that executor already created continues to exist. An encumbrance
that expired with its mandate would silently free capacity for something still
live externally — the defect, reintroduced on a timer.

No `SUPERSEDED`: that is a relationship between two records, not a property of
one, exactly as the collateralization mandate lifecycle already reasons.

A released record is retained. Capacity derives from the `ACTIVE` set, so
releasing twice cannot double-free.

## Creation basis

A **confirmed execution**, and nothing else — not a request, not a decision, not
an issued mandate. Creation requires an encumbering `sourceAction`, a non-empty
`sourceMandateRef` and `sourceExecutionRef`, a live position, sufficient
capacity, and a matching tenant.

There is deliberately no free-text `reason`. A constraint rooted in caller-
supplied prose would be a constraint a caller could invent; an execution
reference is the one thing a requester cannot fabricate, because recording it
required the mandate store to re-assert the mandate's own authorization against
the reported terms first. `createEncumbrance({holder, scope})` has no public
path, exactly as `bootstrapPosition` has none.

The holder is read from the **reservation the mandate already holds**, never
re-derived. `CollateralizationMandateRecord` records `requestedBy` but no holder
— `EnterpriseCollateralizationTerms` has no field for one — so guessing the
requester would constrain the wrong party whenever a delegated administrator or
representative submitted the request, which is the ordinary case.

A mandate with no reservation records no constraint: it never passed a capacity
gate, so constraining authority nothing ever checked would be worse than
recording nothing.

## Release basis: administrative only, and why that is the honest answer

One basis, `'administrative'`, requiring `context.system`.

`COLLATERALIZE` has `recordRelease`, and it is emphatically not a discharge: no
authority is evaluated, no decision is produced, `reportedBy` is caller-asserted,
and any tenant-scoped caller can call it. The collateralization module already
refuses to let such a report decrement its own `committedScope`, on the stated
grounds that AOC cannot verify an external encumbrance actually ended.

Letting the same unverified report free authority capacity would be that refusal
reversed, and would hand any tenant-scoped caller a way to manufacture headroom
by reporting a release. There is therefore no `'source_release_evidence'` basis.

**Production discharge status: `NOT PRESENT`.** An authorized discharge — with
its own request, decision, authority check and evidence — is a separate governed
action, and inventing one here would be inventing a lending lifecycle the
repository does not have (no maturity, no payoff, no default, no foreclosure, no
valuation). It is reported as a gap rather than faked.

Two non-releases, stated because both are tempting:

- **Mandate expiry does not release.** See "Lifecycle".
- **Mandate revocation after execution does not release.** Revoking withdraws
  authority to create *further* arrangements. Revocation *before* execution is
  different and does return the capacity: there nothing executed, and the
  commitment ends `'released'`.

## Atomicity

One store, one commit section: a synchronous critical section in memory (no
`await` between read and write, so the event loop cannot interleave) and one
`db.transaction(...)` in SQLite. Both are asserted by the same shared contract
suite, which is what makes the in-memory pass evidence about the durable one.

Two properties are asserted directly:

- **No capacity gap.** A competing acquisition attempted concurrently with a
  handoff never succeeds; before the handoff it loses to the commitment, after
  it to the constraint, and there is no third moment.
- **No double count.** Across the whole T0→T3 trace the free figure is
  `5 000 → 1 000 → 1 000 → 5 000`. Never 5 000 in the middle (a gap), never
  lower again (a double charge).

## Cross-store consistency, stated rather than papered over

The mandate store and the Governance Store are separate databases. No global
ACID is claimed. The ordering is:

```
1  reservation acquired            (authority store)
2  mandate issued                  (mandate store)      — compensating release on failure
3  external execution happens      (outside AOC)
4  execution evidence recorded     (mandate store, re-asserted against the mandate)
5  reservation -> encumbrance      (authority store, one transaction)
```

Step 5 after step 4, deliberately. A constraint recorded before the arrangement
is known to exist would constrain authority for something that may never have
happened; a constraint recorded after evidence is committed can at worst be
missing after a crash.

### Crash matrix

| State | Safe? | Capacity | Recovery |
| --- | --- | --- | --- |
| A. reservation active, execution not attempted | yes | held | lapses at `expiresAt`, or released on revocation |
| B. reservation active, external execution failed | yes | held | as A; nothing to record |
| C. reservation active, external outcome unknown | yes — **conservatively** | held | capacity stays unavailable until the outcome is known. Never released on an unknown |
| D. execution succeeded and recorded, constraint missing | yes — **conservatively** | held by the still-active reservation | re-record the execution: creation is idempotent on the execution reference, so the handoff completes exactly once |
| E. constraint active, reservation terminal | yes | held by the constraint | steady state |
| F. constraint released | yes | returned | steady state |

D is the window step 5 opens, and it is the safe side of the trade: the
capacity remains unavailable rather than becoming falsely free, the state
describes itself (an active reservation over an executed mandate), and the fix
is an ordinary idempotent retry rather than database surgery. Asserted directly:
a mandate that committed capacity in one process has its handoff completed in a
second process opened over the same files.

**No background job is required for correctness.** Unsafe capacity stays blocked
until recovery happens; nothing is freed by a reconciler failing to run.

## Structural consistency with authority-changing transitions

Constraints are holder-bound and do not follow authority to a recipient. A
transition is therefore refused when the source would be left holding less than
the constraints standing over it:

```
held 5 000, encumbered 4 000
  TRANSFER   500  ->  keeps 4 500  ->  proceeds
  TRANSFER 2 000  ->  keeps 3 000  ->  GOVERNED_AUTHORITY_ENCUMBRANCE_UNCOVERED
```

The distinction this rests on is the whole reason it is acceptable:

- **Business rule** — *"collateralized property cannot be transferred"*. AOC
  holds no such rule and does not invent one. A real asset may well be
  transferable subject to a lien, and deciding that is domain and legal policy.
- **Structural invariant** — *"AOC may not hold a constraint referring to
  authority its holder no longer possesses"*. That is about AOC's own state
  being coherent, and it is what is enforced.

The three candidate strategies were: (A) this precondition, (B) deny only
specific proven-incompatible shapes, (C) model constraint migration. C is a
substantive decision about what an encumbrance *means* when the underlying right
changes hands, and is far larger than this phase; B is A with the general case
left corruptible. A was chosen, and it leaves the eventual policy free to choose
either way — including choosing C later, at which point the guard relaxes rather
than being contradicted.

A completed transfer never carries a constraint to the recipient. Asserted as a
negative.

## Inter-action conflict boundary

`DEFERRED_INTER_ACTION_CONFLICT_POLICY` stands. No rule was invented that
collateralizing conflicts with tokenizing, licensing, or transferring *as a
matter of what those actions mean*.

One capacity pool per holder/resource/right is used rather than a
`constraintClass` taxonomy, and the reason is that every refusal it produces is
derivable from the structural invariant plus the reservation model's own
existing rule that "two commitments against the same right compete whatever
action made them". Concretely, only `TRANSFER` and `COLLATERALIZE` touch the
pool at all; `TOKENIZE` and `LICENSE` never consult it. Adding a class taxonomy
would have introduced a general matching language ahead of a second consumer for
it — the framework-ahead-of-need the reservation ADR already refused once.

If a future action needs constraints that genuinely do not compete with
collateral, the class dimension is where it goes, and this is the note that says
so.

Explicitly **not** implemented: priority, seniority, first/second lien, pari
passu, statutory ranking. Multiple constraints coexist exactly insofar as the
holder's authority permits, and nothing orders them.

## `committedScope`: final disposition

**`BOOKKEEPING`** — retained, unchanged, and scoped.

It remains the durable basis for one mandate's cumulative-scope containment and
its `additionalCollateralizationAllowed` constraint, which are action-local
rules about what a *single authorization* permits. It is not, and never was,
capable of answering the cross-mandate question, and it is not promoted to it.

The relationship is now explicit and there is exactly one canonical source per
question:

```
CollateralizationMandateRecord.committedScope
    how much has been committed under THIS mandate?      action-local bookkeeping

GovernedAuthorityEncumbrance
    how much of this holder's authority is constrained,  canonical, cross-mandate
    whichever mandate constrained it?
```

Nothing was migrated, deduplicated or made to shadow the other. They answer
different questions and both remain true.

## Historical migration

**`NO PRODUCTION MIGRATION`.** Executions recorded before this phase produce no
constraints, and none is backfilled.

The reason is evidential rather than practical. Creating a constraint from
historical `committedScope` would require knowing the holder whose authority was
committed — which the mandate record does not store, because the terms have no
field for it — and whether the arrangement is *still live*, which AOC cannot
determine, because a reported release is not verifiable. Inventing either would
fabricate the very state the layer exists to make trustworthy.

Deployments needing it have the privileged bootstrap path, under a system
context, with the operator supplying the facts AOC cannot infer.

The schema migration itself is a different matter and is performed: `v1 → v3`
and `v2 → v3`, both additive. The reservations table is rebuilt to widen its
status CHECK, as a **pure copy** — no status reinterpreted, no digest
recomputed, no row given the new state retroactively.

## Integrity, and what it does not cover

Per-row digest over every security-critical field, computed and owned by the
store. A tampered row fails the whole capacity question rather than dropping out
of it — skipping it would free exactly the authority it constrains.

The database carries what it can enforce itself: a closed status set with no
`'expired'`, non-negative quantities, a released row that must name when and on
what basis, and uniqueness on both the idempotency key and `(execution, right)`.

A per-row digest **cannot detect deletion**, and a row relocated to another
holder, resource or right is indistinguishable from a deletion at the tuple it
left. This is the same bound reservations carry, it is not overclaimed, and both
halves are asserted directly.

## Kernel integration

None. No `EncumbranceKernel`, no `CollateralKernel`, no second decision engine.
`AocKernel` remains the only component producing a decision, and the resolver
still reports coverage from the position alone.

The split the reservation phase established is preserved exactly: the Kernel
decides *viability*, and the atomic acquire decides *commitment*. A constraint
can only ever narrow — an ALLOW that loses the gate becomes a denial, and a DENY
is never rescued, because a denied request never reaches the gate.

## Consequences

- `COLLATERALIZE` cannot over-commit a holder's authority, within a mandate,
  across independent mandates, or concurrently.
- A constraint survives restart and is enforced by a process that never saw the
  mandate that created it.
- A holder's `GovernedAuthorityPosition` is never rewritten by any of it.
- A transfer that would strand a constraint is refused; one the holder can still
  cover proceeds.
- `TRANSFER`, `TOKENIZE` and `LICENSE` semantics are unchanged.
- Deployments that have not enrolled a resource behave exactly as before.

## Explicitly not done

- **Production release / discharge** — `NOT PRESENT`. Needs its own governed
  action; see "Release basis".
- **Inter-action conflict policy** — still `DEFERRED`.
- **Constraint migration on transfer** — deferred; the structural guard refuses
  rather than moves.
- **Partial release / narrowing** — `COLLATERALIZE` has no partial-release
  semantics to ground it.
- **Encumbrance priority** — no ranking of any kind.
- **Tokenization persistent constraints** — `FUTURE_ENCUMBRANCE_CANDIDATE`.
  Independent `TOKENIZE` mandates can each issue against overlapping scope, and
  whether they should compete for one pool is a tokenization-domain question
  (`APV`/`TGV`) that this phase does not open.
- **Exclusive-licence persistent constraints** — `NOT APPLICABLE, TODAY`. The
  licence contract records that licensed units deliberately do not accumulate.
  Exclusivity may eventually want conflict semantics; that is action-domain
  policy, not authority accounting.
- **`DELEGATE` as a governed action** — `NOT YET`, unchanged. Nothing here bears
  on it.
- **Cross-deployment encumbrance portability** — out of scope. Proving to an
  independent deployment that authority is encumbered here, and having it
  enforce that, is the only thing that would make this a Protocol concern. It is
  not one today.
- **Durable Authority Graph** — unchanged and still deferred.

## Protocol boundary

No Protocol change. Persistent constraints are deployment-local mutable
Enterprise state, exactly as positions, transitions and reservations are.
`check:protocol-consumption`, `check:protocol-contract-adoption` and
`check:protocol-compatibility-lock` pass unchanged.

## The legal boundary

An AOC encumbrance is one deployment's record of its own governed state. It is
not a lien, pledge, mortgage, charge, security interest or registration; AOC
perfects nothing, files nothing, ranks nothing, and makes no claim that any
external system or jurisdiction agrees with it. Legal effect, if any, arises
entirely outside AOC.
