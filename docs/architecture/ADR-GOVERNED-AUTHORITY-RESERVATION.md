# ADR: Governed authority reservation and concurrent commitment safety

- Status: accepted
- Supersedes: `ADR-GOVERNED-AUTHORITY-TRANSITION.md` §"Reservation decision"
  (*deferred — execution-time conservation only*)
- Related: `ADR-GOVERNED-AUTHORITY-TRANSITION.md`,
  `ADR-HOLDER-BOUND-REPRESENTATIVE-AUTHORITY.md`,
  `ADR-NATIVE-DELEGATED-CAPABILITIES.md`, `ADR-TRANSFER-ACTION.md`
- Scope: `@aoc-enterprise/governed-authority`,
  `src/enterprise/authority-governance/`,
  `src/enterprise/transfer-governance/`
- Not a fifth governed action. Not an encumbrance engine. Not an inter-action
  conflict policy. No Protocol change.

## Context: why execution-time conservation alone was insufficient

`ADR-GOVERNED-AUTHORITY-TRANSITION.md` deferred reservation deliberately, for
three reasons that were good ones: the four actions do not share reservation
semantics, reserved-versus-available-versus-controlled-versus-executed are four
quantities that are easy to conflate, and a lifecycle nothing drove would have
been a framework built ahead of a consumer.

It also quantified the residual risk and left it measured rather than asserted
away. That measurement, re-run before any change in this phase:

```
Alice holds 5 000 bp of the economic interest.

SEQUENTIAL
  Request A  TRANSFER 4 000 Alice -> Bob     allowed, transfer-mandate-1
  Request B  TRANSFER 4 000 Alice -> Carol   allowed, transfer-mandate-3
  Alice's position after both mandates       5 000 bp
  execute A                                  Alice -> 1 000 bp
  execute B                                  REFUSED, GOVERNED_AUTHORITY_INSUFFICIENT_SCOPE
  final                                      Alice 1 000, Carol nothing

CONCURRENT  Promise.all([4 000, 4 000])
  A allowed, B allowed
  2 live mandates promising 8 000 bp of a 5 000 bp position
```

The exposure is real but narrow, and naming it precisely is what decides the
design. **No movement can overdraw**, and the total is conserved regardless.
What happens is that Soberanía issues two authorization artifacts that cannot both be
honoured, tells two counterparties they may act, and discovers the conflict only
when one of them does. The failure is not lost authority; it is an authorization
Soberanía could not stand behind.

Three of the deferral's premises still hold and are preserved below — the four
actions still do not share reservation semantics, the four quantities are still
distinct, and no lifecycle is invented beyond what `TRANSFER` drives. What
changed is that a consumer now exists: `TRANSFER` records a conserving
transition, so its authorized-but-unmoved scope is finite capacity, and that is
enough to build the primitive for exactly one action without generalizing it to
the other three.

## Decision

Introduce `GovernedAuthorityReservation`: a durable record that a finite
quantity of one holder's underlying authority stands committed to one
authorization artifact, held **inside `GovernedAuthorityStore` beside the
positions**, acquired **atomically** as the last step before a `TRANSFER`
mandate is issued, and terminalized **in the same transaction** as the authority
transition its execution causes.

## Naming

The store's own prior art decided it. `ADR-GOVERNED-AUTHORITY-TRANSITION.md`
already wrote: *"a reservation is a further quantity on the same position, keyed
by mandate, with its own lifecycle"*, and `authority-store.ts` carried a
`**No reservation.**` bullet. The thing being built is the thing that text named,
so it keeps the name. `GovernedAuthorityCommitment` was considered and rejected
because `committedScope` already means something different and mandate-local in
`COLLATERALIZE`.

## What is reserved

A portion of currently **available** governed authority capacity. Precisely not:

| Candidate | Verdict |
| --- | --- |
| the underlying right itself | **no** — the holder keeps all of it |
| ownership | **no** — there is no ownership in this model to begin with |
| the mandate | **no** — the mandate is the artifact; the reservation is the capacity behind it |
| a future transition | **not exactly** — a reservation implies no movement, and most expire without one |

## Reservation versus the four things it is easily confused with

```
GovernedAuthorityPosition        how much underlying authority does Holder H possess?
GovernedRepresentativeAuthority  who may exercise H's authority?
DelegationGrant lineage          through what chain does a requester hold the action?
GovernedAuthorityReservation     how much of H's authority is already committed?
```

Four independent facts; no two substitute. A valid delegation reserves nothing.
A valid representation reserves nothing. A reservation authorizes nobody. And a
reservation is not an execution grant: `markGrantConsumed` prevents a *second
execution of one authorization*, while a reservation prevents *a second
authorization against one authority*.

## Where reservations live, and why the choice was forced

| Option | Verdict |
| --- | --- |
| **A. Inside `GovernedAuthorityStore`** | **chosen** |
| B. Adjacent reservation store | rejected — cross-store atomicity does not exist here, so check-and-reserve would be two unprotected steps |
| C. Inside the mandate record | rejected — mixes authority accounting into mandate state, and puts availability in a store that does not hold the positions it must be computed against |

Availability is a function of positions **and** reservations. If those live in
different transactional boundaries, "read availability, then commit" is two
steps and the double commitment moves one layer up rather than disappearing.
They therefore share one consistency boundary, and this is stated as the load-
bearing reason rather than a convenience.

The placement is deliberately narrow about what it mixes in. A reservation
records no terms, no policy, no approvals and no evidence — a quantity, whose
authority it stands against, and which artifact it stands for. Mandate lifecycle
stays in the mandate stores.

## Atomic check-and-reserve

`acquireReservation` is one operation. There is deliberately **no separately
callable check** that could be used to build it out of two.

- **In-memory**: one synchronous critical section, no `await` between the
  availability read and the write, so the event loop cannot interleave.
- **SQLite**: one `db.transaction(...)`; better-sqlite3 is synchronous, and
  `UNIQUE (tenant_id, idempotency_key)` and
  `UNIQUE (tenant_id, source_mandate_ref, governed_right)` refuse a duplicate
  across processes too.

`resolveAvailability` exists for explanation and audit and is documented as a
**snapshot, never a gate**. This is the TOCTOU boundary: the Kernel may observe
that a request is viable, but only the acquire decides, on the state inside its
own transaction. An `allowed` decision that loses the race issues no mandate.

## Execution atomicity

`applyTransition` accepts `consumesReservationsForMandateRef`, so the debit, the
credit and the terminalization are **SAME TRANSACTION**. Both bad crash windows
are therefore closed by construction rather than by recovery:

```
release reservation ─ CRASH ─ transition not applied      capacity freed for a movement
                                                          that did not happen        NOT POSSIBLE

transition applied ─ CRASH ─ reservation still active     capacity stranded forever  NOT POSSIBLE
```

## The one cross-store window, stated rather than papered over

`GovernedAuthorityStore` and `TransferMandateStore` are independent persistence
units and cannot share a transaction. There is no claim otherwise anywhere in
this design. The ordering is chosen for its failure mode:

```
acquire reservation  ──▶  issue mandate
```

| Crash state | Detect | Recover | Posture |
| --- | --- | --- | --- |
| reservation exists, mandate missing | `listReservationsByMandateRef` returns a reservation for a mandate `getMandate` cannot find | compensating release on issuance failure; otherwise lapses at `expiresAt` | conservative — capacity over-committed, never under; nothing can execute against an artifact that does not exist |
| mandate exists, reservation missing | impossible in this ordering | — | — |
| execution committed, reservation active | impossible — same transaction | — | — |
| reservation consumed, transition missing | impossible — same transaction | — | — |

The inverse ordering was rejected outright: issuing the mandate first would let
Soberanía produce a valid authorization artifact and only then discover it has no
capacity behind it, which is precisely the failure this ADR exists to prevent.

## When a commitment begins

After every governance check has passed and the aggregate is durably committed,
and immediately before `issueMandate`. That is the first moment at which Soberanía is
about to create a still-live commitment a competing authorization must respect.

Deliberately **not** earlier. A request that may still be denied by policy,
approval, obligation, recognition, authority or representation reserves nothing,
so a denial leaks no capacity. In particular an `approval_required` outcome
issues no mandate and therefore commits nothing — capacity is not stranded
behind an approval that may sit in a queue for weeks, and multiple pending
approvals race at final issuance where exactly one can win atomically. No
temporary evaluation hold was built, because nothing demonstrated a need for
one.

The mandate's identifier is minted before the acquire so the reservation can
name the artifact it stands for; a commitment acquired for an artifact with no
name could not be found again if issuing it then failed.

## Lifecycle

Three stored states — `active`, `consumed`, `released` — and `expired` derived
from `expiresAt` against the instant asked about.

`consumed` and `released` are deliberately not collapsed. `consumed` means the
position has already been debited, so subtracting the reservation again would
double-count; `released` means it was never debited, so the capacity genuinely
returns. Releasing a `consumed` reservation is refused: the authority has moved,
and treating that as returnable capacity would fabricate it.

There is no stored `expired`, and the SQLite `CHECK` forbids one. This follows
the precedent `governedAuthorityPositionState` and `TransferMandateRecord`
already set — a stored lifecycle state that could disagree with the facts it is
derived from is a second source of truth — and it has a specific security
consequence here: **correctness never depends on a cleanup sweeper having run**.

`expiresAt` is required, unlike a position's, and is set from the mandate's own
expiry. A reservation never outlives the authorization justifying it, and covers
exactly the window in which an external executor may still legitimately act.

## Reservation applicability, per action

Classified from what each action does to a position, not from its name:

| Action | Classification | Evidence |
| --- | --- | --- |
| **TRANSFER** | `GENERIC_RESERVATION_REQUIRED` | the only action that calls `applyTransition`; authorized-but-unmoved scope is finite capacity |
| **TOKENIZE** | `NOT CURRENTLY CONSERVING` | never calls the authority store; its scope bounds an issuance ceiling inside the mandate |
| **COLLATERALIZE** | `INSUFFICIENT DOMAIN LIFECYCLE TO RESERVE SAFELY` | never calls the authority store; `committedScope` accumulates within one mandate and a reported release does not decrement it. Its encumbrance *outlives execution*, which a pre-execution reservation cannot model |
| **LICENSE** | `NOT CURRENTLY CONSERVING` | never calls the authority store, and an absent `rightsScope` is not 100%; licence scarcity is action-local policy |

The classification lives in one place — `governedActionCommitsAuthority` in
`reservation-lifecycle.ts` — rather than as an `action === 'TRANSFER'` test
repeated through the runtime.

`COLLATERALIZE` is the interesting negative result. Forcing generic reservation
onto it would have produced a commitment that correctly blocks competing
authorizations before execution and then wrongly *releases* at execution, at
exactly the moment the encumbrance becomes real. That is worse than not applying
it, so it is not applied, and the gap is named below instead.

## Scope accounting

Availability uses the canonical algebra only: `governedRightsScopeSum` to total
the standing commitments, and the store's existing `subtractAuthorityScope`
(built on `governedRightsScopeWithin`) to take them off the position. No
arithmetic on `basisPoints` or `units` happens anywhere in this layer, so the
kind-refusal and denomination-refusal semantics the four actions agreed on are
inherited rather than re-derived.

An absent scope is never synthesized into `10 000`. It cannot arise here at all:
the only reserving action requires a scope, and the action whose scope is
optional does not reserve.

`overcommitted` is reported rather than clamped to zero. It is unreachable
through any path in this runtime — every authority-reducing operation goes
through the same store — and a silently-zeroed availability would hide an
invariant breach an import, restore or tampered row could produce.

## Temporal boundaries preserved from Phase 5.3

Revoking a delegation or a representation **after** a mandate has issued does
not release its reservation. An issued mandate is an authorization artifact in
its own right; reservation must not smuggle a dynamic lineage dependency back in
by releasing the capacity a still-valid mandate is relying on. New requests
through the revoked lineage are still denied, so the boundary is unchanged in
both directions.

Reservation likewise introduces no policy re-evaluation. Whether execution
rechecks policy is the mandate lifecycle's question, and it is untouched.

## Legacy behaviour and enrolment

Enrolment governs reservation exactly as it governs coverage. A resource with no
positions has no capacity to commit and no double commitment to prevent, so
`acquireReservation` returns `resource_not_enrolled` and the request proceeds as
before. The boundary stays per-resource and one-way: an enrolled resource
enforces strictly, including for rights nobody was bootstrapped into.

Losing reservation rows cannot downgrade a resource to permissive behaviour,
because enrolment is decided by **positions**, which reservations never touch.

## Schema migration

The durable shape changed, so the store version moved to
`aoc.governed-authority-store.schema.v2` — and, for the first time in this
repository, a migration is performed rather than the mismatch refused. The v1 →
v2 change is purely additive: one table, with no existing row read, rewritten or
re-digested, so a v1 database's whole authority history keeps verifying
byte-for-byte and its availability on the day it upgrades is simply its
holdings. Every other version still refuses to open, so this is one known
migration and not a general "try to upgrade anything" policy. Refusing v1
outright would have stopped every deployment already holding authority state, to
add a table it has no rows for.

## Integrity, and what it does not cover

Reservations carry a digest over every field a tamper could use to free
capacity, relocate a commitment or extend its life. A tampered row makes the
availability question **fail** rather than dropping out of the sum — silently
skipping it would release exactly the capacity the tamper was after.

What row-level integrity cannot detect is a row that is no longer there.
Relocating a reservation onto another holder, resource or right is, from the
original tuple's point of view, a deletion; it fails closed at the tuple it was
moved *to*, and frees the origin's capacity. Outright deletion is the same
class. This bound is asserted in the contract suite rather than implied away.
Closing it would need a per-tenant chain over a table whose rows mutate, and
nothing yet justifies that cost.

## Denial vocabulary

`GOVERNED_AUTHORITY_AVAILABILITY_INSUFFICIENT` is deliberately distinct from
`GOVERNED_AUTHORITY_INSUFFICIENT_SCOPE`. The holder may possess ample authority;
what is exhausted is the portion not already promised, and the operator's remedy
is to wait or release rather than to acquire more of the right.

Losing the race is **not** reported as a governance `denied` outcome. The Kernel
decided `allowed` and that decision is durably committed; restating it as a
denial would misreport what governance concluded. It surfaces as the authority
layer's own error, following the precedent `transfer-governance/errors.ts`
already set for unconservable executions: facts about authority state belong to
the authority layer, not to the action module.

## Kernel integration

The Kernel remains the only decision engine. No `ReservationKernel`,
`CommitmentKernel` or `ConcurrencyKernel` exists, and the Kernel's contracts are
unchanged — it learns nothing about reservations. The acquire sits in the
`TRANSFER` service's issuance path, after the Kernel has decided and before the
artifact exists, which is the only place that is both after every governance
check and inside the window where a commitment can still be refused.

## Consequences

- A `TRANSFER` request that passes every governance check can still fail, with
  `GOVERNED_AUTHORITY_AVAILABILITY_INSUFFICIENT`, because another authorization
  got there first. This is new, intended, and narrowing-only.
- Two mandates against the same authority can no longer both exist, so the
  scenario in which an authorized mandate is later unexecutable is gone through
  the governed path.
- There is no fairness guarantee. No queue, no priority, no scheduler; whichever
  commitment reaches the transaction first wins, and losers are not retried.

## Explicitly not done

- **Inter-action conflict policy** — `DEFERRED`. Generic reservation knows two
  `TRANSFER`s of the same right compete. It does not know whether tokenizing
  5 000 bp should conflict with collateralizing the same 5 000 bp. That needs a
  typed policy about what those actions mean to each other, and inventing one
  inside generic accounting would encode a business assumption as a
  conservation rule.
- **Governed encumbrance** — identified, not built. `COLLATERALIZE` needs
  committed authority to remain unavailable *after* execution. Overloading
  reservation to carry it would make "committed until execution" and "encumbered
  indefinitely afterwards" the same word.
- **Delegation-level `maxUses`** — still `DEFERRED`. Phase 5.3 deferred it
  because sibling conservation would need reservation, and reservation now
  exists — but it conserves *a holder's authority over a right of a resource*,
  which is not what a use-count of a delegation conserves. Reusing this
  primitive would mean modelling a delegation as a holder and a use as a
  quantity of a governed right, both of which are false. It needs its own
  accounting domain, and this ADR does not open one.
- **Durable Authority Graph** — unchanged and still deferred. Reservations are
  durable while the Authority Graph remains in-memory, and that asymmetry is
  consistent rather than accidental: a mandate is valid after issuance
  independently of its lineage, so the reservation supporting it must survive a
  restart even where the delegation behind it does not. Availability depends on
  positions and reservations, never on the graph.
- **A fifth governed action.** No `RESERVE`, `COMMIT`, `HOLD` or `LOCK`.
  Reservation is internal authority-conservation infrastructure with no
  externally meaningful governed effect of its own, and a requester can never
  ask for one directly — Enterprise's authorization orchestration decides
  whether one is warranted.
- **`DELEGATE` as a governed action** — still `NOT YET`. Nothing in this phase
  bears on that decision.
- **Cross-deployment reservation.** A reservation is deployment-local. One
  Enterprise deployment cannot see or enforce another's commitments. That would
  be a Protocol concern; **no Protocol change is required or made here.**
