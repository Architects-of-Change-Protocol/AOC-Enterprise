# AOC Governed Authority Reservation

How much of a holder's underlying governed authority is **already committed to
a still-live governed authorization**, and therefore unavailable to another.

Companion to `docs/architecture/ADR-GOVERNED-AUTHORITY-RESERVATION.md`, which
records why each decision below was made rather than what it is, and to
`AOC_GOVERNED_AUTHORITY.md`, which describes the authority this layer accounts
for.

## The problem

A `GovernedAuthorityPosition` does not change when a mandate is issued, and it
should not: issuing permission to move a right must not move it. But that means
two requests can each read the same position and each conclude there is enough.

Measured, before this layer existed:

```
Alice holds 5 000 bp of the economic interest.

Request A   TRANSFER 4 000 bp Alice -> Bob     -> allowed, mandate issued
Request B   TRANSFER 4 000 bp Alice -> Carol   -> allowed, mandate issued

Alice's position after both mandates            5 000 bp

execute A                                       Alice -> 1 000 bp
execute B                                       REFUSED
                                                GOVERNED_AUTHORITY_INSUFFICIENT_SCOPE
```

Conservation held where it counted — no movement overdrew, and the total was
never wrong. What went wrong happened earlier: AOC told two counterparties they
were authorized to move the same 4 000 bp, and only discovered the conflict when
one of them tried. Running the same two requests concurrently produced the same
two mandates.

## The question this layer adds

AOC could already answer four questions, and none of them is this one:

```
A  action authority          may this actor invoke this action on this resource?
B  derived authority         through what bounded, still-live chain does it hold A?
C  representative authority  may this requester exercise THAT holder's authority?
D  holder authority          does the holder control this right, and enough of it?

E  available authority       is enough of what the holder controls still uncommitted?
```

`D` is answered against a position. `E` is answered against the position **and**
the commitments standing against it.

## Vocabulary

| Term | What it is |
| --- | --- |
| **Underlying authority** (*held*) | What the holder possesses. `GovernedAuthorityPosition.scope`. Changed only by a completed governed execution or a privileged bootstrap. |
| **Reserved / committed authority** | The sum of the reservations still reducing availability for one holder, resource and right at an instant. |
| **Available authority** | What can still be committed now: `held − committed`. |
| **Reservation** | One durable record that a finite quantity of one holder's authority stands committed to one authorization artifact. |
| **Mandate** | The authorization artifact itself. Owns terms, policy, approvals, evidence and its own lifecycle. |
| **Execution** | Accepted evidence that the external effect happened. |
| **Transition** | The recorded change to underlying authority an execution causes. |

## What a reservation is not

- **Not ownership.** The authority stays with `GovernedAuthorityPosition.actorRef`.
  No party owns a reservation's scope — not the requester, not the
  representative, not the mandate holder. There is deliberately no `ownerRef`
  field.
- **Not a transfer.** Acquiring one debits nothing, credits nothing and produces
  no transition. Alice with 5 000 bp and a 3 000 bp reservation still *holds*
  5 000 bp; only 2 000 bp remains committable.
- **Not delegation, and not representation.** Those answer *who may exercise*.
  This answers *how much is left to commit*. A valid delegation reserves
  nothing; a valid representation reserves nothing; a reservation authorizes
  nobody.
- **Not a lock.** A database lock lives for milliseconds inside one transaction.
  A reservation lives across restarts, for as long as an external executor may
  legitimately still act under the mandate.
- **Not authorization.** It can only ever *narrow*. A request the
  recognition/authority/policy/approval chain already denied is never rescued by
  available capacity.

## Which actions this applies to

Classified from what each action actually does to a position, not from its name:

| Action | Debits a position? | Reservation | Evidence |
| --- | --- | --- | --- |
| **TRANSFER** | **yes** | **required** | Records a `governed-execution` transition debiting the transferor. Authorized scope not yet moved is finite capacity another authorization must not also promise. |
| **TOKENIZE** | no | none | Never calls the authority store. Its scope bounds an issuance ceiling inside the mandate; executing it debits nothing. |
| **COLLATERALIZE** | no | none | Never calls the authority store. `committedScope` accumulates *within one mandate*, and a reported release does not decrement it. What it creates is a long-lived encumbrance that outlives execution — which a pre-execution reservation cannot model, and must not pretend to. |
| **LICENSE** | no | none | Never calls the authority store, and frequently carries no scope at all. An absent `rightsScope` is emphatically **not** 100%, so there is no quantity to commit. |

The classification lives in one place —
`src/enterprise/authority-governance/reservation-lifecycle.ts`,
`governedActionCommitsAuthority` — rather than as an `action === 'TRANSFER'`
test repeated through the runtime.

## Lifecycle

Three stored states, and one derived:

```
active     capacity stands committed; competing commitments must respect it
consumed   the governed execution applied the authority transition
released   the commitment ended without the authority ever having moved

expired    DERIVED from expiresAt against the instant asked about
```

`consumed` and `released` are both terminal and both stop reducing availability,
and they are deliberately not collapsed. `consumed` means the position has
**already been debited**, so continuing to subtract the reservation would count
the same quantity twice. `released` means the position was never debited, so the
capacity genuinely returns.

There is no stored `expired`, and the SQLite `CHECK` constraint forbids one.
Expiry is decided by the clock at evaluation time, so **correctness never
depends on a cleanup process having run**.

```
                     acquire
                        │
                        ▼
                     ACTIVE ─────── expiresAt passes ──────▶ (expired, derived)
                     │    │
      execution ─────┘    └───── mandate revoked, or
           │                     issuance failed
           ▼                            │
       CONSUMED                         ▼
                                    RELEASED
```

## When a commitment begins

At the **last moment before the authorization artifact exists**, and not before.

```
request
   │
   ├─ recognition, action authority, derived lineage,
   │  representative authority, holder authority
   ├─ policy, approvals, obligations
   ├─ governance aggregate committed durably
   │
   ▼
ATOMIC ACQUIRE  ◀── the conservation gate
   │
   ├─ success ──▶ mandate issued ──▶ execution ──▶ transition + consume
   │
   └─ conflict ──▶ GOVERNED_AUTHORITY_AVAILABILITY_INSUFFICIENT, no artifact
```

Nothing is reserved merely because a request was submitted. A request that
policy, approvals, obligations or any of the four authority proofs denies never
reaches the gate, and leaks no capacity. An `approval_required` outcome is not
authorization and issues no mandate, so it commits nothing either — capacity is
not stranded behind an approval that may sit in a queue for weeks.

## When a commitment ends

| Event | Terminal state | Position |
| --- | --- | --- |
| Execution completes | `consumed` | debited, in the same transaction |
| Mandate revoked | `released` | unchanged |
| Mandate expires | derived `expired` | unchanged |
| Mandate issuance failed after acquire | `released` (compensation) | unchanged |
| Administrative cancellation (privileged) | `released` | unchanged |

A `consumed` reservation cannot be released: the authority has already moved,
and treating that as returnable capacity would fabricate it.

## Availability

```
available = held − committed
```

computed through the canonical scope algebra only —
`governedRightsScopeSum` to total the standing commitments, and the store's
existing `subtractAuthorityScope` (built on `governedRightsScopeWithin`) to take
them off the position. No arithmetic on `basisPoints` or `units` happens
anywhere in this layer.

Four outcomes, and only the first permits a commitment:

- `available` — reports `held`, `committed` and `available`.
- `no_authority` — no live position; nothing to commit.
- `incompatible` — position and commitments are not commensurable quantities.
  Never coerced.
- `overcommitted` — commitments sum to more than the position holds. Unreachable
  through any path in this runtime, and **reported rather than clamped to zero**:
  a silently-zeroed availability would hide an invariant breach an import,
  restore or tampered row could have produced.

`resolveAvailability` is for explanation, audit and denial evidence. It is
explicitly **a snapshot and never a gate** — by the time a caller acts on it,
another commitment may have won the race.

## Atomicity

Check-and-reserve is **one operation**, and there is deliberately no separately
callable "check" that could be used to build it out of two.

| Backend | Mechanism |
| --- | --- |
| In-memory | One synchronous critical section — no `await` between the availability read and the write. The Node event loop cannot interleave another caller. |
| SQLite | One `db.transaction(...)`. better-sqlite3 is synchronous, and `UNIQUE (tenant_id, idempotency_key)` plus `UNIQUE (tenant_id, source_mandate_ref, governed_right)` refuse a duplicate even across processes. |

Reservations live **inside `GovernedAuthorityStore`, beside the positions**, for
exactly this reason: availability is a function of positions and reservations
together, so the check and the write must share a transaction. Split across two
stores, "read availability, then commit" would be two unprotected steps and the
double commitment would simply move one layer up.

The same placement is what makes execution atomic. `applyTransition` accepts
`consumesReservationsForMandateRef`, so the debit, the credit and the
terminalization commit **in the same transaction** — there is no window in which
capacity is freed for a movement that did not happen, and none in which a
completed movement strands its reservation forever.

## The one cross-store window

`GovernedAuthorityStore` and `TransferMandateStore` are independent persistence
units and **cannot share a transaction**. That is stated rather than papered
over. The ordering is chosen for its failure mode:

```
acquire reservation   ──▶   issue mandate
```

A crash in between leaves a commitment with no artifact. That direction is the
safe one — capacity is *over*-committed, never under — and it is bounded three
ways: an explicit compensating release on issuance failure, the reservation's
own `expiresAt` (never later than the mandate's would have been), and the fact
that the artifact never existed, so nothing can execute against it.

The inverse ordering was rejected: issuing the mandate first would let AOC
produce a valid authorization artifact and only then discover it has no capacity
behind it, which is the exact failure this layer exists to prevent.

## Idempotency

Acquisition is idempotent on `idempotencyKey`, which defaults to the source
mandate reference (`<mandateId>:<governedRight>` for a multi-right transfer).
Replaying returns the original reservation and commits no second quantity.
Reusing the key for a materially different commitment — different holder,
resource, right, quantity, action or mandate — is refused with
`GOVERNED_AUTHORITY_RESERVATION_CONFLICT` rather than reinterpreted.

Release is idempotent, and cannot free capacity twice: availability is derived
from the reservations still active, never from a counter something could
decrement again.

Consumption rides on the existing execution idempotency. A replayed execution
returns early with `replayed: true`, so the position is debited exactly once and
the reservation consumed exactly once, however often the execution is retried.

## Multi-right transfers

A transfer naming two rights either commits both or commits neither. The two
rights are independent availability questions with independent answers, so they
cannot be one transaction; a failure part-way through releases what was already
acquired before propagating. A partial commitment left behind would deny
capacity in a right whose mandate never existed.

## Legacy compatibility

Enrolment governs reservation exactly as it governs coverage, and for the same
reason. A resource this deployment holds **no** governed authority state for has
no capacity to commit and no double commitment to prevent, so `acquireReservation`
returns `resource_not_enrolled` and the request proceeds as it always did.

The boundary is per-resource and one-way. The moment a resource has any position
at all, every conserving authorization over it must acquire a commitment —
including for rights nobody was bootstrapped into, which fail closed. Losing
reservation rows can never downgrade a resource to permissive behaviour, because
enrolment is decided by **positions**, which reservations do not touch.

## Tenant isolation

Every operation is tenant-scoped. One tenant can neither read, commit against,
release nor cancel another's reservations, and cross-tenant records never affect
availability. `getReservation` under the wrong tenant reads as **absent** rather
than refused, so a caller cannot probe another tenant's identifiers by telling
"denied" apart from "no such thing".

## Integrity

Every reservation carries a digest over every field that could be tampered with
to free capacity, relocate a commitment or extend its life, using the same
canonical primitive positions and transitions use.

A tampered row makes the **availability question itself fail** rather than
dropping out of the sum — silently skipping it would release exactly the
capacity the tamper was after.

### What integrity does and does not cover

| Tamper | Detected |
| --- | --- |
| scope, status, expiry, action, source request, source mandate, digest | **yes** — availability fails closed |
| relocating a row to another holder, resource or right | at the tuple it was moved *to*; the origin's capacity is freed |
| deleting a row outright | **no** |

The last two are the same class: from the original tuple's point of view a
relocation *is* a deletion, and no per-row digest can detect a row that is no
longer there. This is the bound of what row-level integrity promises, and it is
stated rather than implied away. What it is **not** is a downgrade — the
resource stays enrolled and every other check still runs.

## Audit lineage

A reservation names the request, the decision and the mandate it stands for, so
the chain reconstructs end to end without duplicating any of them:

```
request ─▶ authority proofs ─▶ decision ─▶ reservation ─▶ mandate ─▶ execution ─▶ transition ─▶ consumed
                                                              └────▶ revocation ─▶ released
```

## Denial vocabulary

| Code | Means |
| --- | --- |
| `GOVERNED_AUTHORITY_AVAILABILITY_INSUFFICIENT` | The holder holds enough in total, but too much of it is already committed. The remedy is to wait or release — never to acquire more of the right. |
| `GOVERNED_AUTHORITY_INSUFFICIENT_SCOPE` | The holder never held enough at all. Unchanged. |
| `GOVERNED_AUTHORITY_RESERVATION_CONFLICT` | An idempotency key reused for a different commitment, or a release of a consumed one. |
| `GOVERNED_AUTHORITY_RESERVATION_NOT_FOUND` | No such reservation in this tenant. |
| `GOVERNED_AUTHORITY_RESERVATION_RECORD_CORRUPTED` | A stored row's digest does not match its contents. |

Losing the commitment race is **not** reported as a governance `denied` outcome.
The Kernel decided `allowed`, that decision is durably committed, and restating
it as a denial would misreport what governance concluded. What failed is the
commitment, after the decision and before any artifact existed — surfaced as the
authority layer's own code, exactly as an unconservable execution already was.

## Limitations, deliberately

- **No fairness.** There is no queue, no priority and no scheduler. Under
  contention, whichever commitment reaches the transaction first wins, and a
  loser is not retried on its behalf.
- **No inter-action conflict policy.** Generic reservation knows that two
  `TRANSFER`s of the same right compete. It does **not** know whether
  tokenizing 5 000 bp should conflict with collateralizing the same 5 000 bp —
  that requires an explicit typed policy about what those actions mean to each
  other, and inventing one here would be encoding a business assumption in
  generic accounting.
- **No long-lived encumbrance.** A reservation is *pre-execution* commitment
  safety. `COLLATERALIZE`'s encumbrance survives execution and would need its own
  model; overloading reservation to carry it would make "committed until
  execution" and "encumbered indefinitely afterwards" the same word.
- **No renewal or resizing.** Reservations are immutable except in status. If a
  mandate's validity is ever extended, a corresponding governed extension would
  be needed; there is none, because mandates cannot currently be extended.
- **No partial consumption.** A `TRANSFER` mandate's reservation is consumed
  whole when its execution completes.
- **Cross-deployment portability.** A reservation is deployment-local state. One
  Enterprise deployment cannot see or enforce another's commitments. That would
  be a Protocol concern, and it is out of scope.
