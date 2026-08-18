# AOC Governed Authority Encumbrance

How much of a holder's underlying governed authority remains **persistently
constrained after a governed action has successfully executed**, and therefore
unavailable to a further commitment.

Companion to `docs/architecture/ADR-GOVERNED-AUTHORITY-ENCUMBRANCE.md`, which
records why each decision below was made rather than what it is; to
`AOC_GOVERNED_AUTHORITY_RESERVATION.md`, which accounts for the *pre*-execution
half of the same commitment; and to `AOC_GOVERNED_AUTHORITY.md`, which describes
the authority both layers account for.

## The problem

Reservation protects finite authority while an authorization is live but not yet
executed, and for `TRANSFER` that is the whole story: the execution debits the
position, so the new position *is* the new reality and the commitment has
nothing left to say.

`COLLATERALIZE` is not like that. Executing it debits nothing — the holder keeps
every basis point — while creating an arrangement that outlives the mandate
entirely. Release the commitment at execution and the store reports the whole
position free again, at exactly the moment the constraint becomes real.

Measured, before this layer existed:

```
Alice holds 5 000 bp of the economic interest.

Mandate A   COLLATERALIZE 4 000 bp          -> allowed
execute A                                   -> committedScope(A) = 4 000 bp

Alice's position                               5 000 bp
reservations                                   none — COLLATERALIZE reserved nothing
resolveAvailability                            5 000 bp available

Mandate B   COLLATERALIZE 4 000 bp          -> ALLOWED
execute B                                   -> committedScope(B) = 4 000 bp

8 000 bp of live collateral against a 5 000 bp position.
```

Nothing was wrong with either mandate on its own terms. `committedScope` is
mandate-local and did exactly what it documents: mandate B's cumulative scope
cannot see mandate A's, because they are different records in different rows.
Running the same two requests concurrently produced the same two mandates.

## The question this layer adds

AOC could already answer five questions, and none of them is this one:

```
A  action authority          may this actor invoke this action on this resource?
B  derived authority         through what bounded, still-live chain does it hold A?
C  representative authority  may this requester exercise THAT holder's authority?
D  holder authority          does the holder control this right, and enough of it?
E  available authority       is enough of what the holder controls still uncommitted?

F  unencumbered authority    is enough of it still unconstrained by an action that
                             has ALREADY executed?
```

`E` is a pre-execution question, bounded by the mandate that raised it. `F`
outlives it.

## Vocabulary

| Term | What it is |
| --- | --- |
| **Underlying authority** (*held*) | What the holder possesses. `GovernedAuthorityPosition.scope`. Changed only by a completed governed execution or a privileged bootstrap — **never** by a reservation and never by an encumbrance. |
| **Committed authority** | The sum of the reservations still reducing capacity, net of the part of each that has already become a constraint under the same mandate. Pre-execution. |
| **Encumbered authority** | The sum of the encumbrances still constraining this holder, resource and right. Post-execution. |
| **Unencumbered / action-available authority** | What can still be committed now: `held − committed − encumbered`. |
| **Source execution** | The execution evidence a constraint is rooted in. The whole of its trusted basis, and its idempotency key. |
| **Release / discharge** | The privileged act that ends a constraint. Not the same thing as `COLLATERALIZE`'s `recordRelease`, which is an unverified external observation — see "Production discharge remains a gap". |

Deliberately four words rather than one ambiguous *available*. A holder who
possesses 5 000 bp, a holder with 4 000 of it promised to a live mandate, and a
holder with 4 000 of it constrained by an arrangement that already exists are
three different situations with three different remedies.

## The three states, and why none collapses into another

```
                    GovernedAuthorityPosition
                              │
                     underlying authority
                              │
                  ┌───────────┴───────────┐
                  ▼                       ▼
            Reservations             Encumbrances
           pre-execution            post-execution
                  │                       │
                  └───────────┬───────────┘
                              ▼
                  action-available authority
```

## What an encumbrance is not

- **Not ownership, and not a claim by anybody.** Alice with 5 000 bp and a
  4 000 bp encumbrance still *holds* 5 000 bp, and her position is not
  rewritten. Nobody — not the requester, not the representative, not the secured
  party, not AOC — acquires the encumbered scope. There is deliberately no
  `beneficiaryRef` or `securedPartyRef` on the record.
- **Not a transfer.** Creating one debits nothing, credits nothing and produces
  no `GovernedAuthorityTransition`.
- **Not a reservation under another name.** A reservation is bounded by the
  authorization that justifies it and carries a required `expiresAt` taken from
  its mandate. An encumbrance has no expiry at all, and outlives the mandate.
- **Not a delegation, and not a representation.** It says nothing about who may
  invoke an action or who may act for a holder. It cannot confer a capability,
  and it can only ever *narrow*: no request that was going to be denied is ever
  rescued here.
- **Not a legal lien, pledge, mortgage, security interest or registration.** See
  "The legal boundary".
- **Not an inter-action conflict policy.** See "What this layer does not decide".

## Which actions this applies to

Classified from what each action does to a position, not from its name:

| Action | Reservation? | Persistent encumbrance? | Evidence |
| --- | --- | --- | --- |
| **TRANSFER** | yes | **no** | `applyTransition` debits the transferor. The transition *is* the new reality; a constraint on top would subtract the same movement twice. Its commitment ends `'consumed'`. |
| **COLLATERALIZE** | **yes, newly** | **yes** | executing it debits no position, and the arrangement outlives the mandate. Its commitment ends `'encumbered'`. |
| **TOKENIZE** | no | no | never calls the authority store; its scope bounds an issuance ceiling inside one mandate. Whether independent mandates should compete for one issuance pool is a tokenization-domain question. |
| **LICENSE** | no | no | never calls the authority store, and its own contract records that licensed units deliberately do not accumulate — ten seats to one licensee and ten to another exhaust nothing. An absent `rightsScope` is not 100%, so there is no quantity to constrain. |

The classification lives in two lists in one place —
`GOVERNED_AUTHORITY_CONSERVING_ACTIONS` and
`GOVERNED_AUTHORITY_ENCUMBERING_ACTIONS` — rather than as an
`if (action === …)` repeated through the runtime.

`COLLATERALIZE` gaining a reservation is a deliberate reclassification. The
earlier finding — that a reservation released at execution would free capacity at
exactly the moment the encumbrance became real — was correct while there was
nowhere for the commitment to go. There is now, so the commitment is handed over
rather than released.

## Lifecycle

```
ACTIVE     the constraint stands; compatible future commitments must respect it
RELEASED   a legitimate release ended it; the capacity genuinely returns
```

Two states, deliberately.

There is **no `EXPIRED`**, because the record carries no expiry to derive one
from. A collateral arrangement does not stop existing because the mandate that
authorized it ran out, and inventing an expiry so the lifecycle looked
symmetrical would silently free capacity for something still live externally.

There is no `SUPERSEDED` either: that is a relationship between two records
rather than a property of one.

A released record is kept, never deleted. Capacity is derived from the records
still `ACTIVE`, so releasing twice cannot return the same capacity twice.

## The handoff, one instant at a time

```
T0  authorized nothing        held 5 000   committed —       encumbered —       free 5 000
T1  mandate issued            held 5 000   committed 4 000   encumbered —       free 1 000
T2  execution confirmed       held 5 000   committed —       encumbered 4 000   free 1 000
T3  legitimate release        held 5 000   committed —       encumbered —       free 5 000
```

Between T1 and T2 the capacity is never 5 000. That would be a **gap** — a
window in which a competitor is told the authority is free — and it is closed by
construction: the constraint is written and the commitment terminalized in one
commit section, so there is no instant between them for anything to observe.

Nor is it ever 1 000 less again. That would be **double counting** — one
commitment charged twice, stranding capacity only ever promised once. The
reservation is netted against the constraints already carved out of it, so one
commitment is counted exactly once at every point of its life.

The commitment's terminal state records which of the two things happened to it:

```
consumed     the position was debited        (TRANSFER)
encumbered   a persistent constraint took over (COLLATERALIZE)
released     nothing was committed downstream  (revoked, or never issued)
```

Neither `consumed` nor `encumbered` may be reopened: releasing either would
fabricate capacity something else already accounts for.

### Partial execution

A mandate whose terms permit several arrangements keeps its commitment active
until the last of them lands:

```
reserved 4 000, encumbered 0       -> the commitment contributes 4 000
reserved 4 000, encumbered 1 000   -> the commitment contributes 3 000,
                                      the constraint contributes 1 000
reserved 4 000, encumbered 4 000   -> the commitment contributes nothing; terminal
```

Dropping the commitment on the first instalment would free the 3 000 the mandate
may still legitimately execute, let a competitor take it, and leave AOC unable
to record the constraint when that execution arrived.

## What creates a constraint

A **confirmed execution**, and nothing else. Not a request, not a decision, not
an issued mandate.

Creation requires all of:

- a `sourceAction` classified as encumbering;
- a `sourceMandateRef` and a `sourceExecutionRef`, both non-empty;
- a holder with a live position in the named right of the named resource;
- enough unencumbered, uncommitted capacity to cover the scope;
- the caller's tenant matching the record's.

There is deliberately **no free-text `reason`**. A constraint rooted in a string
a caller supplied would be a constraint a caller could invent; an execution
reference is the one thing a requester cannot fabricate, because recording it
required the mandate store to re-assert the mandate's own authorization against
the reported terms first.

`COLLATERALIZE`'s integration takes the holder from the *reservation* the
mandate already holds, never from `requestedBy` — the mandate record names the
requester, and a delegated administrator or a representative is not the holder.

## What releases a constraint

A privileged administrative act, requiring `context.system`. That is the only
basis, and the narrowness is the finding rather than an omission — see below.

Two things that emphatically do **not** release one:

- **Mandate expiry.** Expiry bounds how long an executor may still act. It says
  nothing about how long the arrangement that executor already created
  continues to exist.
- **Mandate revocation, after execution.** Revoking withdraws the authority to
  create *further* arrangements. An arrangement an external system already
  created does not cease to exist because AOC withdrew permission to make more
  of them. Revocation before execution is different, and does return the
  capacity: there the commitment is still a commitment, nothing executed, and
  it ends `'released'`.

## Production discharge remains a gap

`COLLATERALIZE` has `recordRelease`, and it is **not** a discharge. It records
that an external system *reported* an arrangement as released: no authority is
evaluated, no decision is produced, `reportedBy` is caller-asserted, and any
tenant-scoped caller can call it. The collateralization module already refuses
to let such a report decrement its own `committedScope`, on the stated grounds
that AOC cannot verify an external encumbrance actually ended.

Letting the same unverified report free authority capacity would be that refusal
reversed, and would hand any tenant-scoped caller a way to manufacture headroom
by reporting a release. So it does not.

**Status: `NOT PRESENT`.** An authorized discharge — with its own request,
decision, authority check and evidence — is a separate governed action this
phase deliberately does not invent. Until it exists, ending a constraint is an
operator act.

## Structural consistency with authority-changing actions

An encumbrance is holder-bound and does **not** follow the authority to a
recipient. That raises a question a transfer could otherwise answer badly:

```
Alice holds 5 000, encumbered 4 000

TRANSFER   500  ->  Alice keeps 4 500  ->  still covers 4 000  ->  proceeds
TRANSFER 2 000  ->  Alice keeps 3 000  ->  covers nothing like 4 000  ->  refused
```

This is **not** the business rule "collateralized authority cannot be
transferred". AOC holds no such rule and does not invent one; a real asset may
well be transferable subject to a lien, and deciding that is domain and legal
policy. What is refused is narrower and structural: AOC will not end up holding
a constraint that refers to authority its holder no longer possesses — a record
pointing at nothing, after which every capacity question reports
`overencumbered`.

The alternative — moving the constraint to the recipient — is a substantive
decision about what an encumbrance means when the underlying right changes
hands. This phase does not make it. Refusing is the conservative reading, and it
leaves the eventual policy free to choose either way.

A completed transfer is asserted never to carry a constraint to the recipient.

## What this layer does not decide

Whether a constraint conflicts with a *different* action.

The store records that a quantity of one holder's authority over one right of
one resource stands constrained. It does not know, and must not invent, whether
collateralizing conflicts with tokenizing or with licensing. Those need a typed
policy about what those actions mean to each other, and encoding one inside
generic accounting would turn a business assumption into a conservation rule.

`DEFERRED_INTER_ACTION_CONFLICT_POLICY` therefore stands, unchanged. The one
cross-action rule this phase does add is the structural invariant above, which
is not a claim about what actions mean to each other but a refusal to corrupt
AOC's own state.

Neither is there any **priority**: no seniority, no first or second lien, no
pari passu, no statutory ranking. Multiple constraints coexist exactly insofar
as the holder's authority permits, and nothing orders them. Ranking collateral
is legal policy AOC does not hold.

## Capacity accounting

Capacity uses the canonical algebra only: `governedRightsScopeSum` to total,
`governedRightsScopeWithin` to compare, and `subtractAuthorityScope` to take
things off the position. No arithmetic on `basisPoints` or `units` happens
anywhere in this layer, so the kind-refusal and denomination-refusal semantics
the four actions agreed on are inherited rather than re-derived.

An absent scope is never synthesized into `10 000`. It cannot arise here at all:
the only encumbering action requires a scope.

`overencumbered` is reported rather than clamped to zero, exactly as
`overcommitted` is, and kept apart from it because the two are different facts
with different remedies. An overcommitment is pre-execution and self-clearing —
the reservations behind it lapse at their own `expiresAt`. An overencumbrance is
not: the constraints behind it have no expiry, so the state persists until an
operator resolves it. It is unreachable through this runtime — the structural
guard is what makes it so — and reported anyway, because an import, a restore or
a tampered row could produce it, and a silently-zeroed capacity would hide the
breach until it became permanent.

## One pool per holder

Every route to a holder draws on the same constrained pool:

- **The direct holder** is accounted for exactly as a representative is. Being
  the holder is not an exemption: it is her authority that is constrained.
- **Two independently granted representations** of the same holder share one
  pool. A representation is permission to exercise a holder's authority, never a
  second allocation of it.
- **Different delegated lineages** do not open second pools.

And a constraint binds one holder, one resource and one right, and nothing else.
Alice's economic interest in Asset A is untouched by a constraint on Bob, on her
usage right, or on Asset B. Cross-right conflicts are not invented.

## Atomicity

Positions, reservations and encumbrances live in **one** store, so the handoff
is one commit section — one synchronous critical section in memory, one
`db.transaction(...)` in SQLite. That is a real atomicity claim, not a
coordination story: both rows are in the same database.

The mandate store and the Governance Store are separate consistency boundaries,
and no global ACID is claimed across them. The crash matrix, the ordering
argument and the recovery path are in the ADR.

## Durability

Constraints survive process restart, and this is the property that decides
whether the layer is worth having: an arrangement an external system created
does not cease to exist because an AOC process restarted, and a deployment that
came back up reporting the whole position free would hand the same authority out
twice on its first request.

Both backends carry it, and the shared contract suite runs against both. The
SQLite pass closes and reopens real files, and a second connection over the same
file sees and enforces what the first committed.

## Tenant isolation

Encumbrances are tenant-scoped on every operation: read, list, create, release
and capacity. A cross-tenant id reads as absent rather than as a refusal, so
identifiers cannot be probed by telling "denied" apart from "no such thing".

## Integrity

Every security-critical field is covered by a per-row digest the store computes
and owns: id, tenant, holder, resource, right, scope, source action, source
mandate, source execution, status, release basis and timestamps.

A tampered row is **not** skipped as unreadable — skipping it would silently free
exactly the authority it constrains, turning a corrupted record into the
persistent over-commitment this layer exists to prevent. The whole capacity
question fails instead, and nothing may be committed or moved against a state
AOC cannot trust.

The database carries what it can enforce itself: a closed status set with no
`'expired'` in it, non-negative quantities, a released row that must name when
and on what basis, and uniqueness on both the idempotency key and the
`(execution, right)` pair.

### What integrity does and does not cover

A per-row digest detects alteration. It **cannot** detect deletion, and a row
*relocated* to another holder, resource or right is — from the original tuple's
point of view — indistinguishable from a deletion. At the tuple it was moved to,
it fails closed; at the tuple it was moved from, its authority is genuinely
freed. That limitation is the same one reservations carry, it is stated rather
than papered over, and it is asserted directly in the contract suite.

## Idempotency

- **Creation** is idempotent on `(tenant, source execution, right)`. Replaying an
  execution restates one constraint rather than adding a second. A replay naming
  a different holder, resource, right, quantity, action or mandate is refused as
  a conflict rather than reinterpreted.
- **The handoff** is idempotent: retrying it neither constrains twice, nor
  terminalizes a commitment twice, nor frees capacity twice.
- **Release** is idempotent and non-accumulating. Releasing twice returns the
  record unchanged, and could not double-free anyway, because capacity is derived
  from the constraints still active rather than from a counter.

## Audit lineage

Reconstructible from stored references alone, with no object duplicated:

```
request -> decision -> reservation -> mandate -> execution -> encumbrance -> release
```

`sourceRequestRef` and `sourceDecisionRef` sit on the commitment;
`sourceMandateRef`, `sourceExecutionRef` and `sourceReservationRef` sit on the
constraint. Every one is a reference.

## Denial vocabulary

| Code | Means |
| --- | --- |
| `GOVERNED_AUTHORITY_AVAILABILITY_INSUFFICIENT` | the holder possesses enough, but too much of it stands committed or constrained |
| `GOVERNED_AUTHORITY_INSUFFICIENT_SCOPE` | the holder never possessed enough at all |
| `GOVERNED_AUTHORITY_ENCUMBRANCE_BASIS_INVALID` | no trusted execution basis: an action that does not encumber, or a missing source reference |
| `GOVERNED_AUTHORITY_ENCUMBRANCE_CONFLICT` | the same execution identity restated under materially different terms |
| `GOVERNED_AUTHORITY_ENCUMBRANCE_UNCOVERED` | a transition would strand an active constraint |
| `GOVERNED_AUTHORITY_ENCUMBRANCE_NOT_FOUND` | no such constraint in this tenant |
| `GOVERNED_AUTHORITY_ENCUMBRANCE_RECORD_CORRUPTED` | a stored row no longer matches its digest |
| `GOVERNED_AUTHORITY_BOOTSTRAP_NOT_PERMITTED` | a release was attempted without a privileged context |

## The legal boundary

An AOC encumbrance is **one deployment's record of its own governed state**.

It is not a lien, a pledge, a mortgage, a charge, a security interest or a
registration. AOC creates no legal encumbrance, perfects nothing, files nothing
with any registry, ranks nothing, and makes no claim that any external system,
counterparty or jurisdiction agrees with it. Legal effect, if any, arises
entirely outside AOC.

What the record means, and the whole of what it means: *according to this
Enterprise deployment's governed state, this much of this holder's authority
over this right of this resource is subject to the persistent constraint created
by this execution.*

## Protocol boundary

None. Persistent constraints are deployment-local mutable Enterprise state, and
the AOC Protocol is unchanged. Proving to an *independent* deployment that
authority is encumbered here, and having that deployment enforce it, is a
portability problem this phase does not open.

## Limitations, deliberately

- **No production discharge.** Only privileged release exists. See above.
- **No inter-action conflict policy.** Still deferred.
- **No constraint migration on transfer.** A transfer that would strand a
  constraint is refused rather than moved.
- **No priority or ranking.** No senior, junior, first, second or pari passu.
- **No partial release.** `COLLATERALIZE` has no partial-release semantics to
  ground one, so none is implemented. Narrowing a constraint would require
  legitimate release semantics that do not yet exist.
- **No widening.** An active constraint cannot be enlarged in place; a further
  commitment is a further commitment, and goes through the capacity gate.
- **No historical backfill.** Executions recorded before this phase produce no
  constraints. See the ADR, "Historical migration".
- **Row deletion is undetectable.** As above.
