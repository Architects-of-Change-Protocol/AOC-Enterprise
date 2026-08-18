# AOC Governed Authority

The state AOC Enterprise keeps about **which governed right each party
controls**, how that authority arose, and how completed governed execution
changes it.

Companion to `docs/architecture/ADR-GOVERNED-AUTHORITY-TRANSITION.md`, which
records why each decision below was made rather than what it is.

## The bounded proposition

A governed authority position asserts exactly this:

> According to the governance state and evidence this AOC Enterprise
> deployment recognizes, Actor A has authority to exercise Scope S of Right R
> over Resource X, within a stated effective window.

It does **not** assert legal title, statutory ownership, beneficial interest,
registry truth, or recognition by any authority outside this deployment. There
is no ownership ledger, no title registry and no legal-owner record anywhere in
this layer, and their absence is deliberate: AOC maintains the authority state
its own enforcement machinery recognizes, which is sufficient for subsequent
automated governance and does not pretend to settle anything else. Legal title,
statutory ownership, external registry truth and cross-sovereignty recognition
remain separate evidentiary questions.

## Vocabulary

| Term | What it is |
| --- | --- |
| **Governed right** | Which right of an asset is engaged. The closed union in `@aoc-enterprise/governed-authorization`: `economic-interest`, `revenue-right`, `ownership-interest`, `usage-right`, `contractual-claim`. |
| **Governed rights scope** | How much of it, exactly. `proportional` (integer basis points) or `unitized` (integer units + denomination). Reused verbatim; never re-invented. |
| **Governed authority position** | What one party currently controls of one right of one resource. |
| **Governed authority basis** | Why. One of three: administrative bootstrap, recognized external evidence, or a governed execution. |
| **Governed authority transition** | One recorded change: a quantity of one right arriving at one party and, when the basis conserves, leaving another. |
| **Coverage** | The single verdict the enforcement path asks for and gets back. |

## Four artifacts that are easy to confuse

```
GovernedAuthorizationArtifact    Was action X authorized?           immutable, one decision
AuthorityGrant                   May this actor call action X?      administrative, scopes calling
GovernedAuthorityPosition        What right does this actor hold?   mutable, conserved
GovernedRepresentativeAuthority  May this actor exercise THAT       administrative, holder-bound
                                 holder's authority?
```

A mandate answers the first and never changes. An `AuthorityGrant` answers the
second and is issued administratively. A position answers the third — the
question neither of the other two could, and the one a completed `TRANSFER`
changes. A position may reference the mandate and execution that produced it;
it is neither of them.

The fourth was added afterwards, and the distinction between it and the third
is the one worth holding onto:

> **`GovernedAuthorityPosition` answers "who possesses the underlying governed
> authority?". `GovernedRepresentativeAuthority` answers "who may exercise that
> holder's authority?".**

They are separate records in separate stores consulted through separate Kernel
ports, and a delegated request needs an affirmative answer from both. Creating
or withdrawing a representation changes no position at all, and a representative
never acquires the holder's underlying right by acting for it. See
`AOC_GOVERNED_REPRESENTATIVE_AUTHORITY.md`.

## Positions

Identified by `(tenantId, actorRef, resourceKind, resourceId, governedRight)`.

- **One position per key, not lots.** Crediting a party that already holds the
  same right merges using the canonical scope sum: 1 000 bp plus 2 500 bp is one
  position of 3 500 bp. Provenance is preserved by the transition history, not
  by splitting the position.
- **Never negative.** A debit larger than the position is refused, never
  clamped — in the shared rules, inside the store transaction, and as a `CHECK`
  constraint in SQLite.
- **Never coerced.** A proportional share is not comparable with a unit count,
  and two unit denominations have no conversion. Both are refused.
- **Status is derived, not stored.** `pending` before `effectiveFrom`, `expired`
  at or after `expiresAt`, `exhausted` at zero, `active` otherwise.
- **`actorRef` is a party reference**, of the same kind the action terms use. The
  holder of an economic interest need not be an actor that can call anything, and
  the actor calling on its behalf need not hold anything.

## Authority basis vs action target

Two questions that come apart constantly:

- **Why may this actor act?** Recognition Runtime and the Authority Graph,
  unchanged.
- **What right is this action engaging, and does its holder control it?** The
  governed-authority resolver.

A portfolio manager submitting a transfer of Party A's economic interest needs
the first for itself and the second for Party A. Neither substitutes for the
other, and a delegated actor never acquires the holder's underlying right by
acting for it — delegation machinery is untouched.

`ActionDescriptor.governedAuthorityHolderRef` carries the distinction. It
defaults to the requesting actor; `TRANSFER` sets it to `terms.transferorRef`
and offers no override.

## What moves authority

> **Accepted external execution evidence.** Nothing earlier, nothing later.

- A **mandate** is permission to move a right. Permission that is never
  exercised moves nothing.
- A **lifecycle report** — `registered`, `reversed`, `corrected` — is an
  observation. An observation does not rewrite authority.
- The transition is built from what the evidence says **moved**, not from what
  the mandate permitted: authorize 2 500 bp, report 1 000 bp moved, and 1 000 bp
  moves.

Issuance — administrative bootstrap or recognized external evidence — is the
only operation that creates authority, is privileged (`context.system`), and is
reachable from no request path. **An actor can never obtain a position by
claiming one.**

## Conservation

```
Before:   Alice 10 000 bp    Bob 0
Transfer:                2 500 bp
After:    Alice  7 500 bp    Bob 2 500 bp      total 10 000 bp
```

```
Before:   Alice 100 units    Bob 0
Transfer:                 25 units
After:    Alice  75 units    Bob  25 units     denominations must match
```

The recognized total for a right is invariant under every conserving
transition. Only issuance changes it.

## Enforcement

The invariant a governed action must satisfy:

```
requested resource       covered by recognized resource authority   (Authority Graph)
AND requested right      covered by recognized governed-right authority
AND requested scope      contained within recognized authority scope
```

An action naming several rights needs authority over all of them. An action
that expresses no quantity for a right — `LICENSE`'s optional `rightsScope` —
requires the holder to hold *some* live authority over it, and **absence is
never read as 100%**.

Coverage outcomes and the reason codes they produce:

| Outcome | Meaning | Kernel reason code |
| --- | --- | --- |
| `covered` | proceeds | — |
| `resource_not_enrolled` | this deployment holds no authority state for the resource | — (see compatibility) |
| `no_right_authority` | holder controls none of this right, including exhausted | `AUTHORITY_GOVERNED_RIGHT_MISSING` |
| `insufficient_scope` | holds some, less than asked | `AUTHORITY_GOVERNED_SCOPE_EXCEEDED` |
| `incompatible_scope` | quantities not commensurable | `AUTHORITY_GOVERNED_SCOPE_EXCEEDED` |
| `expired` | position outside its window | `AUTHORITY_GOVERNED_AUTHORITY_EXPIRED` |

## Legacy compatibility

`AuthorityGrant` has never carried a governed-right field, so every grant in
every existing deployment is **legacy asset-scoped**. The policy is
**per-resource opt-in enrolment, one-way, failing closed**:

- A resource with **no** recorded positions is not enrolled. Behaviour is
  exactly what it was before this layer existed.
- A resource with **any** position enforces **every** governed right of it
  strictly — including rights nobody was bootstrapped into. Enrolling one right
  of an asset therefore closes the others rather than leaving them open.

| Question | Unenrolled resource | Enrolled resource |
| --- | --- | --- |
| Can a legacy grant authorize `TRANSFER` of an ownership interest? | Yes | Only if the named holder holds an ownership-interest position |
| Can a legacy grant authorize `LICENSE` of a usage right? | Yes | Only if the named holder holds a usage-right position |
| What narrows it? | Recording a position — a deliberate administrative act | Already narrow |

Deployments that have finished migrating set
`unenrolledResourcePolicy: 'deny'`, making unenrolled resources unreachable.

Holder-bound representation reuses this same enrolment signal rather than adding
a second compatibility policy of its own: a requester acting for a *different*
party must prove representation exactly where right-scoped authority is
enforced, and nowhere else. An existing action/resource `DelegationGrant` proves
the delegate may invoke the action; on an enrolled resource it does **not**, by
itself, prove which holder the delegate may act for. See
`AOC_GOVERNED_REPRESENTATIVE_AUTHORITY.md`, "Legacy compatibility".

## Where it sits

```
Governed Authority State  (positions + append-only transitions)
        |
        v
Governed Authority Resolver          one question, one coverage verdict
        |
        v
AocKernel   <--  Recognition Runtime  <--  Authority Graph      (unchanged)
        |
        v
TOKENIZE   COLLATERALIZE   LICENSE   TRANSFER
                                          |
                                    External execution
                                          |
                                   Authority Transition
                                     source -S / target +S
                                          |
                                    New authority state
                                          |
                                    Future enforcement
```

The Kernel runs the check after the existing chain, only against an outcome
that chain already found viable, and it can only **narrow** that outcome into a
denial. It never rescues a denial and never grants anything. `AocKernel`
remains the only component in AOC Enterprise that produces a decision — there
is no second kernel and no second authorization engine.

## Trust boundary

Execution evidence is not universal legal title. A committed transition means:

> AOC's recognized governed authority state changed, on the strength of
> evidence this deployment accepted.

It does not mean a registry was updated, a jurisdiction recognized anything, or
a movement occurred in the world. AOC never verified the movement; it recorded
what it was told, by whom, and when.

## Durability, concurrency, integrity

- In-memory and SQLite behind one behavioural contract, run twice by the same
  suite.
- SQLite conventions: `better-sqlite3`, `foreign_keys=ON`, `WAL`,
  `synchronous=FULL`, `busy_timeout`, schema-version guard, one transaction per
  mutating call.
- **Concurrency:** every check and write happen inside one transaction, so two
  concurrent 6 000 bp movements against a 10 000 bp position can never both
  commit. Cross-process writers are serialized by `UNIQUE` constraints.
- **Replay:** a transition is idempotent on its execution reference. Replaying
  an applied execution returns the original transitions — no second debit, no
  second credit — and a replay restating the movement differently is refused.
- **Integrity:** positions carry a store-computed digest recomputed on every
  read; transitions chain to their predecessor, so a removed or reordered
  transition is detectable. Tamper *evidence*, not a signature — the same limits
  the Governance Store documents.
- **Tenant isolation:** one tenant cannot read, consume, credit into, mutate or
  query another's authority state.

## Cross-store recovery

Transfer execution evidence and authority state are independent durable stores
and cannot share a transaction. Evidence commits **first**, so the survivable
failure is the safe one: authority under-credited, never credited without
evidence.

`TransferGovernanceService.reconcileAuthorityTransitions(mandateId)` repairs
the window. It is idempotent, safe to re-run without knowing whether it already
succeeded, and a no-op once every execution has moved authority.

## Reservation

A position answers how much a holder possesses. It deliberately does not change
when a mandate is issued — permission to move a right must not move it — which
means it cannot, on its own, answer how much of that authority is *still
uncommitted*. Three questions, kept apart:

> **`GovernedAuthorityPosition`** answers "how much underlying authority does
> Holder H possess?"
>
> **`GovernedAuthorityReservation`** answers "how much of that authority is
> already committed to still-live governed authorizations?"
>
> **Available governed authority** answers "how much can still be committed
> now?" — `held − committed`.

A reservation changes no position. Alice with 5 000 bp and a 3 000 bp
reservation still *holds* 5 000 bp; what changed is that only 2 000 bp remains
committable. It is not ownership, not a transfer, not delegation, not
representation and not a database lock.

Reservation applies to **`TRANSFER` only**, because `TRANSFER` is the only
governed action that debits a position. `TOKENIZE`, `COLLATERALIZE` and
`LICENSE` never call this store and therefore have no finite capacity for a
competing authorization to overpromise.

It is acquired atomically as the last step before a mandate is issued, and
consumed in the same transaction as the transition its execution causes. See
`AOC_GOVERNED_AUTHORITY_RESERVATION.md` and
`docs/architecture/ADR-GOVERNED-AUTHORITY-RESERVATION.md`.

## Not implemented, deliberately

- **Reversal.** Lifecycle evidence reporting a reversal produces no inverse
  transition. Reversing recognized authority is a governance act needing its own
  basis, not an inference from an observation.
- **Authority revocation.** Revoking a *mandate* stops future execution under
  it; revoking a *position* is a different event with no existing counterpart to
  mirror.
- **Protocolization, asset registration, title proof, notarization.** These may
  later become sources of positions. They are not here.
- **Inter-action conflict policy.** A committed collateralization does not
  reduce the underlying authority position. Whether an encumbrance should reduce
  transferable capacity depends on encumbrance semantics and deployment policy,
  and is not answered here.
- **A fifth governed action.** This is foundation work only.
